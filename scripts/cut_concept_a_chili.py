#!/usr/bin/env python3
"""Cut Concept A chili figures off cream paper into transparent sprite frames."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
SRC_SHEET = ROOT / "public/concept-a/concept-a-chili-sheet.png"
SRC_IDLE = ROOT / "public/concept-a/concept-a-chili-idle.png"
OUT_DIR = ROOT / "src/assets/concept-a"
META_PATH = OUT_DIR / "chili-atlas.json"
DEBUG_DIR = ROOT / "scripts/chili-cut-debug"

SHEET_NAMES = [
    "idle-smile",
    "idle-teeter",
    "idle-smirk",
    "walk-0",
    "walk-1",
    "walk-2",
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


def veg_seed(rgb: np.ndarray) -> np.ndarray:
    h, s, v = hsv(rgb)
    # Tight chroma so cream-paper stains (pale green / tan) do not seed.
    red = ((h < 22) | (h > 345)) & (s > 0.40) & (v > 0.18) & (v < 0.96)
    green = (h > 55) & (h < 145) & (s > 0.28) & (v > 0.16) & (v < 0.82)
    return red | green


def grow_from_seed(rgb: np.ndarray, seed: np.ndarray) -> np.ndarray:
    """Keep vegetable paint plus nearby ink/limbs; drop cream paper and floor stain."""
    paper = rgb[:18, :].reshape(-1, 3).mean(axis=0).astype(np.float32)
    dist = np.sqrt(((rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    v = rgb.astype(np.float32).mean(axis=2) / 255.0
    allowed = seed | (dist > 78) | (v < 0.42)
    # Grow a ring around the vegetable so thin arms, stem outline, and feet come along.
    ring = dilate(seed, 7) & (dist > 42)
    allowed = allowed | ring
    # Connected to the seed only, so isolated paper stains stay out.
    labels, sizes = label_components(allowed)
    keep = np.zeros_like(seed)
    seed_labels = np.unique(labels[seed])
    for lab in seed_labels:
        if lab == 0:
            continue
        keep |= labels == lab
    keep = close(keep, 2)
    keep = fill_holes(keep)
    # Floor stain is a low-chroma puddle under the feet. Drop it so in-game
    # shadows don't double up, while keeping red/brown legs and ink outlines.
    _h, s, v = hsv(rgb)
    veg = veg_seed(rgb)
    vys = np.where(veg & keep)[0]
    if len(vys):
        veg_top = int(vys.min())
        veg_bot = int(vys.max())
        cut = veg_top + int((veg_bot - veg_top) * 0.90)
        yy = np.arange(keep.shape[0])[:, None]
        keep = np.where(yy >= cut, keep & veg, keep)
    return keep


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Keep eye whites and other enclosed paint that chroma-key treats as paper."""
    h, w = mask.shape
    outside = np.zeros_like(mask)
    stack = []
    inv = ~mask
    for x in range(w):
        if inv[0, x]:
            stack.append((0, x))
        if inv[h - 1, x]:
            stack.append((h - 1, x))
    for y in range(h):
        if inv[y, 0]:
            stack.append((y, 0))
        if inv[y, w - 1]:
            stack.append((y, w - 1))
    seen = np.zeros_like(mask)
    for y, x in stack:
        if seen[y, x]:
            continue
        seen[y, x] = True
        q = [(y, x)]
        while q:
            cy, cx = q.pop()
            outside[cy, cx] = True
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = cy + dy, cx + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w:
                    continue
                if seen[ny, nx] or not inv[ny, nx]:
                    continue
                seen[ny, nx] = True
                q.append((ny, nx))
    holes = inv & ~outside
    labels, sizes = label_components(holes)
    small = np.zeros_like(mask)
    # Eyes are tiny enclosed whites. The gap between legs is huge — leave it.
    limit = max(120, int(mask.size * 0.0015))
    for i, s in enumerate(sizes):
        if 6 <= s <= limit:
            small |= labels == (i + 1)
    return mask | small


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


def figure_boxes(mask: np.ndarray, expect: int) -> list[tuple[int, int, int, int]]:
    labels, sizes = label_components(mask)
    if not sizes:
        return []
    order = np.argsort(sizes)[::-1]
    picked: list[tuple[int, int, int, int]] = []
    for idx in order[:expect]:
        lab = int(idx) + 1
        picked.append(bbox_of(labels, lab))
    picked.sort(key=lambda b: b[0])
    return picked


