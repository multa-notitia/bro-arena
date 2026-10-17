#!/usr/bin/env python3
"""Check every public/sprites/*.json against the rules of src/render/sheets.ts parseManifest()
and drawActorSheet() (frame cell must lie inside the image), plus file presence."""
import json, os, sys
from PIL import Image

KNOWN = {"idle", "walk", "hurt", "attack", "death"}
root = sys.argv[1] if len(sys.argv) > 1 else "/workspace/bro/art"
d = os.path.join(root, "public", "sprites")
ok = True
for f in sorted(os.listdir(d)):
    if not f.endswith(".json"):
        continue
    m = json.load(open(os.path.join(d, f)))
    errs = []
    if not isinstance(m.get("image"), str): errs.append("image")
    fw, fh = m.get("frameWidth"), m.get("frameHeight")
    if not (isinstance(fw, (int, float)) and fw > 0 and isinstance(fh, (int, float)) and fh > 0): errs.append("frame size")
    img_path = os.path.join(d, m["image"])
    if not os.path.exists(img_path): errs.append("missing " + m["image"])
    else:
        W, H = Image.open(img_path).size
        cols = m.get("columns") or max(1, W // fw)
        for cn, c in m["clips"].items():
            if not c.get("frames"): errs.append(f"{cn}: no frames")
            for fr in c["frames"]:
                i = fr["i"]; col, row = i % cols, i // cols
                if col * fw + fw > W + 0.5 or row * fh + fh > H + 0.5: errs.append(f"{cn}: cell {i} outside image")
                if fr["ms"] < 1: errs.append(f"{cn}: ms")
    known = KNOWN & set(m["clips"])
    note = "" if known else "  (no stock clip names -> needs a by-name clip player)"
    extra = sorted(set(m["clips"]) - KNOWN)
    print(f"{'OK ' if not errs else 'ERR'} {f:24s} stock clips={sorted(known)}" + (f" custom={extra}" if extra else "") + note)
    for e in errs: print("    ", e); ok = False
sys.exit(0 if ok else 1)
