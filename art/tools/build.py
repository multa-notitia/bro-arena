#!/usr/bin/env python3
"""Build game-ready sprite sheets + animation JSON for Bro from painted pink-bg sheets.

usage:  python3 tools/build.py [--src DIR] [--out DIR] [--only id1,id2] [--no-previews]

Defaults: --src /workspace/bro/art-src/raw   --out /workspace/bro/art
Writes  <out>/public/sprites/<id>.{json,png,webp}  and  <out>/previews/*.gif|png
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spritekit as sk  # noqa: E402
from sheets_config import SHEETS  # noqa: E402

ICON_GLOW = {
    "xpSmall": (0.62, 1.0, 0.3), "xpLarge": (0.62, 1.0, 0.3), "coin": (1.0, 0.85, 0.35),
    "heart": (1.0, 0.38, 0.28), "crate": (1.0, 0.86, 0.55), "magnet": (1.0, 0.55, 0.42),
    "bomb": (1.0, 0.62, 0.22), "chest": (1.0, 0.84, 0.4),
}


def game_fit(r: float, frame: int) -> float:
    """Exactly what sheets.ts drawActorSheet does: snapScale(r*2.35/max(fw,fh))."""
    s = r * 2.35 / frame
    return max(0.25, math.floor(s * 2 + 0.5) / 2)


def dump_manifest(m, path):
    """Pretty JSON with one frame per line (easy to diff / hand-tune)."""
    s = json.dumps(m, indent=1)
    import re
    def one_line(mo):
        return re.sub(r"\s*\n\s*", " ", mo.group(0))
    s = re.sub(r"\{\s*\n\s*\"i\":[^{}]*?\}", one_line, s)
    with open(path, "w") as f:
        f.write(s + "\n")


def r4(v):
    return round(float(v), 3)


def frame_json(fr: dict, index: int, oy_comp: float) -> dict:
    o = {"i": index, "ms": int(fr["ms"])}
    sx, sy = fr.get("sx", 1.0), fr.get("sy", 1.0)
    if abs(sx - 1) > 1e-4:
        o["scaleX"] = r4(sx)
    if abs(sy - 1) > 1e-4:
        o["scaleY"] = r4(sy)
    ox = fr.get("ox", 0.0)
    oy = fr.get("oy", 0.0) + (oy_comp * (1 - sy) if fr.get("plant", True) else 0.0)
    if abs(ox) > 1e-3:
        o["ox"] = r4(ox)
    if abs(oy) > 1e-3:
        o["oy"] = r4(oy)
    ev = fr.get("ev") or []
    if len(ev) == 1:
        o["event"] = ev[0]
    elif ev:
        o["events"] = list(ev)
    return o


def main_body_box(piece):
    m = piece.rgba[..., 3] > 0.5
    body = sk.main_body(m)
    ys, xs = np.where(body)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ----------------------------------------------------------------------------- actors

def build_actor(cfg, pieces, warn):
    C = cfg["cell"]
    s = cfg["scale"]
    names = cfg["cells"]
    P = {n: pieces[i] for i, n in enumerate(names)}
    feetY = cfg["feet_y"] * C
    reg = cfg.get("reg", {})
    body = cfg["body"]

    def mode(n):
        return reg.get(n, "feet")

    placed = {}

    def place(n, tx, ty_center=None):
        p = P[n]
        x0, y0, x1, y1 = p.box
        m = mode(n)
        scl = s
        img = sk.resize_rgba(p.rgba, scl)
        h, w = img.shape[:2]
        if m == "feet":
            px = tx - (p.torso[0] - x0) * scl
            py = feetY - (p.contact - y0) * scl
        elif m == "right":
            bx0, by0, bx1, by1 = main_body_box(p)
            px = cfg["right_x"] * C - bx1 * scl
            py = feetY - (p.contact - y0) * scl
        elif m == "center":
            px = tx - (p.torso[0] - x0) * scl
            py = ty_center - (p.torso[1] - y0) * scl
        else:
            raise ValueError(m)
        nx, ny = cfg.get("nudge", {}).get(n, (0, 0))
        px += nx
        py += ny
        # keep inside the cell: bursts may be refit, figure frames must not clip
        over = max(0, -px, -py, px + w - C, py + h - C)
        if over > 0.5:
            if n in ("death",) or mode(n) == "center":
                # shrink about the registration point until it fits
                for _ in range(40):
                    scl *= 0.97
                    img = sk.resize_rgba(p.rgba, scl)
                    h, w = img.shape[:2]
                    if m == "center":
                        px = tx - (p.torso[0] - x0) * scl
                        py = ty_center - (p.torso[1] - y0) * scl
                    else:
                        px = tx - (p.torso[0] - x0) * scl
                        py = feetY - (p.contact - y0) * scl
                    if max(0, -px, -py, px + w - C, py + h - C) <= 0.5:
                        break
                warn(f"{cfg['id']}:{n} refit to scale {scl:.3f} (burst wider than cell)")
            else:
                warn(f"{cfg['id']}:{n} CLIPS by {over:.1f}px")
        cell = np.zeros((C, C, 4), np.float32)
        lost = sk.paste(cell, img, px, py)
        torso = (px + (p.torso[0] - x0) * scl, py + (p.torso[1] - y0) * scl)
        bb = main_body_box(p)
        bcx = px + (bb[0] + bb[2]) / 2 * scl
        placed[n] = dict(cell=cell, torso=torso, scale=scl, lost=lost, pos=(px, py), bcx=bcx)

    # pass 1: body frames
    tx0 = cfg["torso_x"] * C
    for n in body:
        place(n, tx0)
    tx_ref = float(np.mean([placed[n]["torso"][0] for n in body]))
    ty_ref = float(np.mean([placed[n]["torso"][1] for n in body]))
    for n in names:
        if n not in placed:
            place(n, tx_ref, ty_ref)

    cells = [placed[n]["cell"] for n in names]
    order = list(names)
    for en, spec in cfg.get("extras", {}).items():
        kind, srcn, color, amt = spec
        if kind == "tint":
            cells.append(sk.tint(placed[srcn]["cell"], color, amt))
            order.append(en)
    atlas, cols = sk.pack(cells, C, C)

    r = cfg["r"]
    fit = game_fit(r, C)
    ax = tx_ref / C
    if cfg.get("anchor_x") == "bbox":  # long bodies (worm): pivot/shadow under the body's middle
        ax = float(np.mean([placed[n]["bcx"] for n in body])) / C
    ay_px = feetY - 0.62 * r / fit
    ay = ay_px / C
    oy_comp = (feetY - ay_px) * fit  # world px from anchor to feet
    idx = {n: i for i, n in enumerate(order)}
    clips = {}
    for cname, clip in cfg["clips"].items():
        frs = [dict(f) for f in clip["frames"]]
        lock = clip.get("torso_lock", 0)
        if lock:
            # register the walk on the torso: cancel (part of) the painted torso height wobble,
            # the authored bob in oy then rides on a steady body instead of a jittery one
            ty = {f["f"]: placed[f["f"]]["torso"][1] for f in frs}
            mean = float(np.mean(list(ty.values())))
            for f in frs:
                f["oy"] = f.get("oy", 0.0) - (ty[f["f"]] - mean) * fit * lock
        clips[cname] = {"loop": clip["loop"], "frames": [frame_json(f, idx[f["f"]], oy_comp) for f in frs]}
    manifest = {
        "image": f"{cfg['id']}.webp",
        "frameWidth": C,
        "frameHeight": C,
        "columns": cols,
        "anchor": {"x": r4(ax), "y": r4(ay)},
        "clips": clips,
        "meta": {
            "title": cfg.get("title"),
            "source": cfg["src"],
            "cells": order,
            "feetY": r4(feetY),
            "gameRadius": r,
            "gameFit": fit,
            "note": "anchor = body centre so the feet land on the game's shadow (y + 0.62r) at the current snapScale fit; "
                    "ox/oy are world px; scaled frames already include an oy correction that keeps the feet planted.",
            "pngFallback": f"{cfg['id']}.png",
        },
    }
    jitter = [placed[n]["torso"] for n in body]
    return atlas, manifest, dict(jitter=jitter, fit=fit, placed=placed, order=order)


# ----------------------------------------------------------------------------- fx

def build_fx(cfg, pieces, sheet_wh, warn):
    C = cfg["cell"]
    cols, rows = cfg["cols"], cfg["rows"]
    W, H = sheet_wh
    cw, ch = W / cols, H / rows
    rel = {}
    unions = []
    for r_ in range(rows):
        boxes = []
        for c in range(cols):
            p = pieces[r_ * cols + c]
            ccx, ccy = (c + 0.5) * cw, (r_ + 0.5) * ch
            x0, y0, x1, y1 = p.box
            rel[r_ * cols + c] = (x0 - ccx, y0 - ccy, x1 - ccx, y1 - ccy)
            boxes.append(rel[r_ * cols + c])
        b = np.array(boxes)
        unions.append((b[:, 0].min(), b[:, 1].min(), b[:, 2].max(), b[:, 3].max()))
    s = min(0.8, min((C - 8) / max(u[2] - u[0], u[3] - u[1]) for u in unions))
    cells, anchors = [], {}
    for r_ in range(rows):
        u = unions[r_]
        ucx, ucy = (u[0] + u[2]) / 2, (u[1] + u[3]) / 2
        contacts = []
        for c in range(cols):
            k = r_ * cols + c
            p = pieces[k]
            img = sk.resize_rgba(p.rgba, s)
            px = C / 2 + (rel[k][0] - ucx) * s
            py = C / 2 + (rel[k][1] - ucy) * s
            cell = np.zeros((C, C, 4), np.float32)
            lost = sk.paste(cell, img, px, py)
            if lost > 1:
                warn(f"fx {cfg['cells'][k]} lost alpha {lost:.0f}")
            cells.append(cell)
            contacts.append((py + (p.contact - p.box[1]) * s, px + (p.torso[0] - p.box[0]) * s, py + (p.torso[1] - p.box[1]) * s))
        name = cfg["row_names"][r_]
        if name in ("inkBurst", "dust"):
            anchors[name] = (C / 2 / C, float(np.median([cc[0] for cc in contacts])) / C)
        else:
            anchors[name] = (contacts[0][1] / C, contacts[0][2] / C)
    atlas, ncols = sk.pack(cells, C, C, columns=cols)
    idx = {n: i for i, n in enumerate(cfg["cells"])}
    clips = {}
    for cname, clip in cfg["clips"].items():
        a = anchors[cname]
        clips[cname] = {"loop": False, "anchor": {"x": r4(a[0]), "y": r4(a[1])},
                        "frames": [frame_json(dict(f, plant=False), idx[f["f"]], 0) for f in clip["frames"]]}
    manifest = {
        "image": f"{cfg['id']}.webp", "frameWidth": C, "frameHeight": C, "columns": ncols,
        "anchor": {"x": 0.5, "y": 0.5}, "clips": clips,
        "meta": {"title": cfg["title"], "source": cfg["src"], "cells": cfg["cells"], "scaleFromSource": r4(s),
                 "note": "custom clip names (muzzle/hitSpark/inkBurst/dust): the stock parser only keeps "
                         "idle/walk/hurt/attack/death, so a VFX player must read clips by name. Each clip carries its own anchor "
                         "(centre for sparks, ground contact for ink/dust).",
                 "pngFallback": f"{cfg['id']}.png"},
    }
    return atlas, manifest, dict(scale=s)


# ----------------------------------------------------------------------------- icons

def build_icons(cfg, pieces, warn):
    C, s = cfg["cell"], cfg["scale"]
    names = cfg["cells"]
    base, glowc = [], []
    for n, p in zip(names, pieces):
        img = sk.resize_rgba(p.rgba, s)
        h, w = img.shape[:2]
        cell = np.zeros((C, C, 4), np.float32)
        lost = sk.paste(cell, img, (C - w) / 2, (C - h) / 2 + 2)
        if lost > 1:
            warn(f"icon {n} clipped")
        base.append(cell)
        g = 0.35 if n in ("crate", "chest") else 0.6
        glowc.append(sk.glow(cell, ICON_GLOW.get(n, (1, 1, 0.8)), radius=5.5, strength=g))
    order = names + [n + "_glow" for n in names]
    atlas, cols = sk.pack(base + glowc, C, C)
    idx = {n: i for i, n in enumerate(order)}
    clips = {}
    for n in names:
        frames = []
        for k in range(6):
            b = (1 - math.cos(2 * math.pi * k / 6)) / 2
            fr = {"f": (n + "_glow") if b > 0.6 else n, "ms": 110, "sx": 1 + 0.04 * b, "sy": 1 + 0.04 * b,
                  "oy": -2.5 * b, "plant": False}
            frames.append(frame_json(fr, idx[fr["f"]], 0))
        clips[n] = {"loop": True, "frames": frames}
    clips["idle"] = clips["xpSmall"]  # keeps the stock parser happy (it needs one known clip name)
    manifest = {
        "image": f"{cfg['id']}.webp", "frameWidth": C, "frameHeight": C, "columns": cols,
        "anchor": {"x": 0.5, "y": 0.5}, "clips": clips,
        "meta": {"title": cfg["title"], "source": cfg["src"], "cells": order,
                 "note": "static icons i=0..7, glow variants i=8..15; each clip = idle bob + glow pulse.",
                 "pngFallback": f"{cfg['id']}.png"},
    }
    return atlas, manifest, {}


# ----------------------------------------------------------------------------- props

def build_prop(cfg, piece, outdir):
    rgba = piece.rgba
    full = sk.resize_rgba(rgba, 1.0)
    half = sk.resize_rgba(rgba, cfg["scale"])
    pad = 2
    def padded(a):
        h, w = a.shape[:2]
        out = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
        sk.paste(out, a, pad, pad)
        return out
    half, full = padded(half), padded(full)
    sk.save_atlas(half, os.path.join(outdir, cfg["id"]))
    sk.save_atlas(full, os.path.join(outdir, cfg["id"] + "@2x"))
    h, w = half.shape[:2]
    manifest = {
        "image": f"{cfg['id']}.webp", "frameWidth": w, "frameHeight": h, "columns": 1,
        "anchor": {"x": 0.5, "y": 0.5},
        "clips": {"idle": {"loop": True, "frames": [{"i": 0, "ms": 1000}]}},
        "meta": {"title": cfg["title"], "source": cfg["src"], "image2x": f"{cfg['id']}@2x.webp",
                 "note": "static prop; draw at 1x for normal zoom, @2x for hi-dpi.", "pngFallback": f"{cfg['id']}.png"},
    }
    return half, manifest


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/workspace/bro/art-src/raw")
    ap.add_argument("--out", default="/workspace/bro/art")
    ap.add_argument("--only", default="")
    ap.add_argument("--no-previews", action="store_true")
    args = ap.parse_args()
    outdir = os.path.join(args.out, "public", "sprites")
    os.makedirs(outdir, exist_ok=True)
    only = set(filter(None, args.only.split(",")))
    warnings = []
    report = {}
    built = {}
    for cfg in SHEETS:
        if only and cfg["id"] not in only:
            continue
        rgb = np.asarray(Image.open(os.path.join(args.src, cfg["src"])).convert("RGB"))
        kp = dict(erode=0 if cfg["kind"] == "fx" else 1, feather=0.5 if cfg["kind"] == "fx" else 0.6)
        kp.update(cfg.get("key", {}))
        keyed, stats = sk.key_sheet(rgb, sk.KeyParams(**kp))
        pieces = sk.segment(keyed, cfg["cols"], cfg["rows"], merge_px=8)
        if any(p is None for p in pieces):
            warnings.append(f"{cfg['id']}: empty cell(s)")
        w = warnings.append
        if cfg["kind"] == "actor":
            atlas, man, info = build_actor(cfg, pieces, w)
        elif cfg["kind"] == "fx":
            atlas, man, info = build_fx(cfg, pieces, (rgb.shape[1], rgb.shape[0]), w)
        elif cfg["kind"] == "icons":
            atlas, man, info = build_icons(cfg, pieces, w)
        elif cfg["kind"] == "prop":
            atlas, man = build_prop(cfg, pieces[0], outdir)
            info = {}
        if cfg["kind"] != "prop":
            sk.save_atlas(atlas, os.path.join(outdir, cfg["id"]))
        dump_manifest(man, os.path.join(outdir, cfg["id"] + ".json"))
        halo = sk.halo_score(atlas, tuple(int(v) for v in stats["bg"]))
        report[cfg["id"]] = dict(key=stats, halo_px=halo, atlas=list(atlas.shape[:2][::-1]))
        if "jitter" in info:
            j = np.array(info["jitter"])
            report[cfg["id"]]["torso_spread_px"] = [r4(np.ptp(j[:, 0])), r4(np.ptp(j[:, 1]))]
        built[cfg["id"]] = (cfg, man)
        print(f"built {cfg['id']:18s} atlas={atlas.shape[1]}x{atlas.shape[0]} halo_px={halo}", flush=True)
    with open(os.path.join(args.out, "tools", "build_report.json"), "w") as f:
        json.dump(dict(report=report, warnings=warnings), f, indent=1)
    for w_ in warnings:
        print("WARN", w_)
    if not args.no_previews:
        import previews
        previews.render_all(args.out, [k for k in built])


if __name__ == "__main__":
    main()
