"""spritekit: keying, segmentation, registration and packing for Bro painted sheets.

Pure numpy / scipy / Pillow. No game code is touched; this only writes PNG/WebP/JSON.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

# ----------------------------------------------------------------------------
# colour
# ----------------------------------------------------------------------------

def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """uint8/float RGB (...,3) -> CIE Lab (D65)."""
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]], np.float32)
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883], np.float32)
    e = 216 / 24389
    k = 24389 / 27
    f = np.where(xyz > e, np.cbrt(xyz), (k * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    """CIE Lab -> float RGB 0..255."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200
    e = 216 / 24389
    k = 24389 / 27
    def finv(f):
        f3 = f ** 3
        return np.where(f3 > e, f3, (116 * f - 16) / k)
    xyz = np.stack([finv(fx), np.where(L > k * e, fy ** 3, L / k), finv(fz)], -1)
    xyz *= np.array([0.95047, 1.0, 1.08883], np.float32)
    m = np.array([[3.2404542, -1.5371385, -0.4985314],
                  [-0.9692660, 1.8760108, 0.0415560],
                  [0.0556434, -0.2040259, 1.0572252]], np.float32)
    c = xyz @ m.T
    c = np.clip(c, 0, 1)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return np.clip(c * 255, 0, 255)


# ----------------------------------------------------------------------------
# keying
# ----------------------------------------------------------------------------

@dataclass
class KeyParams:
    t0: float | None = None   # Lab distance at/below which pixel is pure bg (auto if None)
    t1: float | None = None   # distance at/above which pixel is fully opaque (auto)
    erode: int = 1            # px of alpha erosion (kills JPEG fringe)
    feather: float = 0.6      # gaussian sigma on alpha after erosion
    despill_band: int = 3     # px band from the edge where pink spill is removed
    min_area: int = 10        # drop opaque specks smaller than this (source px)
    chroma_band: int = 2      # px band whose chroma is re-taken from the interior (JPEG 4:2:0)
    pastel_fix: bool = False  # sheets where pale pink can never be legit (mud enemies): neutralise it


def sample_bg(rgb: np.ndarray, patch: int = 24) -> np.ndarray:
    h, w, _ = rgb.shape
    cs = [rgb[:patch, :patch], rgb[:patch, -patch:], rgb[-patch:, :patch], rgb[-patch:, -patch:]]
    return np.median(np.concatenate([c.reshape(-1, 3) for c in cs]), 0)