def sprite_from_box(rgb: np.ndarray, mask: np.ndarray, box: tuple[int, int, int, int], pad: int = 10) -> Image.Image:
    h, w = mask.shape
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    tile_rgb = rgb[y0:y1, x0:x1]
    tile_m = mask[y0:y1, x0:x1]
    # Largest blob in the crop.
    labels, sizes = label_components(tile_m)
    if sizes:
        best = int(np.argmax(sizes)) + 1
        tile_m = labels == best
    alpha = np.zeros(tile_m.shape, dtype=np.uint8)
    alpha[tile_m] = 255
    # Soft fringe: pixels in a 1px dilated ring fade by paper distance.
    fringe = dilate(tile_m, 1) & ~tile_m
    paper = rgb[:12, :].reshape(-1, 3).mean(axis=0)
    dist = np.sqrt(((tile_rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    alpha[fringe] = np.clip((dist[fringe] - 18.0) / 50.0 * 180.0, 0, 180).astype(np.uint8)
    out = np.zeros((tile_rgb.shape[0], tile_rgb.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = tile_rgb
    out[:, :, 3] = alpha
    ys, xs = np.where(alpha > 20)
    tx0, ty0 = int(xs.min()), int(ys.min())
    tx1, ty1 = int(xs.max()) + 1, int(ys.max()) + 1
    m = 2
    tx0, ty0 = max(0, tx0 - m), max(0, ty0 - m)
    tx1, ty1 = min(out.shape[1], tx1 + m), min(out.shape[0], ty1 + m)
    return Image.fromarray(out[ty0:ty1, tx0:tx1], "RGBA")


def pad_to_canvas(spr: Image.Image, cw: int, ch: int) -> Image.Image:
    """Feet on the baseline, horizontally centered by opaque mass."""
    arr = np.array(spr)
    a = arr[:, :, 3]
    ys, xs = np.where(a > 40)
    if len(xs) == 0:
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(spr, ((cw - spr.width) // 2, ch - spr.height))
        return canvas
    cx = int(xs.mean())
    bottom = int(ys.max())
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    dest_x = cw // 2 - cx
    dest_y = ch - 8 - bottom
    canvas.alpha_composite(spr, (dest_x, dest_y))
    return canvas


def find_eyes(sprite: Image.Image) -> list[dict[str, float]]:
    arr = np.array(sprite)
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    h, w = a.shape
    bright = (rgb.mean(axis=2) > 200) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 48) & (a > 120)
    yy, xx = np.mgrid[0:h, 0:w]
    bright &= (yy > h * 0.22) & (yy < h * 0.52) & (xx > w * 0.12) & (xx < w * 0.88)
    labels, sizes = label_components(bright)
    blobs = []
    dark = (rgb.mean(axis=2) < 90) & (a > 120)
    for i, s in enumerate(sizes):
        if s < 10 or s > 2200:
            continue
        x0, y0, x1, y1 = bbox_of(labels, i + 1)
        bw, bh = x1 - x0, y1 - y0
        if bw > w * 0.22 or bh > h * 0.12 or bw < 4 or bh < 4:
            continue
        pad = 2
        region = dark[max(0, y0 - pad) : min(h, y1 + pad), max(0, x0 - pad) : min(w, x1 + pad)]
        if region.size == 0 or int(region.sum()) < 4:
            continue  # specular highlight, not an eye
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


def find_mouth(sprite: Image.Image) -> dict[str, float] | None:
    arr = np.array(sprite)
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    h, w = a.shape
    dark = (rgb.mean(axis=2) < 78) & (a > 120)
    yy, xx = np.mgrid[0:h, 0:w]
    dark &= (yy > h * 0.34) & (yy < h * 0.62) & (xx > w * 0.2) & (xx < w * 0.8)
    labels, sizes = label_components(dark)
    best = None
    best_s = 0
    for i, s in enumerate(sizes):
        if s < 8 or s > 500:
            continue
        x0, y0, x1, y1 = bbox_of(labels, i + 1)
        bw, bh = x1 - x0, y1 - y0
        if bw < bh * 1.3:
            continue
        if s > best_s:
            best_s = s
            best = {
                "cx": round((x0 + x1) / 2 / w, 4),
                "cy": round((y0 + y1) / 2 / h, 4),
                "rw": round(bw / 2 / w, 4),
                "rh": round(max(bh, 3) / 2 / h, 4),
            }
    return best


def save_debug(name: str, rgb: np.ndarray, mask: np.ndarray) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    overlay = rgb.copy()
    overlay[mask] = (overlay[mask] * 0.45 + np.array([40, 220, 80]) * 0.55).astype(np.uint8)
    Image.fromarray(overlay).save(DEBUG_DIR / f"{name}-mask.png")


def process_image(path: Path, expect: int, debug_name: str) -> tuple[np.ndarray, np.ndarray, list[tuple[int, int, int, int]]]:
    im = Image.open(path).convert("RGB")
    rgb = np.array(im)
    seed = veg_seed(rgb)
    mask = grow_from_seed(rgb, seed)
    save_debug(debug_name, rgb, mask)
    boxes = figure_boxes(mask, expect)
    print(path.name, "boxes", len(boxes))
    for i, b in enumerate(boxes):
        print(" ", i, b, "w", b[2] - b[0], "h", b[3] - b[1])
    return rgb, mask, boxes


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rgb, mask, boxes = process_image(SRC_SHEET, 6, "sheet")
    if len(boxes) != 6:
        raise SystemExit(f"expected 6 sheet figures, got {len(boxes)}")

    raw: list[Image.Image] = [sprite_from_box(rgb, mask, b) for b in boxes]
    max_w = max(s.width for s in raw)
    max_h = max(s.height for s in raw)
    # Shared canvas so walk/idle feet sit on one baseline.
    cw = max_w + 8
    ch = max_h + 10
    print("canvas", cw, ch)

    frames: dict[str, dict] = {}
    for name, spr in zip(SHEET_NAMES, raw, strict=True):
        aligned = pad_to_canvas(spr, cw, ch)
        path = OUT_DIR / f"chili-{name}.png"
        aligned.save(path)
        rec = {
            "file": path.name,
            "w": aligned.size[0],
            "h": aligned.size[1],
            "eyes": find_eyes(aligned),
            "mouth": find_mouth(aligned),
        }
        frames[name] = rec
        print("saved", path.name, aligned.size, "opaque", int(np.array(aligned)[:, :, 3].sum() / 255), "eyes", rec["eyes"], "mouth", rec["mouth"])
        preview = Image.new("RGB", aligned.size, (255, 0, 255))
        preview.paste(aligned, mask=aligned.split()[-1])
        preview.save(DEBUG_DIR / f"{name}-preview.png")

    irdb, imask, iboxes = process_image(SRC_IDLE, 1, "idle")
    if not iboxes:
        raise SystemExit("no idle chili")
    portrait_raw = sprite_from_box(irdb, imask, iboxes[0], pad=14)
    # Keep portrait native (gate card). Do not force sheet canvas.
    portrait_path = OUT_DIR / "chili-portrait.png"
    portrait_raw.save(portrait_path)
    frames["portrait"] = {
        "file": portrait_path.name,
        "w": portrait_raw.size[0],
        "h": portrait_raw.size[1],
        "eyes": find_eyes(portrait_raw),
        "mouth": find_mouth(portrait_raw),
    }
    print("saved portrait", portrait_raw.size, "opaque", int(np.array(portrait_raw)[:, :, 3].sum() / 255), frames["portrait"]["eyes"])
    preview = Image.new("RGB", portrait_raw.size, (255, 0, 255))
    preview.paste(portrait_raw, mask=portrait_raw.split()[-1])
    preview.save(DEBUG_DIR / "portrait-preview.png")

    meta = {
        "sourceSheet": "public/concept-a/concept-a-chili-sheet.png",
        "sourceIdle": "public/concept-a/concept-a-chili-idle.png",
        "canvas": {"w": cw, "h": ch},
        "frames": frames,
        "idleCycle": ["idle-smile", "idle-teeter"],
        "walkCycle": ["walk-0", "walk-1", "walk-2"],
        "hit": "idle-smirk",
        "portrait": "portrait",
    }
    META_PATH.write_text(json.dumps(meta, indent=2) + "\n")
    print("wrote", META_PATH)


if __name__ == "__main__":
    main()