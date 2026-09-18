#!/usr/bin/env python3
"""Cut the magenta Concept A radish off the wet-soil board and anim row 1."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
SRC_BOARD = ROOT / "public/concept-a/mud-concept-a-wet-soil.png"
SRC_SHEET = ROOT / "public/concept-a/concept-a-board-anim-sheet.png"
OUT_DIR = ROOT / "src/assets/concept-a/board"
DEBUG_DIR = ROOT / "scripts/chili-cut-debug"
META_PATH = OUT_DIR / "radish-atlas.json"

SHEET_NAMES = [
    "idle-0",  # angry stand
    "blink",  # eyes closed, stem curl
    "walk-0",
    "walk-1",
    "walk-2",
    "idle-1",  # bounce / arms in
]


def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    a = rgb.astype(np.float32) / 255.0
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = np.max(a, axis=2)
    mn = np.min(a, axis=2)
    df = np.maximum(mx - mn, 1e-8)
    hue = np.zeros_like(mx)
    m = mx == r
    hue[m] = ((g - b)[m] / df[m]) % 6
    m = mx == g
    hue[m] = (b - r)[m] / df[m] + 2
    m = mx == b
    hue[m] = (r - g)[m] / df[m] + 4
    sat = np.where(mx == 0, 0.0, df / (mx + 1e-8))
    return hue * 60.0, sat, mx


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            rolled = np.roll(np.roll(mask, dy, 0), dx, 1)
            if dy < 0:
                rolled[dy:, :] = False
            elif dy > 0:
                rolled[:dy, :] = False
            if dx < 0:
                rolled[:, dx:] = False
            elif dx > 0:
                rolled[:, :dx] = False
            out |= rolled
    return out


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    return ~dilate(~mask, r) if r > 0 else mask


def close(mask: np.ndarray, r: int) -> np.ndarray:
    return erode(dilate(mask, r), r)


def label_components(mask: np.ndarray) -> tuple[np.ndarray, list[int]]:
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    current = 0
    sizes: list[int] = []
    visited = np.zeros_like(mask, dtype=bool)
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs, strict=True):
        if visited[y, x]:
            continue
        current += 1
        stack = [(int(y), int(x))]
        visited[y, x] = True
        count = 0
        while stack:
            cy, cx = stack.pop()
            labels[cy, cx] = current
            count += 1
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = cy + dy, cx + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w:
                    continue
                if visited[ny, nx] or not mask[ny, nx]:
                    continue
                visited[ny, nx] = True
                stack.append((ny, nx))
        sizes.append(count)
    return labels, sizes


def bbox_of(labels: np.ndarray, lab: int) -> tuple[int, int, int, int]:
    ys, xs = np.where(labels == lab)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def paper_mean(rgb: np.ndarray) -> np.ndarray:
    return rgb[:16, :].reshape(-1, 3).mean(axis=0).astype(np.float32)


def fg_from_paper(rgb: np.ndarray, dist_min: float = 48.0) -> np.ndarray:
    paper = paper_mean(rgb)
    dist = np.sqrt(((rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    _h, s, v = hsv(rgb)
    return (dist > dist_min) & (v < 0.94)


def fill_small_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    inv = ~mask
    seen = np.zeros_like(mask)
    q: list[tuple[int, int]] = []
    for x in range(w):
        if inv[0, x]:
            q.append((0, x))
        if inv[h - 1, x]:
            q.append((h - 1, x))
    for y in range(h):
        if inv[y, 0]:
            q.append((y, 0))
        if inv[y, w - 1]:
            q.append((y, w - 1))
    outside = np.zeros_like(mask)
    while q:
        cy, cx = q.pop()
        if seen[cy, cx]:
            continue
        seen[cy, cx] = True
        if not inv[cy, cx]:
            continue
        outside[cy, cx] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and inv[ny, nx]:
                q.append((ny, nx))
    holes = inv & ~outside
    labels, sizes = label_components(holes)
    small = np.zeros_like(mask)
    limit = 320
    for i, s in enumerate(sizes):
        if 6 <= s <= limit:
            small |= labels == (i + 1)
    return mask | small


def largest_in(mask: np.ndarray) -> np.ndarray:
    labels, sizes = label_components(mask)
    if not sizes:
        return mask
    best = int(np.argmax(sizes)) + 1
    return labels == best


def magenta_seed(rgb: np.ndarray) -> np.ndarray:
    h, s, v = hsv(rgb)
    pink = ((h > 300) | (h < 20)) & (s > 0.28) & (v > 0.22) & (v < 0.92)
    mud = (h > 18) & (h < 50) & (s > 0.22) & (s < 0.72) & (v > 0.12) & (v < 0.62)
    return pink | mud


def grow(rgb: np.ndarray, seed: np.ndarray) -> np.ndarray:
    paper = paper_mean(rgb)
    dist = np.sqrt(((rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    v = rgb.astype(np.float32).mean(axis=2) / 255.0
    allowed = seed | (dist > 72) | ((v < 0.42) & (dist > 36))
    ring = dilate(seed, 6) & (dist > 36)
    allowed = allowed | ring
    labels, _sizes = label_components(allowed)
    keep = np.zeros_like(seed)
    for lab in np.unique(labels[seed]):
        if lab == 0:
            continue
        keep |= labels == lab
    keep = close(keep, 2)
    keep = fill_small_holes(keep)
    # Drop the pale floor puddle under the feet; keep mud on the body.
    hh, s, v = hsv(rgb)
    pink = ((hh > 310) | (hh < 18)) & (s > 0.28) & (v > 0.22)
    vys = np.where(pink & keep)[0]
    if len(vys):
        cut = int(vys.min() + (vys.max() - vys.min()) * 0.90)
        yy = np.arange(keep.shape[0])[:, None]
        keep = np.where(yy >= cut, keep & (pink | ((v < 0.38) & (s > 0.25))), keep)
    return largest_in(keep)


def sprite_from_mask(rgb: np.ndarray, mask: np.ndarray, pad: int = 8) -> Image.Image:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise SystemExit("empty mask")
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(rgb.shape[1], x1 + pad)
    y1 = min(rgb.shape[0], y1 + pad)
    tile = rgb[y0:y1, x0:x1]
    m = mask[y0:y1, x0:x1]
    m = largest_in(m)
    alpha = np.zeros(m.shape, dtype=np.uint8)
    alpha[m] = 255
    fringe = dilate(m, 1) & ~m
    paper = paper_mean(rgb)
    dist = np.sqrt(((tile.astype(np.float32) - paper) ** 2).sum(axis=2))
    alpha[fringe] = np.clip((dist[fringe] - 16.0) / 46.0 * 180.0, 0, 180).astype(np.uint8)
    out = np.zeros((tile.shape[0], tile.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = tile
    out[:, :, 3] = alpha
    ys, xs = np.where(alpha > 20)
    tx0, ty0 = max(0, int(xs.min()) - 2), max(0, int(ys.min()) - 2)
    tx1, ty1 = min(out.shape[1], int(xs.max()) + 3), min(out.shape[0], int(ys.max()) + 3)
    return Image.fromarray(out[ty0:ty1, tx0:tx1], "RGBA")


def pad_to_canvas(spr: Image.Image, cw: int, ch: int) -> Image.Image:
    arr = np.array(spr)
    a = arr[:, :, 3]
    ys, xs = np.where(a > 40)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    if len(xs) == 0:
        canvas.alpha_composite(spr, ((cw - spr.width) // 2, ch - spr.height))
        return canvas
    cx = int(xs.mean())
    bottom = int(ys.max())
    dest_x = cw // 2 - cx
    dest_y = ch - 8 - bottom
    canvas.alpha_composite(spr, (dest_x, dest_y))
    return canvas


def find_eyes(sprite: Image.Image) -> list[dict[str, float]]:
    arr = np.array(sprite)
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    h, w = a.shape
    bright = (rgb.mean(axis=2) > 198) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 50) & (a > 120)
    yy, xx = np.mgrid[0:h, 0:w]
    bright &= (yy > h * 0.12) & (yy < h * 0.48) & (xx > w * 0.12) & (xx < w * 0.88)
    labels, sizes = label_components(bright)
    dark = (rgb.mean(axis=2) < 90) & (a > 120)
    blobs = []
    for i, s in enumerate(sizes):
        if s < 8 or s > 1800:
            continue
        x0, y0, x1, y1 = bbox_of(labels, i + 1)
        bw, bh = x1 - x0, y1 - y0
        if bw > w * 0.28 or bh > h * 0.14 or bw < 4:
            continue
        region = dark[max(0, y0 - 2) : min(h, y1 + 2), max(0, x0 - 2) : min(w, x1 + 2)]
        if region.size == 0 or int(region.sum()) < 3:
            continue
        blobs.append(
            {
                "cx": round((x0 + x1) / 2 / w, 4),
                "cy": round((y0 + y1) / 2 / h, 4),
                "rx": round(max(bw, 8) / 2 / w, 4),
                "ry": round(max(bh, 6) / 2 / h, 4),
            }
        )
    blobs.sort(key=lambda b: b["cx"])
    return blobs[:2]


def sample_lid(sprite: Image.Image) -> str:
    arr = np.array(sprite)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    h, s, v = hsv(rgb)
    body = (a > 180) & (((h > 300) | (h < 20)) & (s > 0.3))
    if body.sum() < 40:
        body = a > 200
    pix = rgb[body]
    if len(pix) == 0:
        return "#c45a78"
    c = np.median(pix, axis=0).astype(int)
    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"


def preview(spr: Image.Image, name: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGB", spr.size, (255, 0, 255))
    bg.paste(spr, mask=spr.split()[-1])
    bg.save(DEBUG_DIR / f"{name}-preview.png")


def extract_board_radish() -> Image.Image:
    im = Image.open(SRC_BOARD).convert("RGB")
    rgb = np.array(im)
    h, w, _ = rgb.shape
    # Fifth figure: skip title, keep the lineup band, right of pumpkin / left of cabbage.
    band = np.zeros((h, w), dtype=bool)
    band[190:560, 880:1055] = True
    h, s, v = hsv(rgb)
    # Body is magenta-red (HSV hue wraps near 0). Do not seed mud or the cabbage.
    seed = ((h > 310) | (h < 18)) & (s > 0.28) & (v > 0.22) & (v < 0.92) & band
    if seed.sum() < 800:
        raise SystemExit(f"board radish seed too small: {seed.sum()}")
    mask = grow(rgb, seed)
    mask = largest_in(mask & dilate(band, 12))
    print("board radish pixels", int(mask.sum()))
    ys, xs = np.where(mask)
    print(" board bbox", int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    return sprite_from_mask(rgb, mask, pad=10)


def extract_sheet_row() -> list[Image.Image]:
    im = Image.open(SRC_SHEET).convert("RGB")
    rgb = np.array(im)
    h, w, _ = rgb.shape
    # Row 1 of 3 on the 1280x720 sheet.
    y0, y1 = 10, 255
    frames = []
    for i in range(6):
        x0 = int(w * (0.04 + i * 0.155))
        x1 = int(w * (0.04 + (i + 1) * 0.155))
        cell = np.zeros((h, w), dtype=bool)
        cell[y0:y1, max(0, x0) : min(w, x1)] = True
        seed = magenta_seed(rgb) & cell
        if seed.sum() < 80:
            seed = fg_from_paper(rgb) & cell
        mask = grow(rgb, seed)
        mask &= dilate(cell, 8)
        mask = largest_in(mask)
        ys, xs = np.where(mask)
        print(f" sheet {i} pix", int(mask.sum()), "bbox", int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        frames.append(sprite_from_mask(rgb, mask, pad=8))
    return frames


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    portrait = extract_board_radish()
    frames = extract_sheet_row()

    recs: dict[str, dict] = {}
    portrait_path = OUT_DIR / "radish-portrait.png"
    portrait.save(portrait_path)
    recs["portrait"] = {
        "file": portrait_path.name,
        "w": portrait.size[0],
        "h": portrait.size[1],
        "eyes": find_eyes(portrait),
        "lid": sample_lid(portrait),
    }
    preview(portrait, "radish-portrait")
    print("portrait", recs["portrait"])

    max_w = max(f.width for f in frames)
    max_h = max(f.height for f in frames)
    cw, ch = max_w + 8, max_h + 10
    print("sheet canvas", cw, ch)

    for name, spr in zip(SHEET_NAMES, frames, strict=True):
        aligned = pad_to_canvas(spr, cw, ch)
        p = OUT_DIR / f"radish-{name}.png"
        aligned.save(p)
        recs[name] = {
            "file": p.name,
            "w": cw,
            "h": ch,
            "eyes": find_eyes(aligned),
            "lid": sample_lid(aligned),
        }
        preview(aligned, f"radish-{name}")
        print(name, recs[name]["eyes"], recs[name]["lid"])

    meta = {
        "sourceBoard": "public/concept-a/mud-concept-a-wet-soil.png",
        "sourceSheet": "public/concept-a/concept-a-board-anim-sheet.png",
        "canvas": {"w": cw, "h": ch},
        "lid": recs["portrait"]["lid"],
        "frames": recs,
        "idleCycle": ["idle-0", "idle-1"],
        "walkCycle": ["walk-0", "walk-1", "walk-2"],
        "blink": "blink",
        "portrait": "portrait",
        "hit": "idle-0",
    }
    META_PATH.write_text(json.dumps(meta, indent=2) + "\n")
    print("wrote", META_PATH)


if __name__ == "__main__":
    main()
