#!/usr/bin/env python3
"""Split the board radish portrait into a body (no limbs) plus rig landmarks.

Does not delete the existing full-frame cuts. Run after cut_concept_a_radish.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
OUT = ROOT / "src/assets/concept-a/board"
PORTRAIT = OUT / "radish-portrait.png"
META = OUT / "radish-atlas.json"
DEBUG = ROOT / "scripts/chili-cut-debug"


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


def main() -> None:
    im = Image.open(PORTRAIT).convert("RGBA")
    arr = np.array(im)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3]
    fg = a > 40
    DEBUG.mkdir(parents=True, exist_ok=True)

    # Distance from background — thick body vs thin limbs.
    inv = ~fg
    dist = np.full((h, w), 999.0, dtype=np.float32)
    dist[inv] = 0
    for _ in range(24):
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

    thick = fg & (dist >= 7)
    body = dilate(thick, 4) & fg

    # Keep the stem (top-center thin pixels).
    stem_band = np.zeros_like(fg)
    stem_band[: int(h * 0.22), int(w * 0.28) : int(w * 0.72)] = True
    body |= fg & stem_band

    # Drop arms: side protrusions in the mid band.
    arm_y0, arm_y1 = int(h * 0.30), int(h * 0.64)
    xs = np.where(body.mean(0) > 0.12)[0]
    x0, x1 = int(xs.min()), int(xs.max())
    arms = np.zeros_like(fg)
    arms[arm_y0:arm_y1, : x0 + 10] = fg[arm_y0:arm_y1, : x0 + 10]
    arms[arm_y0:arm_y1, x1 - 10 :] = fg[arm_y0:arm_y1, x1 - 10 :]
    body &= ~arms

    # Drop legs: keep a short central mud skirt, nothing below the hem.
    hip = int(h * 0.78)
    hem = int(h * 0.84)
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    skirt = (yy >= hip) & (yy < hem) & (xx > w * 0.30) & (xx < w * 0.70) & fg
    body &= yy < hip
    body |= skirt & (dist >= 5)

    # Isolated fists / crumbs.
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    sizes: list[int] = []
    vis = np.zeros_like(body)
    ys, xs_pt = np.where(body)
    for y, x in zip(ys, xs_pt, strict=True):
        if vis[y, x]:
            continue
        cur += 1
        stack = [(int(y), int(x))]
        vis[y, x] = True
        n = 0
        while stack:
            cy, cx = stack.pop()
            labels[cy, cx] = cur
            n += 1
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = cy + dy, cx + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w:
                    continue
                if vis[ny, nx] or not body[ny, nx]:
                    continue
                vis[ny, nx] = True
                stack.append((ny, nx))
        sizes.append(n)
    if sizes:
        keep_lab = int(np.argmax(sizes)) + 1
        body = labels == keep_lab

    # Final side trim so leftover fists cannot hang off the mud.
    body &= xx > w * 0.17
    body &= xx < w * 0.83
    # Round the hem so the cut isn't a flat slab.
    cx, cy, rx, ry = w * 0.5, h * 0.48, w * 0.42, h * 0.40
    ellipse = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.08
    body &= (yy < hip) | ellipse

    out = arr.copy()
    out[:, :, 3] = np.where(body, a, 0).astype(np.uint8)
    # Soft fringe
    fringe = dilate(body, 1) & ~body & fg
    out[:, :, 3] = np.where(fringe, np.minimum(out[:, :, 3] + 90, a // 2), out[:, :, 3])

    body_im = Image.fromarray(out, "RGBA")
    body_path = OUT / "radish-body.png"
    body_im.save(body_path)

    preview = Image.new("RGB", (w, h), (255, 0, 255))
    preview.paste(body_im, mask=body_im.split()[-1])
    preview.save(DEBUG / "radish-body-preview.png")

    rig = {
        "w": w,
        "h": h,
        "eyeL": {"cx": 0.339, "cy": 0.364, "rx": 0.084, "ry": 0.044},
        "eyeR": {"cx": 0.631, "cy": 0.366, "rx": 0.084, "ry": 0.044},
        "mouth": {"cx": 0.483, "cy": 0.458, "rw": 0.09, "rh": 0.022},
        "browL": {"x0": 0.28, "y0": 0.318, "x1": 0.40, "y1": 0.348},
        "browR": {"x0": 0.70, "y0": 0.318, "x1": 0.58, "y1": 0.348},
    "shL": {"cx": 0.34, "cy": 0.54},
    "shR": {"cx": 0.66, "cy": 0.54},
    "hipL": {"cx": 0.42, "cy": 0.835},
    "hipR": {"cx": 0.58, "cy": 0.835},
        "ground": 0.995,
        "body": "#d07080",
        "limb": "#b54b58",
        "fist": "#c45a62",
        "foot": "#6a3a28",
        "ink": "#2a1814",
        "sclera": "#f3eee4",
        "lid": "#bf4e4c",
    }

    meta = json.loads(META.read_text())
    meta["rig"] = rig
    meta["body"] = "radish-body.png"
    META.write_text(json.dumps(meta, indent=2) + "\n")
    print("wrote", body_path, "pixels", int(body.sum()))
    print("wrote", META)


if __name__ == "__main__":
    main()
