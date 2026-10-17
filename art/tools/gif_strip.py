#!/usr/bin/env python3
"""Debug helper: lay out every frame of a GIF in a grid PNG (to eyeball timing/jitter)."""
import sys
from PIL import Image, ImageSequence, ImageDraw

def strip(path, out, cols=8, scale=1.0, every=1):
    im = Image.open(path)
    fr = [(f.convert("RGB"), f.info.get("duration", 0)) for f in ImageSequence.Iterator(im)][::every]
    w, h = int(fr[0][0].width * scale), int(fr[0][0].height * scale)
    rows = (len(fr) + cols - 1) // cols
    o = Image.new("RGB", (w * cols, h * rows))
    d = ImageDraw.Draw(o)
    for k, (f, du) in enumerate(fr):
        o.paste(f.resize((w, h)), ((k % cols) * w, (k // cols) * h))
        d.text(((k % cols) * w + 3, (k // cols) * h + h - 12), f"{k}:{du}ms", fill=(255, 255, 0))
    o.save(out)

if __name__ == "__main__":
    strip(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8,
          float(sys.argv[4]) if len(sys.argv) > 4 else 1.0, int(sys.argv[5]) if len(sys.argv) > 5 else 1)