def key_sheet(rgb: np.ndarray, kp: KeyParams = KeyParams()) -> tuple[np.ndarray, dict]:
    """Return straight-alpha RGBA float32 [0..1] and stats."""
    rgbf = rgb.astype(np.float32)
    bg = sample_bg(rgb)
    lab = srgb_to_lab(rgbf)
    bg_lab = srgb_to_lab(bg[None, None, :].astype(np.float32))[0, 0]
    d = np.linalg.norm(lab - bg_lab, axis=-1)
    # noise floor from the corners -> tolerance
    p = 24
    corner = np.concatenate([d[:p, :p].ravel(), d[:p, -p:].ravel(), d[-p:, :p].ravel(), d[-p:, -p:].ravel()])
    floor = float(np.percentile(corner, 99.7))
    t0 = kp.t0 if kp.t0 is not None else max(9.0, floor * 1.35)
    t1 = kp.t1 if kp.t1 is not None else t0 + 26.0
    a = np.clip((d - t0) / (t1 - t0), 0, 1)
    a = a * a * (3 - 2 * a)  # smoothstep

    # drop tiny specks (JPEG blocks in the bg)
    solid = a > 0.5
    lab_, n = ndi.label(solid, structure=np.ones((3, 3)))
    if n:
        areas = ndi.sum(solid, lab_, index=np.arange(1, n + 1))
        small = np.zeros(n + 1, bool)
        small[1:] = areas < kp.min_area
        kill = small[lab_]
        # also clear the soft halo around killed specks
        kill = ndi.binary_dilation(kill, iterations=2) & ~ndi.binary_dilation(solid & ~kill, iterations=1)
        a[kill] = 0

    # unpremultiply against the bg colour: I = a*F + (1-a)*bg
    aa = np.maximum(a, 1e-3)[..., None]
    fg = (rgbf - (1 - a[..., None]) * bg[None, None, :]) / aa
    fg = np.clip(fg, 0, 255)
    fg = np.where(a[..., None] > 0.995, rgbf, fg)

    # erode + feather alpha (kills the 1px JPEG ring that is a pink/ink blend)
    if kp.erode > 0:
        a = ndi.grey_erosion(a, size=(2 * kp.erode + 1, 2 * kp.erode + 1))
    if kp.feather > 0:
        a = ndi.gaussian_filter(a, kp.feather)
        a = np.clip((a - 0.04) / 0.96, 0, 1)

    # despill: inside a band from the edge, push magenta (R&B >> G) back to neutral
    inside = a > 0.02
    dist = ndi.distance_transform_edt(inside)
    band = inside & (dist <= kp.despill_band + 0.5)
    R, G, B = fg[..., 0], fg[..., 1], fg[..., 2]
    spill = np.clip(np.minimum(R, B) - G, 0, None)
    # how "bg-like" the hue is: bg is R>>G, B~R/2 ; only magenta-ish (B substantial) counts
    magenta = np.clip((B - 0.25 * R) / (0.25 * R + 1), 0, 1)
    amt = spill * magenta * band
    fg[..., 0] = R - amt
    fg[..., 2] = B - amt
    # also darken leftover pure bg-ish colour in the band toward ink
    lab_fg = srgb_to_lab(np.clip(fg, 0, 255))
    dd = np.linalg.norm(lab_fg - bg_lab, axis=-1)
    near = band & (dd < t1)
    a[near] *= np.clip((dd[near] - t0) / (t1 - t0), 0, 1)

    # chroma bleed: JPEG 4:2:0 smears pink chroma ~2px into the figure. Re-take the chroma
    # (Lab a,b) of the outer band from the nearest interior pixel, keep the band's own lightness.
    if kp.chroma_band > 0:
        core = a > 0.98
        core = ndi.binary_erosion(core, iterations=kp.chroma_band)
        if core.any():
            _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
            dcore = ndi.distance_transform_edt(~core)
            sel = (a > 0.0) & ~core & (dcore <= kp.chroma_band + 2.5)
            labf = srgb_to_lab(np.clip(fg, 0, 255))
            src = labf[iy, ix]
            # only pull chroma if the band pixel is shifted toward the key hue
            bg_dir = bg_lab[1:] / (np.linalg.norm(bg_lab[1:]) + 1e-6)
            shift = ((labf[..., 1:] - src[..., 1:]) @ bg_dir)
            w = np.clip(shift / 6.0, 0, 1) * sel
            labf[..., 1] = labf[..., 1] * (1 - w) + src[..., 1] * w
            labf[..., 2] = labf[..., 2] * (1 - w) + src[..., 2] * w
            fg = np.where(sel[..., None], lab_to_srgb(labf), fg)
        # thin light features (spray droplets, sparks) have no interior to borrow chroma from:
        # light + pink-hued + far from any core -> desaturate (they were painted white/cream).
        dcore = ndi.distance_transform_edt(~core) if core.any() else np.full(a.shape, 99.0)
        labf = srgb_to_lab(np.clip(fg, 0, 255))
        hue = np.degrees(np.arctan2(labf[..., 2], labf[..., 1]))
        thin = (a > 0) & (dcore > kp.chroma_band + 2.5)
        pinkish = (labf[..., 0] > 50) & (hue > -45) & (hue < 45)
        selt = thin & pinkish
        if selt.any():
            labf[..., 1] = np.where(selt, labf[..., 1] * 0.22, labf[..., 1])
            labf[..., 2] = np.where(selt, labf[..., 2] * 0.22 + 4, labf[..., 2])
            fg = np.where(selt[..., None], lab_to_srgb(labf), fg)

    if kp.pastel_fix:
        # pale / mid pinks that the painter blended into the key colour (mud spray, dust wisps).
        # Light ones -> cream, mid ones -> rotate hue into the mud-brown family.
        labf = srgb_to_lab(np.clip(fg, 0, 255))
        hue = np.degrees(np.arctan2(labf[..., 2], labf[..., 1]))
        chroma = np.hypot(labf[..., 1], labf[..., 2])
        L = labf[..., 0]
        selp = (a > 0) & (L > 35) & (hue > -50) & (hue < 45) & (chroma > 5) & (chroma < 46)
        if selp.any():
            light = selp & (L > 55)
            mid = selp & ~light
            # light -> cream
            na = np.where(light, labf[..., 1] * 0.2, labf[..., 1])
            nb = np.where(light, labf[..., 2] * 0.2 + 6, labf[..., 2])
            # mid -> brown (hue 58, chroma 0.7x), blended by how pink it was
            wpink = np.clip((45 - hue) / 20, 0, 1)
            h2 = np.radians(hue + (58 - hue) * wpink)
            c2 = chroma * (1 - 0.3 * wpink)
            na = np.where(mid, c2 * np.cos(h2), na)
            nb = np.where(mid, c2 * np.sin(h2), nb)
            labf[..., 1], labf[..., 2] = na, nb
            fg = np.where(selp[..., None], lab_to_srgb(labf), fg)

    out = np.dstack([fg / 255.0, a]).astype(np.float32)
    out[..., :3][a <= 0] = 0
    return out, {"bg": bg.round(1).tolist(), "t0": round(t0, 2), "t1": round(t1, 2), "floor": round(floor, 2)}


