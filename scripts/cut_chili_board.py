#!/usr/bin/env python3
"""Cut the Board chili off the existing boardmatch painting.

Keeps the wet-soil pepper. Drops cream paper, the floor puddle, and the
painted stick limbs so the in-game rig can walk. Does not touch Painted
chili cuts or the Board radish.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
SRC_IDLE = ROOT / "public/concept-a/concept-a-chili-boardmatch-idle.png"
OUT = ROOT / "src/assets/concept-a/board"
DEBUG = ROOT / "scripts/chili-cut-debug"
META = OUT / "chili-atlas.json"


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


def fill_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    outside = np.zeros_like(mask)
    inv = ~mask
    stack: list[tuple[int, int]] = []
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
    while stack:
        cy, cx = stack.pop()
        if seen[cy, cx]:
            continue
        seen[cy, cx] = True
        outside[cy, cx] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w:
                continue
            if seen[ny, nx] or not inv[ny, nx]:
                continue
            stack.append((ny, nx))
    holes = inv & ~outside
    labels, sizes = label_components(holes)
    small = np.zeros_like(mask)
    limit = max(400, int(mask.size * 0.004))
    for i, s in enumerate(sizes):
        if 4 <= s <= limit:
            small |= labels == (i + 1)
    return mask | small


def largest(mask: np.ndarray) -> np.ndarray:
    labels, sizes = label_components(mask)
    if not sizes:
        return mask
    keep = int(np.argmax(sizes)) + 1
    return labels == keep


def bbox_of(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def dist_from_bg(fg: np.ndarray) -> np.ndarray:
    h, w = fg.shape
    inv = ~fg
    dist = np.full((h, w), 999.0, dtype=np.float32)
    dist[inv] = 0
    for _ in range(28):
        up = np.roll(dist, 1, 0)
        up[0, :] = 999
        down = np.roll(dist, -1, 0)
        down[-1, :] = 999
        left = np.roll(dist, 1, 1)
        left[:, 0] = 999
        right = np.roll(dist, -1, 1)
        right[:, -1] = 999
        dist = np.minimum(dist, np.minimum(np.minimum(up, down), np.minimum(left, right)) + 1)
        dist[inv] = 0
    return dist


def sprite_from_mask(rgb: np.ndarray, mask: np.ndarray, pad: int = 6) -> Image.Image:
    h, w = mask.shape
    x0, y0, x1, y1 = bbox_of(mask)
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    tile_rgb = rgb[y0:y1, x0:x1]
    tile_m = mask[y0:y1, x0:x1]
    alpha = np.zeros(tile_m.shape, dtype=np.uint8)
    alpha[tile_m] = 255
    fringe = dilate(tile_m, 1) & ~tile_m
    paper = rgb[:16, :].reshape(-1, 3).mean(axis=0)
    dist = np.sqrt(((tile_rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    alpha[fringe] = np.clip((dist[fringe] - 18.0) / 50.0 * 180.0, 0, 180).astype(np.uint8)
    out = np.zeros((tile_rgb.shape[0], tile_rgb.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = tile_rgb
    out[:, :, 3] = alpha
    return Image.fromarray(out, "RGBA")


def find_eyes(sprite: Image.Image) -> list[dict[str, float]]:
    """White eyes with dark pupils. The gloss highlight has no pupil — ignore it."""
    arr = np.array(sprite)
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    h, w = a.shape
    bright = (rgb.mean(axis=2) > 185) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 70) & (a > 100)
    yy, xx = np.mgrid[0:h, 0:w]
    # Eyes sit on the pepper face, below the stem gloss.
    bright &= (yy > h * 0.28) & (yy < h * 0.62) & (xx > w * 0.08) & (xx < w * 0.92)
    labels, sizes = label_components(bright)
    dark = (rgb.mean(axis=2) < 90) & (a > 100)
    blobs = []
    for i, s in enumerate(sizes):
        if s < 40 or s > 2400:
            continue
        ys, xs = np.where(labels == i + 1)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        bw, bh = x1 - x0, y1 - y0
        if bw > w * 0.34 or bh > h * 0.16 or bw < 8 or bh < 8:
            continue
        inside = dark[y0:y1, x0:x1]
        if int(inside.sum()) < 12:
            continue
        blobs.append(
            {
                "cx": round((x0 + x1) / 2 / w, 4),
                "cy": round((y0 + y1) / 2 / h, 4),
                "rx": round(max(bw, 8) / 2 / w, 4),
                "ry": round(max(bh, 6) / 2 / h, 4),
                "s": s,
            }
        )
    blobs.sort(key=lambda b: b["cy"])
    # Keep the pair that shares a row. Gloss never reaches this list.
    pair: list[dict[str, float]] = []
    for i, a_blob in enumerate(blobs):
        for b_blob in blobs[i + 1 :]:
            if abs(a_blob["cy"] - b_blob["cy"]) > 0.04:
                continue
            if abs(a_blob["cx"] - b_blob["cx"]) < 0.12:
                continue
            pair = [a_blob, b_blob]
            break
        if pair:
            break
    if not pair:
        pair = blobs[:2]
    pair.sort(key=lambda b: b["cx"])
    for b in pair:
        b.pop("s", None)
    return pair[:2]


def find_mouth(sprite: Image.Image) -> dict[str, float] | None:
    arr = np.array(sprite)
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    h, w = a.shape
    dark = (rgb.mean(axis=2) < 78) & (a > 120)
    yy, xx = np.mgrid[0:h, 0:w]
    dark &= (yy > h * 0.32) & (yy < h * 0.70) & (xx > w * 0.18) & (xx < w * 0.82)
    labels, sizes = label_components(dark)
    best = None
    best_s = 0
    for i, s in enumerate(sizes):
        if s < 6 or s > 700:
            continue
        ys, xs = np.where(labels == i + 1)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        bw, bh = x1 - x0, y1 - y0
        if bw < bh * 1.15:
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


def trim_stick_shelves(im: Image.Image) -> Image.Image:
    """Drop flat brown sticks that stick out of the pepper (arm and leg nubs).

    A shelf is a run of rows whose silhouette edge is flat, then jumps inward.
    The pepper's own taper is not flat-then-jump, so the tip stays.
    """
    arr = np.array(im)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    fg = alpha > 25
    left = np.full(h, -1, np.int32)
    right = np.full(h, -1, np.int32)
    for y in range(h):
        xs = np.where(fg[y])[0]
        if len(xs):
            left[y] = int(xs.min())
            right[y] = int(xs.max())

    def shelves(edge: np.ndarray, inward: int) -> list[tuple[int, int, int, int]]:
        found: list[tuple[int, int, int, int]] = []
        y = 1
        while y < h - 1:
            if edge[y] < 0:
                y += 1
                continue
            y0 = y
            while y < h - 1 and edge[y] >= 0 and abs(int(edge[y]) - int(edge[y0])) <= 1:
                y += 1
            run = y - y0
            if run >= 10 and y < h - 1 and y0 > int(h * 0.2) and y0 < int(h * 0.9):
                jump_at = None
                for k in range(y, min(h, y + 12)):
                    if edge[k] < 0:
                        continue
                    if (int(edge[k]) - int(edge[y0])) * inward >= 6:
                        jump_at = k
                        break
                if jump_at is not None:
                    # Walk the start back through the outward ramp into the shelf.
                    start = y0
                    while start > 1 and edge[start - 1] >= 0:
                        prev = int(edge[start - 1])
                        here = int(edge[start])
                        if (here - prev) * inward > 0 or abs(here - prev) <= 1:
                            if (int(edge[y0]) - prev) * inward > 1:
                                start -= 1
                                continue
                        break
                    found.append((start, jump_at, int(edge[start]), int(edge[jump_at])))
            y += 1
        return found

    out = arr.copy()
    removed = 0
    for y0, jump, e0, e1 in shelves(left, 1):
        span = max(1, jump - y0)
        for y in range(y0, min(h, jump + 1)):
            limit = int(round(e0 + (e1 - e0) * (y - y0) / span)) + 1
            xs = np.where((np.arange(w) < limit) & (out[y, :, 3] > 0))[0]
            if len(xs):
                out[y, xs, 3] = 0
                removed += len(xs)
    for y0, jump, e0, e1 in shelves(right, -1):
        span = max(1, jump - y0)
        for y in range(y0, min(h, jump + 1)):
            limit = int(round(e0 + (e1 - e0) * (y - y0) / span)) - 1
            xs = np.where((np.arange(w) > limit) & (out[y, :, 3] > 0))[0]
            if len(xs):
                out[y, xs, 3] = 0
                removed += len(xs)
    print("trimmed stick shelves", removed)
    return Image.fromarray(out, "RGBA")


def pad_for_legs(im: Image.Image, frac: float = 0.12) -> Image.Image:
    """Transparent rows under the pepper tip so planted feet sit below the vegetable."""
    arr = np.array(im)
    pad = max(28, int(round(arr.shape[0] * frac)))
    out = np.zeros((arr.shape[0] + pad, arr.shape[1], 4), dtype=np.uint8)
    out[: arr.shape[0]] = arr
    print("padded legs", pad, "px \u2192", out.shape[1], out.shape[0])
    return Image.fromarray(out, "RGBA")


def anchor_from_edge(mask: np.ndarray, y: int, side: float) -> dict[str, float]:
    h, w = mask.shape
    y = int(np.clip(y, 0, h - 1))
    for dy in range(0, 12):
        for yy in (y + dy, y - dy):
            if yy < 0 or yy >= h:
                continue
            xs = np.where(mask[yy])[0]
            if len(xs) < 4:
                continue
            x = float(xs.min() if side < 0 else xs.max())
            # Sit the joint on the outline, a hair inward.
            x = x + (6 if side < 0 else -6)
            return {"cx": round(x / w, 4), "cy": round(yy / h, 4)}
    return {"cx": 0.2 if side < 0 else 0.8, "cy": round(y / h, 4)}


def save_preview(name: str, im: Image.Image) -> None:
    DEBUG.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGB", im.size, (255, 0, 255))
    preview.paste(im, mask=im.split()[-1])
    preview.save(DEBUG / name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    DEBUG.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC_IDLE).convert("RGB")
    rgb = np.array(im)
    h, w = rgb.shape[:2]
    print("source", SRC_IDLE.name, w, h)

    hue, sat, val = hsv(rgb)
    paper = rgb[:18, :].reshape(-1, 3).mean(axis=0).astype(np.float32)
    dist_paper = np.sqrt(((rgb.astype(np.float32) - paper) ** 2).sum(axis=2))
    red = ((hue < 22) | (hue > 345)) & (sat > 0.38) & (val > 0.18) & (val < 0.97)
    green = (hue > 55) & (hue < 150) & (sat > 0.22) & (val > 0.14) & (val < 0.85)
    brown = (hue > 12) & (hue < 50) & (sat > 0.22) & (val > 0.12) & (val < 0.62)
    ink = (val < 0.28) & (sat < 0.45) & (dist_paper > 40)
    seed = red | green
    allowed = seed | ink | (brown & (dist_paper > 55)) | ((dist_paper > 78) & (val < 0.55))
    ring = dilate(seed, 8) & (dist_paper > 36)
    allowed = close(largest(allowed | ring), 2)
    allowed = fill_holes(allowed)

    overlay = rgb.copy()
    overlay[allowed] = (overlay[allowed] * 0.45 + np.array([40, 220, 80]) * 0.55).astype(np.uint8)
    Image.fromarray(overlay).save(DEBUG / "chili-board-figure-mask.png")

    portrait = sprite_from_mask(rgb, allowed, pad=10)
    # Drop the floor puddle from the portrait too — in-game contact shadow is live.
    parr = np.array(portrait)
    prgb = parr[:, :, :3]
    pa = parr[:, :, 3]
    ph, pw = pa.shape
    phue, psat, pval = hsv(prgb)
    veg = (((phue < 22) | (phue > 345)) & (psat > 0.38) & (pval > 0.18)) | (
        (phue > 55) & (phue < 150) & (psat > 0.22) & (pval > 0.14)
    )
    vys = np.where(veg & (pa > 40))[0]
    if len(vys):
        cut = int(vys.min() + (vys.max() - vys.min()) * 0.93)
        yy = np.arange(ph)[:, None]
        puddle = (yy >= cut) & (psat < 0.28)
        parr[:, :, 3] = np.where(puddle, 0, pa)
        portrait = Image.fromarray(parr, "RGBA")

    port_path = OUT / "chili-portrait.png"
    portrait.save(port_path)
    save_preview("chili-board-portrait-preview.png", portrait)
    print("portrait", portrait.size, "opaque", int(np.array(portrait)[:, :, 3].sum() / 255))

    # Body: start from the portrait crop, keep thick pepper + stem, drop sticks.
    arr = np.array(portrait)
    rgb_p = arr[:, :, :3]
    a = arr[:, :, 3]
    bh, bw = a.shape
    fg = a > 40
    hue_p, sat_p, val_p = hsv(rgb_p)
    red_p = ((hue_p < 22) | (hue_p > 345)) & (sat_p > 0.38) & (val_p > 0.18) & (val_p < 0.97) & fg
    green_p = (hue_p > 55) & (hue_p < 150) & (sat_p > 0.22) & (val_p > 0.14) & (val_p < 0.85) & fg
    dist = dist_from_bg(fg)
    thick = fg & (dist >= 6)
    body = dilate(thick, 3) & fg
    body |= green_p
    body |= red_p

    xs = np.where(body.mean(0) > 0.08)[0]
    x0, x1 = int(xs.min()), int(xs.max())
    arm_y0, arm_y1 = int(bh * 0.36), int(bh * 0.72)
    arms = np.zeros_like(fg)
    arms[arm_y0:arm_y1, : x0 + 8] = fg[arm_y0:arm_y1, : x0 + 8]
    arms[arm_y0:arm_y1, x1 - 8 :] = fg[arm_y0:arm_y1, x1 - 8 :]
    thin_brown = (hue_p > 12) & (hue_p < 50) & (sat_p > 0.18) & (val_p < 0.62) & fg & (dist < 5.5)
    body &= ~arms
    body &= ~thin_brown

    hip = int(bh * 0.82)
    yy = np.arange(bh)[:, None]
    xx = np.arange(bw)[None, :]
    body &= (yy < hip) | (red_p & (dist >= 4) & (xx > bw * 0.28) & (xx < bw * 0.72))
    body = largest(body)
    body &= xx > bw * 0.10
    body &= xx < bw * 0.90

    out = arr.copy()
    out[:, :, 3] = np.where(body, a, 0).astype(np.uint8)
    fringe = dilate(body, 1) & ~body & fg
    out[:, :, 3] = np.where(fringe, np.minimum(out[:, :, 3] + 80, a // 2), out[:, :, 3])
    body_im = Image.fromarray(out, "RGBA")
    # Tight crop so the rig canvas is the pepper, not leftover paper.
    body_im = sprite_from_mask(out[:, :, :3], out[:, :, 3] > 20, pad=4)
    body_im = trim_stick_shelves(body_im)
    body_arr = np.array(body_im)
    body_im = sprite_from_mask(body_arr[:, :, :3], body_arr[:, :, 3] > 20, pad=2)
    pepper_h = body_im.size[1]
    body_im = pad_for_legs(body_im, 0.12)
    body_path = OUT / "chili-body.png"
    body_im.save(body_path)
    save_preview("chili-board-body-preview.png", body_im)
    print("body", body_im.size, "opaque", int(np.array(body_im)[:, :, 3].sum() / 255))

    eyes = find_eyes(body_im)
    mouth = find_mouth(body_im)
    bw2, bh2 = body_im.size
    print("eyes", eyes)
    print("mouth", mouth)

    if len(eyes) >= 2:
        eye_l, eye_r = eyes[0], eyes[1]
    elif len(eyes) == 1:
        eye_l = eyes[0]
        eye_r = {**eyes[0], "cx": round(1 - eyes[0]["cx"], 4)}
    else:
        eye_l = {"cx": 0.28, "cy": 0.37, "rx": 0.07, "ry": 0.025}
        eye_r = {"cx": 0.69, "cy": 0.37, "rx": 0.07, "ry": 0.025}

    if mouth is None or mouth["cy"] < eye_l["cy"]:
        mouth = {"cx": 0.50, "cy": round(eye_l["cy"] + 0.07, 4), "rw": 0.12, "rh": 0.014}

    mask = np.array(body_im)[:, :, 3] > 20
    face_y = (eye_l["cy"] + eye_r["cy"]) / 2
    # Arms leave the pepper just under the smile. Hips sit on the lower pepper
    # so the padded rows are leg, and the feet land under the tip.
    sh_px = int(face_y * bh2 + pepper_h * 0.12)
    hip_px = int(pepper_h * 0.84)
    sh_l = anchor_from_edge(mask, sh_px, -1)
    sh_r = anchor_from_edge(mask, sh_px, 1)
    hip_l = anchor_from_edge(mask, hip_px, -1)
    hip_r = anchor_from_edge(mask, hip_px, 1)
    # Pull hips in so the sticks come out from under the pepper, not the outline.
    hip_l["cx"] = round(min(0.46, hip_l["cx"] + 0.08), 4)
    hip_r["cx"] = round(max(0.54, hip_r["cx"] - 0.08), 4)
    # Full sprite is the pepper plus the leg pad. Pepper stays about 3.55 radii tall.
    height_mul = round(3.55 * bh2 / max(1, pepper_h), 2)
    rig = {
        "w": bw2,
        "h": bh2,
        "eyeL": eye_l,
        "eyeR": eye_r,
        "mouth": mouth,
        "browL": {"x0": 0.30, "y0": eye_l["cy"] - 0.04, "x1": 0.44, "y1": eye_l["cy"] - 0.02},
        "browR": {"x0": 0.70, "y0": eye_r["cy"] - 0.04, "x1": 0.56, "y1": eye_r["cy"] - 0.02},
        "shL": sh_l,
        "shR": sh_r,
        "hipL": hip_l,
        "hipR": hip_r,
        "ground": round((bh2 - 4) / bh2, 4),
        "hasBrows": False,
        "eyeFill": "#f7f1e8",
        "body": "#d44532",
        "limb": "#6a4630",
        "fist": "#5c3c28",
        "foot": "#5a3a26",
        "ink": "#2a1814",
        "sclera": "#f7f1e8",
        "lid": "#c43a2c",
        "heightMul": height_mul,
        "strideMul": 0.72,
    }

    meta = {
        "sourceIdle": "public/concept-a/concept-a-chili-boardmatch-idle.png",
        "sourceSheet": "public/concept-a/concept-a-chili-boardmatch-sheet.png",
        "portrait": "chili-portrait.png",
        "body": "chili-body.png",
        "rig": rig,
    }
    META.write_text(json.dumps(meta, indent=2) + "\n")
    print("wrote", META)


if __name__ == "__main__":
    main()
