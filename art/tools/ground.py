#!/usr/bin/env python3
"""Seamless 512x512 ground tile from 'garden ground.jpg'.

1. centre square crop
2. flatten low-frequency lighting (the painting is darker at the top / vignetted)
3. offset-blend seams: the half-rolled copy is continuous across the tile borders, the original
   is continuous across the centre cross; blend between them with a narrow diamond-shaped
   transition so detail stays crisp (no full-tile ghosting)
4. resize to 512, write tile + 2x2 check image
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def make_tile(src, out_dir, size=512):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    s = min(w, h)
    x0, y0 = (w - s) // 2, (h - s) // 2
    a = np.asarray(im.crop((x0, y0, x0 + s, y0 + s))).astype(np.float32)
    # 2: flatten lighting (per-channel ratio to a very soft blur, partial strength)
    low = np.stack([ndi.gaussian_filter(a[..., c], s / 6, mode="wrap") for c in range(3)], -1)
    mean = a.reshape(-1, 3).mean(0)
    a = a * (mean / np.maximum(low, 1)) ** 0.9
    # 3: seam blend
    N = s
    rolled = np.roll(a, (N // 2, N // 2), (0, 1))
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d_border = np.minimum.reduce([xx, yy, N - 1 - xx, N - 1 - yy])        # where `a` has seams
    d_cross = np.minimum(np.abs(xx - N / 2), np.abs(yy - N / 2))           # where `rolled` has seams
    band = N * 0.07
    t = np.clip((d_border - d_cross) / band * 0.5 + 0.5, 0, 1)
    t = t * t * (3 - 2 * t)
    out = a * t[..., None] + rolled * (1 - t[..., None])
    # restore a little micro-contrast lost in the blend zone
    blur = np.stack([ndi.gaussian_filter(out[..., c], 1.2, mode="wrap") for c in range(3)], -1)
    mix = 4 * t * (1 - t)  # 1 in the transition, 0 elsewhere
    out = out + (out - blur) * 0.6 * mix[..., None]
    out = np.clip(out, 0, 255).astype(np.uint8)
    tile = Image.fromarray(out).resize((size, size), Image.LANCZOS)
    os.makedirs(out_dir, exist_ok=True)
    tile.save(os.path.join(out_dir, "ground-garden.png"), optimize=True)
    tile.save(os.path.join(out_dir, "ground-garden.webp"), quality=90)
    big = Image.fromarray(out).resize((size * 2, size * 2), Image.LANCZOS)
    big.save(os.path.join(out_dir, "ground-garden@2x.png"), optimize=True)
    return tile


def check_image(tile, path):
    w, h = tile.size
    c = Image.new("RGB", (w * 2, h * 2))
    for i in range(2):
        for j in range(2):
            c.paste(tile, (i * w, j * h))
    c.save(path)


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "/workspace/bro/art-src/raw/garden ground.jpg"
    out = sys.argv[2] if len(sys.argv) > 2 else "/workspace/bro/art"
    t = make_tile(src, os.path.join(out, "public", "sprites"))
    os.makedirs(os.path.join(out, "previews"), exist_ok=True)
    check_image(t, os.path.join(out, "previews", "ground-garden_2x2-check.png"))
    print("ok")