def halo_score(rgba: np.ndarray, bg_rgb=(224, 0, 122)) -> int:
    """Count visible pixels whose colour is still close to the key colour."""
    a = rgba[..., 3]
    vis = a > 0.08
    if not vis.any():
        return 0
    lab = srgb_to_lab(np.clip(rgba[..., :3] * 255, 0, 255))
    bg_lab = srgb_to_lab(np.array(bg_rgb, np.float32)[None, None])[0, 0]
    d = np.linalg.norm(lab - bg_lab, axis=-1)
    return int((vis & (d < 30)).sum())


# ----------------------------------------------------------------------------
# segmentation
# ----------------------------------------------------------------------------

@dataclass
class Piece:
    cell: int
    rgba: np.ndarray          # cropped straight-alpha float RGBA
    box: tuple                # (x0,y0,x1,y1) in sheet px
    contact: float            # contact row (sheet px) - feet / ground line
    torso: tuple              # (x,y) torso centre (sheet px)
    centroid: tuple


def segment(rgba: np.ndarray, cols: int, rows: int, merge_px: int = 10, cells_box=None) -> list[Piece]:
    """Connected-component segmentation; detached parts are assigned to the grid cell
    holding their centroid, so leaves, sparks and slash arcs stay with their figure even if
    they poke across the nominal grid line."""
    h, w = rgba.shape[:2]
    a = rgba[..., 3]
    solid = a > 0.35
    grown = ndi.binary_dilation(solid, iterations=merge_px)
    lab, n = ndi.label(grown, structure=np.ones((3, 3)))
    pieces = []
    if n == 0:
        return pieces
    x0b, y0b, x1b, y1b = cells_box or (0, 0, w, h)
    cw = (x1b - x0b) / cols
    ch = (y1b - y0b) / rows
    owner = np.full(n + 1, -1)
    mass = ndi.sum(solid, lab, index=np.arange(1, n + 1))
    coms = ndi.center_of_mass(solid, lab, index=np.arange(1, n + 1))
    for k in range(1, n + 1):
        if mass[k - 1] < 1:
            continue
        cy, cx = coms[k - 1]
        c = int(np.clip((cx - x0b) // cw, 0, cols - 1))
        r = int(np.clip((cy - y0b) // ch, 0, rows - 1))
        owner[k] = r * cols + c
    for cell in range(cols * rows):
        ks = np.where(owner == cell)[0]
        m = np.isin(lab, ks) & (a > 0.0)
        if not m.any():
            pieces.append(None)
            continue
        ys, xs = np.where(m)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = rgba[y0:y1, x0:x1].copy()
        crop[..., 3] *= m[y0:y1, x0:x1]
        pieces.append(measure(cell, crop, (x0, y0, x1, y1)))
    return pieces


def main_body(mask: np.ndarray) -> np.ndarray:
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n <= 1:
        return mask
    sizes = ndi.sum(mask, lab, index=np.arange(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def measure(cell: int, crop: np.ndarray, box) -> Piece:
    x0, y0 = box[0], box[1]
    m = crop[..., 3] > 0.5
    body = ndi.binary_fill_holes(main_body(m))
    # contact = lowest row of the main body with real width (ignores drips / single specks)
    rows_w = body.sum(1)
    thr = max(3, 0.12 * rows_w.max())
    idx = np.where(rows_w >= thr)[0]
    contact = (idx.max() + 1) if len(idx) else body.shape[0]
    # torso = centre of the thickest part (distance transform peak), robust to weapons/limbs
    dt = ndi.distance_transform_edt(body)
    peak = dt.max()
    ys, xs = np.where(dt >= peak * 0.82)
    tx, ty = xs.mean(), ys.mean()
    cy, cx = ndi.center_of_mass(m)
    return Piece(cell, crop, box, y0 + contact, (x0 + tx, y0 + ty), (x0 + cx, y0 + cy))


# ----------------------------------------------------------------------------
# resampling / placement
# ----------------------------------------------------------------------------

def premul(rgba):
    out = rgba.copy()
    out[..., :3] *= out[..., 3:4]
    return out


def unpremul(rgba):
    out = rgba.copy()
    a = np.maximum(out[..., 3:4], 1e-6)
    out[..., :3] = np.where(out[..., 3:4] > 1e-4, out[..., :3] / a, 0)
    return np.clip(out, 0, 1)


def resize_rgba(rgba: np.ndarray, scale: float) -> np.ndarray:
    """Premultiplied Lanczos resize (no dark/pink fringes from straight-alpha filtering)."""
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    p = premul(rgba)
    chans = []
    for c in range(4):
        im = Image.fromarray(p[..., c].astype(np.float32), mode="F")
        chans.append(np.asarray(im.resize((nw, nh), Image.LANCZOS)))
    return unpremul(np.clip(np.dstack(chans), 0, 1))


def paste(dst: np.ndarray, src: np.ndarray, x: float, y: float):
    """Alpha-over src onto dst (both straight float RGBA) at subpixel position (x,y)=top-left."""
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    if abs(fx) > 1e-3 or abs(fy) > 1e-3:
        p = premul(src)
        p = ndi.shift(np.pad(p, ((1, 1), (1, 1), (0, 0))), (fy, fx, 0), order=1)
        src = unpremul(np.clip(p, 0, 1))
        ix -= 1
        iy -= 1
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    sx0, sy0 = max(0, -ix), max(0, -iy)
    dx0, dy0 = max(0, ix), max(0, iy)
    sx1, sy1 = min(w, W - ix), min(h, H - iy)
    if sx1 <= sx0 or sy1 <= sy0:
        return 0
    s = src[sy0:sy1, sx0:sx1]
    d = dst[dy0:dy0 + (sy1 - sy0), dx0:dx0 + (sx1 - sx0)]
    sa = s[..., 3:4]
    da = d[..., 3:4]
    oa = sa + da * (1 - sa)
    oc = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    d[..., :3] = np.where(oa > 0, oc, 0)
    d[..., 3:4] = oa
    # clipped amount (to detect parts cut off by the cell)
    lost = src[..., 3].sum() - s[..., 3].sum()
    return float(lost)


def pot(n: int) -> int:
    return 1 << max(0, (int(n) - 1).bit_length())


def choose_columns(n: int, fw: int, fh: int) -> int:
    best = None
    for c in range(1, n + 1):
        r = math.ceil(n / c)
        W, H = pot(c * fw), pot(r * fh)
        key = (W * H, abs(math.log2(W / H)), -c)
        if best is None or key < best[0]:
            best = (key, c)
    return best[1]


def pack(cells: list[np.ndarray], fw: int, fh: int, columns: int | None = None):
    n = len(cells)
    cols = columns or choose_columns(n, fw, fh)
    rows = math.ceil(n / cols)
    W, H = pot(cols * fw), pot(rows * fh)
    atlas = np.zeros((H, W, 4), np.float32)
    for i, c in enumerate(cells):
        r, cc = divmod(i, cols)
        atlas[r * fh:(r + 1) * fh, cc * fw:(cc + 1) * fw] = c
    return atlas, cols


def to_image(rgba: np.ndarray) -> Image.Image:
    out = np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8)
    out[..., :3][out[..., 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def save_atlas(rgba: np.ndarray, path_noext: str):
    im = to_image(rgba)
    im.save(path_noext + ".png", optimize=True)
    im.save(path_noext + ".webp", quality=92, alpha_quality=100, method=6, exact=False)
    return im


def tint(rgba: np.ndarray, color=(1.0, 0.97, 0.9), amt: float = 0.75) -> np.ndarray:
    out = rgba.copy()
    out[..., :3] = out[..., :3] * (1 - amt) + np.array(color, np.float32) * amt
    return out


def glow(rgba: np.ndarray, color=(1.0, 0.95, 0.6), radius: float = 6.0, strength: float = 0.7) -> np.ndarray:
    """Soft halo behind the icon (painted into the cell)."""
    a = rgba[..., 3]
    halo = ndi.gaussian_filter(ndi.grey_dilation(a, size=(3, 3)), radius)
    halo = np.clip(halo * strength * 1.8, 0, strength)
    base = np.zeros_like(rgba)
    base[..., :3] = color
    base[..., 3] = halo
    paste(base, rgba, 0, 0)
    return base
