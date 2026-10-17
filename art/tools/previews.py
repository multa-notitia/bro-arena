#!/usr/bin/env python3
"""Animated GIF previews that play the JSON exactly like src/render/sheets.ts does.

* per clip GIF:   previews/<id>/<clip>.gif   (2x game scale on the garden ground, with the
                  game's own contact shadow so hops / squash read against the floor)
* showcase:       previews/showcase.gif
* contact sheet:  previews/contact_sheet.png (every atlas on dark + light)
* halo check:     previews/halo_check.png
usage: python3 tools/previews.py [out_dir]
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spritekit as sk  # noqa: E402

P = 4.0            # current preview px per world px (set per render)
P_CLIP = 4.0       # per-clip GIFs: 4x game scale == native 1x atlas pixels (game draws at fit 0.25)
P_SHOW = 3.0       # showcase
FX_WORLD = 0.42    # world scale of a 1x VFX cell (128 px -> ~54 world px), preview only
ICON_WORLD = 0.22  # pickups (128 px cell -> ~28 world px), preview only
SHADOW = (7, 6, 4)


def font(sz=14):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


class Sheet:
    def __init__(self, sprites_dir, sid):
        self.id = sid
        self.m = json.load(open(os.path.join(sprites_dir, sid + ".json")))
        img = Image.open(os.path.join(sprites_dir, self.m["meta"].get("pngFallback", sid + ".png"))).convert("RGBA")
        self.atlas = np.asarray(img).astype(np.float32) / 255.0
        self.fw, self.fh = self.m["frameWidth"], self.m["frameHeight"]
        self.cols = self.m["columns"]
        self.cache = {}
        meta = self.m["meta"]
        self.r = meta.get("gameRadius")
        self.fit = meta.get("gameFit")

    def cell(self, i):
        r, c = divmod(i, self.cols)
        return self.atlas[r * self.fh:(r + 1) * self.fh, c * self.fw:(c + 1) * self.fw]

    def scaled(self, i, zx, zy):
        key = (i, round(zx, 4), round(zy, 4))
        if key not in self.cache:
            cell = self.cell(i)
            w, h = max(1, round(self.fw * zx)), max(1, round(self.fh * zy))
            pm = sk.premul(cell)
            ch = [np.asarray(Image.fromarray(pm[..., k], "F").resize((w, h), Image.LANCZOS)) for k in range(4)]
            self.cache[key] = sk.unpremul(np.clip(np.dstack(ch), 0, 1))
        return self.cache[key]

    def sample(self, clip, t_ms):
        c = self.m["clips"][clip]
        fr = c["frames"]
        total = sum(f["ms"] for f in fr)
        t = t_ms % total if c.get("loop", True) else min(t_ms, total - 1)
        for k, f in enumerate(fr):
            if t < f["ms"] or k == len(fr) - 1:
                return k, f
            t -= f["ms"]

    def draw(self, canvas, clip, frame, x, y, world_scale, facing=1):
        """Mirror of drawActorSheet: translate(ox*facing, oy) then scale(facing*fit*sx, fit*sy)."""
        c = self.m["clips"][clip]
        anc = c.get("anchor", self.m["anchor"])
        ax, ay = anc["x"] * self.fw, anc["y"] * self.fh
        sx, sy = frame.get("scaleX", 1), frame.get("scaleY", 1)
        zx, zy = world_scale * sx * P, world_scale * sy * P
        img = self.scaled(frame["i"], zx, zy)
        if facing < 0:
            img = img[:, ::-1]
            ax = self.fw - ax
        px = x + frame.get("ox", 0) * facing * P - ax * zx
        py = y + frame.get("oy", 0) * P - ay * zy
        sk.paste(canvas, img, px, py)


def ground_bg(w, h, sprites_dir, dark=0.78, tile_px=256):
    t = Image.open(os.path.join(sprites_dir, "ground-garden.png")).convert("RGB").resize((tile_px, tile_px), Image.LANCZOS)
    bg = Image.new("RGB", (w, h))
    for x in range(0, w, tile_px):
        for y in range(0, h, tile_px):
            bg.paste(t, (x, y))
    a = np.asarray(bg).astype(np.float32) / 255.0 * dark
    # cool night grade + vignette
    a = a * np.array([0.92, 0.97, 1.08], np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1 - 0.35 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a = a * np.clip(v, 0.55, 1)[..., None]
    return np.dstack([np.clip(a, 0, 1), np.ones((h, w), np.float32)])


def shadow(canvas, x, y, r, alpha):
    """drawShadow(): ellipse at (x, y + 0.62r), radius 1.18r, squashed 0.38."""
    h, w = canvas.shape[:2]
    ss = 4
    rx, ry = 1.18 * r * P, 1.18 * r * 0.38 * P
    cy = y + 0.62 * r * P
    box = (int(x - rx - 2), int(cy - ry - 2), int(x + rx + 3), int(cy + ry + 3))
    bw, bh = box[2] - box[0], box[3] - box[1]
    m = Image.new("L", (bw * ss, bh * ss), 0)
    ImageDraw.Draw(m).ellipse(((x - rx - box[0]) * ss, (cy - ry - box[1]) * ss, (x + rx - box[0]) * ss, (cy + ry - box[1]) * ss), fill=255)
    m = np.asarray(m.resize((bw, bh), Image.LANCZOS)).astype(np.float32) / 255.0 * alpha
    src = np.zeros((bh, bw, 4), np.float32)
    src[..., :3] = np.array(SHADOW) / 255.0
    src[..., 3] = m
    sk.paste(canvas, src, box[0], box[1])


def to_rgb(canvas):
    return Image.fromarray(np.clip(canvas[..., :3] * 255 + 0.5, 0, 255).astype(np.uint8), "RGB")


def save_gif(frames, durations, path):
    """durations in ms; rounded on a cumulative clock so total timing stays exact.
    One global palette, no dithering -> static background pixels are identical frame to frame,
    so the GIF encoder only stores the changed rectangles (small files)."""
    t, prev, ds = 0, 0, []
    for d in durations:
        t += d
        q = int(round(t / 10.0)) * 10
        ds.append(max(20, q - prev))
        prev = q
    step = max(1, len(frames) // 12)
    sample = frames[::step][:12]
    mosaic = Image.new("RGB", (sample[0].width, sample[0].height * len(sample)))
    for k, f in enumerate(sample):
        mosaic.paste(f, (0, k * f.height))
    palimg = mosaic.quantize(colors=255, method=Image.MEDIANCUT)
    pal = [f.quantize(palette=palimg, dither=Image.NONE) for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=ds, loop=0, disposal=1, optimize=False)


def label(img, text, xy=(6, 4), sz=13):
    d = ImageDraw.Draw(img)
    f = font(sz)
    d.text((xy[0] + 1, xy[1] + 1), text, fill=(0, 0, 0), font=f)
    d.text(xy, text, fill=(240, 232, 210), font=f)


# ----------------------------------------------------------------------------- per clip

def clip_gif(sheet, clip, sprites_dir, out_path):
    global P
    P = P_CLIP
    m = sheet.m
    is_actor = sheet.r is not None
    if is_actor:
        ws = sheet.fit
        r = sheet.r
    else:
        ws = FX_WORLD if sheet.id.startswith("fx") else (ICON_WORLD if sheet.id == "pickups" else 0.5)
        r = None
    span = max(sheet.fw, sheet.fh) * ws * P
    W = H = int(max(220, span * 1.45))
    bg = ground_bg(W, H, sprites_dir)
    x = W / 2
    y = H * (0.55 if is_actor else 0.5)
    c = m["clips"][clip]
    seq = [(k, f, f["ms"]) for k, f in enumerate(c["frames"])]
    if not c.get("loop", True):
        k, f = len(seq) - 1, c["frames"][-1]
        seq.append((k, f, 450))  # hold the end pose so it is readable before the GIF restarts
        if is_actor and "idle" in m["clips"] and clip != "idle":
            seq.append((0, m["clips"]["idle"]["frames"][0], 250))
            seq[-1] = (-1, m["clips"]["idle"]["frames"][0], 250)
    frames, durs = [], []
    for k, f, ms in seq:
        cv = bg.copy()
        if is_actor:
            shadow(cv, x, y, r, 0.6)
        cname = "idle" if k == -1 else clip
        sheet.draw(cv, cname, f, x, y, ws, 1)
        im = to_rgb(cv)
        ev = f.get("events") or ([f["event"]] if f.get("event") else [])
        txt = f"{sheet.id}  {clip}  i={f['i']} {f['ms']}ms" + (f"  [{', '.join(ev)}]" if ev and k != -1 else "")
        label(im, txt, sz=11)
        frames.append(im)
        durs.append(ms)
    save_gif(frames, durs, out_path)


# ----------------------------------------------------------------------------- showcase

def showcase(sheets, sprites_dir, out_path, dur_ms=3000, tick=40):
    global P
    P = P_SHOW
    W, H = 1080, 600
    bg = ground_bg(W, H, sprites_dir, tile_px=384)
    heroes = ["player-radish", "player-potato", "player-carrot", "player-chili"]
    fx = sheets["fx-ink"]
    boss = sheets["enemy-eliteBlob"]
    blob = sheets["enemy-blob"]
    worm = sheets["enemy-spitter"]
    charger = sheets["enemy-charger"]
    frames = []
    boss_attack_start = 700
    bclip = boss.m["clips"]["attack"]["frames"]
    boss_total = sum(f["ms"] for f in bclip)
    impact_t = boss_attack_start + sum(f["ms"] for f in bclip[:4])
    chili_attack_t = [500, 1500, 2500]
    blob_hit_t = [300, 1300, 2300]
    def tot(name):
        return sum(fr["ms"] for fr in fx.m["clips"][name]["frames"])
    for t in range(0, dur_ms, tick):
        cv = bg.copy()
        fxq = []
        actors = []  # (y, draw-callable) so we depth-sort like the game
        # four heroes walking right along the bottom, wrapping
        for k, hid in enumerate(heroes):
            s = sheets[hid]
            hx = 70 + k * 150 + (t * 0.05 % 60)
            hy = 470 + (k % 2) * 40
            clip, ct = "walk", t
            if hid == "player-chili":
                for at in chili_attack_t:
                    if at <= t < at + 330:
                        clip, ct = "attack", t - at
                    et = t - (at + 60)
                    if 0 <= et < tot("muzzle"):
                        _, fr = fx.sample("muzzle", et)
                        fxq.append(("muzzle", fr, hx + 26 * P, hy - 4 * P, 0.22))
            actors.append((hy, s, clip, ct, hx, 0.62, 1))
        # enemies
        bx, by = 760, 470
        bclip_name, bct = "walk", t
        for at in blob_hit_t:
            if at <= t < at + 180:
                bclip_name, bct = "hurt", t - at
            if at <= t < at + tot("hitSpark"):
                _, fr = fx.sample("hitSpark", t - at)
                fxq.append(("hitSpark", fr, bx - 6 * P, by - 6 * P, 0.3))
        actors.append((by, blob, bclip_name, bct, bx, 0.55, -1))
        actors.append((250, worm, "walk", t, 640, 0.55, -1))
        actors.append((330, charger, "walk", t, 450, 0.55, -1))
        # boss: idle -> telegraph -> SLAM -> idle
        ox, oy = 880, 260
        if boss_attack_start <= t < boss_attack_start + boss_total:
            clip, ct = "attack", t - boss_attack_start
        else:
            clip, ct = "idle", t
        shake = 0.0
        if impact_t <= t < impact_t + 160:
            shake = (1 - (t - impact_t) / 160) * 3
        actors.append((oy, boss, clip, ct, ox, 0.55, -1, shake))
        if t >= impact_t:
            et = t - impact_t
            for name, dx, sc in [("dust", -26, 0.42), ("dust", 26, 0.42), ("inkBurst", 0, 0.5)]:
                if et < tot(name) + 250:
                    _, fr = fx.sample(name, et)
                    fxq.append((name, fr, ox + dx * P, oy + boss.r * 0.62 * P, sc))
        for a in sorted(actors, key=lambda a: a[0]):
            y, s, clip, ct, x, sh = a[:6]
            facing = a[6]
            shk = a[7] if len(a) > 7 else 0
            jx = math.sin(t * 1.7) * shk * P
            jy = math.cos(t * 2.3) * shk * P
            shadow(cv, x, y, s.r, sh)
            _, f = s.sample(clip, ct)
            s.draw(cv, clip, f, x + jx, y + jy, s.fit, facing)
        for name, fr, x, y, sc in fxq:
            fx.draw(cv, name, fr, x, y, sc, 1)
        im = to_rgb(cv)
        label(im, "BRO - painted sprites, JSON-driven playback (3x game scale)", sz=14)
        frames.append(im)
    save_gif(frames, [tick] * len(frames), out_path)


# ----------------------------------------------------------------------------- contact sheet

def contact_sheet(sheets, sprites_dir, out_path, max_w=760):
    rows = []
    for sid, s in sheets.items():
        img = Image.open(os.path.join(sprites_dir, s.m["meta"].get("pngFallback", sid + ".png"))).convert("RGBA")
        k = min(1.0, max_w / img.width)
        img = img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)
        pair = Image.new("RGB", (img.width * 2 + 30, img.height + 26), (22, 20, 18))
        for j, col in enumerate([(26, 22, 17), (232, 228, 220)]):
            b = Image.new("RGBA", img.size, col + (255,))
            b.alpha_composite(img)
            d = ImageDraw.Draw(b)
            fw = s.fw * k
            xg = 0.0
            while xg < img.width:
                d.line([(xg, 0), (xg, img.height)], fill=(90, 90, 90, 255))
                xg += fw
            yg = 0.0
            while yg < img.height:
                d.line([(0, yg), (img.width, yg)], fill=(90, 90, 90, 255))
                yg += s.fh * k
            pair.paste(b.convert("RGB"), (10 + j * (img.width + 10), 22))
        cells = s.m["meta"].get("cells")
        label(pair, f"{sid}   {s.fw}x{s.fh} cells, {s.cols} cols, clips: {', '.join(s.m['clips'].keys())}", (10, 3), 12)
        rows.append(pair)
    W = max(r.width for r in rows)
    H = sum(r.height for r in rows)
    out = Image.new("RGB", (W, H), (22, 20, 18))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    out.save(out_path, optimize=True)


def halo_check(sheets, sprites_dir, out_path):
    """2x crops of every actor's idle + death cells on pure white and pure black."""
    tiles = []
    for sid, s in sheets.items():
        if s.r is None:
            continue
        for i in (s.m["clips"]["idle"]["frames"][0]["i"], s.m["clips"]["death"]["frames"][-1]["i"]):
            c = s.cell(i)
            im = sk.to_image(c)
            row = Image.new("RGB", (im.width * 2, im.height), (0, 0, 0))
            for j, col in enumerate([(0, 0, 0), (255, 255, 255)]):
                b = Image.new("RGBA", im.size, col + (255,))
                b.alpha_composite(im)
                row.paste(b.convert("RGB"), (j * im.width, 0))
            row = row.resize((int(row.width * 0.75), int(row.height * 0.75)), Image.LANCZOS)
            tiles.append(row)
    W = max(t.width for t in tiles) * 2
    rows = math.ceil(len(tiles) / 2)
    Hrow = max(t.height for t in tiles)
    out = Image.new("RGB", (W, Hrow * rows), (40, 40, 40))
    for k, t in enumerate(tiles):
        out.paste(t, ((k % 2) * (W // 2), (k // 2) * Hrow))
    out.save(out_path)


def render_all(out_dir, ids=None):
    sprites = os.path.join(out_dir, "public", "sprites")
    prev = os.path.join(out_dir, "previews")
    os.makedirs(prev, exist_ok=True)
    all_ids = sorted(f[:-5] for f in os.listdir(sprites) if f.endswith(".json") and not f.startswith("example"))
    sheets = {sid: Sheet(sprites, sid) for sid in all_ids}
    for sid in (ids or all_ids):
        s = sheets[sid]
        if sid.startswith("prop-"):
            continue
        os.makedirs(os.path.join(prev, sid), exist_ok=True)
        for clip in s.m["clips"]:
            if sid == "pickups" and clip == "idle":
                continue
            clip_gif(s, clip, sprites, os.path.join(prev, sid, f"{clip}.gif"))
        print("previews", sid, flush=True)
    order = [k for k in ["player-radish", "player-potato", "player-carrot", "player-chili", "enemy-blob", "enemy-charger",
                         "enemy-spitter", "enemy-eliteBlob", "fx-ink", "pickups", "prop-furrow", "prop-bed"] if k in sheets]
    contact_sheet({k: sheets[k] for k in order}, sprites, os.path.join(prev, "contact_sheet.png"))
    halo_check({k: sheets[k] for k in order}, sprites, os.path.join(prev, "halo_check.png"))
    if all(k in sheets for k in ["fx-ink", "enemy-eliteBlob", "enemy-blob", "player-chili"]):
        showcase(sheets, sprites, os.path.join(prev, "showcase.gif"))
        print("showcase done")


if __name__ == "__main__":
    render_all(sys.argv[1] if len(sys.argv) > 1 else "/workspace/bro/art")
