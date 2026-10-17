#!/usr/bin/env python3
"""Export the carrot's multi-arm runtime data (figures/player-carrot/multiarm/). Same format as the spud's
(figures/player-potato/multiarm/README.md); copied from player-potato/multiarm/export.py and adapted.

  python3 figures/player-carrot/multiarm/export.py
Writes: player-carrot-armless.{json,png,webp}  body+legs+tuft sheet, SAME cells/clips/anchor as the hero sheet, no arms
        body_track.json   per clip frame: body px -> hero-cell px matrix, arms visible, tint, native arm poses
        parts.png/.json   every arm / hand / weapon / fx painting, pre-scaled to body px, with named points
                          (carrot paintings + the shared spud club / knife / fx, copied pixel-exact from
                          player-potato/multiarm/parts.png: 1 carrot body px = 1 spud body px on screen)
        sockets.json      slot geometry + layout per arm count (1..6)
        weapons.json      grip, axis, family, hands, alt painting, fx placement per weapon
        families.json     attack pose clips per family + sprout pop + rules (same keys as the spud)
"""
import copy
import json
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(FIG, "src"))
import carrot as cr  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import rigkit  # noqa: E402

OUT = HERE
SPUD_MA = os.path.join(os.path.dirname(FIG), "player-potato", "multiarm")
SPROUT_SCALE = 0.8
AIM_CLAMP = 50.0
JITTER = [80, 200]
# multiarm.ts / compose_ref.py hard-code `wrist = native.aim + 62` (the spud club's rest aim). The carrot's
# native arm rests at HERO rest_aim (-62, team convention) so the shift is 0; if a hero ever rests elsewhere,
# body_track native aims are exported shifted so aim_c = weapon.restAim + aim_exported + 62 stays the hero's own aim.
NATIVE_AIM_SHIFT = -62.0 - cr.HERO["rest_aim"]


def r2(v):
    return round(float(v), 2)


def pt(p):
    return [r2(p[0]), r2(p[1])]


def scaled(img, k, flip=False):
    h, w = img.shape[:2]
    M = cr.S(k)
    if flip:
        M = cr.T(w * k, 0) @ cr.FLIPX @ M
    out, (x0, y0) = cr.bake(img, M, pad=2)
    return out, cr.T(-x0, -y0) @ M


def build_parts(lib):
    P = {}

    def add(name, rgba, pts, **meta):
        P[name] = (rgba, {k: pt(v) for k, v in pts.items()}, meta)

    # native bent arms, split at the elbow (arm2 = natives; arm1 / arm_dark exported for later use)
    for n, a in lib.arms.items():
        k = cr.SC["arm"]
        for half in ("upper", "fore"):
            img, M = scaled(a[half], k)
            pts = {"shoulder": cr.ap(M, a["shoulder"]), "elbow": cr.ap(M, a["elbow"]), "wrist": cr.ap(M, a["wrist"])}
            add(f"{n}_{half}", img, pts, src="carrot v1 " + n, dir0=r2(a["dir0"]), fore0=r2(a["fore0"]))
    # straight arms (painted cone, wrist end open: any hand fits) = sprouted arms, dark one for behind-body slots
    for n, out in (("arm_straight", "straight"), ("arm_straight_dark", "straight_dark")):
        st = lib.straight[n]
        img, M = scaled(st["img"], cr.SC["arm_straight"])
        sh, wr = cr.ap(M, st["shoulder"]), cr.ap(M, st["wrist"])
        add(out, img, {"shoulder": sh, "wrist": wr}, src="carrot v1 " + n, dir0=r2(cr.ang(sh, wr)))
    # hands (camera-facing, painted upright like the spud's: the runtime's R(d_fore - 22) applies unchanged)
    for n, g in (("fist", cr.FIST["grip"]), ("palm", cr.PALM["grip"]), ("pinch", cr.PINCH["grip"])):
        img, M = scaled(sp_load(n), cr.SC["hand"])
        add(n, img, {"grip": cr.ap(M, g)}, src="carrot v1 " + n)
    # no dark hands on the carrot sheet: palm_dark = the same painted palm (the runtime asks for it by name on back slots)
    img, M = scaled(sp_load("palm"), cr.SC["hand"])
    add("palm_dark", img, {"grip": cr.ap(M, cr.PALM["grip"])}, src="carrot v1 palm (no dark palm painted: same pixels)")
    img, M = scaled(lib.bud, cr.SC["bud"])
    add("bud", img, {"center": cr.ap(M, cr.GEOM2["bud"]["center"])}, src="carrot v1 bud")
    # carrot weapons: relaxed slingshot (mirrored, band trails back), drawn slingshot = stretched painting + fist baked
    img0, pts0, axis0 = lib.slings["sling_relaxed"]
    img, M = scaled(img0, cr.SC["sling"])
    add("sling_relaxed", img, {"grip": cr.ap(M, pts0["grip"]), "fork": cr.ap(M, pts0["fork"])}, src="carrot v1 sling_relaxed (mirrored)",
        axis=r2(axis0))
    # alt: hand + stretched band + pebble as one painting (like the spud's sling_fist): the fist sits on the grip with the
    # hero draw frame's relative rotation (fist rot - sling rot)
    imd, ptsd, axisd = lib.slings["sling_stretched"]
    imd, ptsd = cr.short_draw(imd, ptsd)
    draw = cr.arm_mats(lib, cr.HERO["R"], {"raise": 14, "elbow": -38, "aim": -90, "drawn": True}, "sling")
    g = draw["_grip"]
    Q = np.linalg.inv(cr.T(*g) @ cr.R(-90.0 - axisd))
    lf = Q @ draw["hand"]
    ls = cr.S(cr.SC["sling"]) @ cr.T(-ptsd["grip"][0], -ptsd["grip"][1])      # == Q @ draw["sling"] for the squeezed image
    bs, os_ = cr.bake(imd, ls, pad=2)
    bf, of = cr.bake(lib.fist, lf, pad=2)
    x0, y0 = min(os_[0], of[0]), min(os_[1], of[1])
    x1 = max(os_[0] + bs.shape[1], of[0] + bf.shape[1])
    y1 = max(os_[1] + bs.shape[0], of[1] + bf.shape[0])
    can = np.zeros((int(y1 - y0), int(x1 - x0), 4), np.float32)
    import spritekit as sk
    sk.paste(can, bs, os_[0] - x0, os_[1] - y0)
    sk.paste(can, bf, of[0] - x0, of[1] - y0)
    sh = cr.T(-x0, -y0)
    add("sling_drawn", can, {"grip": cr.ap(sh, (0, 0)), "fork": cr.ap(sh @ ls, ptsd["fork"]), "pouch": cr.ap(sh @ ls, ptsd["pouch"])},
        src="carrot v1 sling_stretched (mirrored, band+pouch squeezed to 55 %) + carrot fist on the grip", axis=r2(axisd),
        note="hand + stretched band + pebble baked together: hide the separate hand while shown")
    sp = lib.spear
    img, M = scaled(sp, cr.SC["spear"])
    gs = cr.GEOM2["spear"]
    add("spear", img, {"grip": cr.ap(M, gs["grip"]), "tip": cr.ap(M, gs["tip"]), "butt": cr.ap(M, gs["butt"])}, src="carrot v1 spear",
        axis=r2(cr.ang(gs["grip"], gs["tip"])))
    # shared set from the spud export (pixel-exact copy, points unchanged)
    sj = json.load(open(os.path.join(SPUD_MA, "parts.json")))
    satlas = np.asarray(Image.open(os.path.join(SPUD_MA, sj["image"])).convert("RGBA")).astype(np.float32) / 255
    for n in ("club", "knife", "fx_smear", "fx_streak", "fx_puff", "fx_dust"):
        p = sj["parts"][n]
        x, y, w, h = p["rect"]
        meta = {k: v for k, v in p.items() if k not in ("rect", "points")}
        meta["src"] = "shared (player-potato/multiarm) " + str(meta.get("src", ""))
        P[n] = (satlas[y:y + h, x:x + w].copy(), p["points"], meta)
    return P


def sp_load(n):
    return cr.load("v1", n)


def pack(P, out_png, out_json):
    items = sorted(P.items(), key=lambda kv: -kv[1][0].shape[0])
    W = 1024
    x = y = rowh = 0
    rects = {}
    for n, (img, pts, meta) in items:
        h, w = img.shape[:2]
        if x + w + 2 > W:
            x, y, rowh = 0, y + rowh + 2, 0
        rects[n] = (x, y, w, h)
        x += w + 2
        rowh = max(rowh, h)
    H = y + rowh
    H = 1 << (H - 1).bit_length()
    atlas = np.zeros((H, W, 4), np.float32)
    for n, (img, pts, meta) in items:
        x, y, w, h = rects[n]
        atlas[y:y + h, x:x + w] = img
    Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(out_png)
    js = {"image": os.path.basename(out_png), "units": "1 part px = 1 body px (parts/v1/body.png px of the carrot; same on-screen "
                                                       "size as 1 spud body px)",
          "parts": {n: dict({"rect": list(rects[n]), "points": P[n][1]}, **P[n][2]) for n in sorted(P)}}
    json.dump(js, open(out_json, "w"), indent=1)
    return atlas.shape


# ============================================================================ sockets / weapons / families
SLOTS = {
    "midR": {"pos": [125, 192], "side": 1, "dir": 70.0, "z": 11.0, "native": True},
    "midL": {"pos": [54, 192], "side": -1, "dir": 70.0, "z": 11.2, "native": True},
    "upL": {"pos": [47, 128], "side": -1, "dir": -30.0, "z": 4.0, "native": False},
    "upR": {"pos": [131, 128], "side": 1, "dir": -30.0, "z": 4.1, "native": False},
    "lowL": {"pos": [62, 224], "side": -1, "dir": 40.0, "z": 3.6, "native": False},
    "lowR": {"pos": [116, 224], "side": 1, "dir": 40.0, "z": 3.7, "native": False},
}
HIGH = {"upL": {"dir": -48.0}, "upR": {"dir": -48.0}, "midR": {"dir": 44.0}, "midL": {"dir": 44.0},
        "lowL": {"pos": [57, 214], "dir": 12.0}, "lowR": {"pos": [121, 214], "dir": 12.0}}
LAYOUTS = {"1": (["midR", "midL"], {}), "2": (["midR", "midL"], {}), "3": (["midR", "midL", "upL"], {}),
           "4": (["midR", "midL", "upL", "upR"], {}), "5": (["midR", "midL", "upL", "upR", "lowL"], HIGH),
           "6": (["midR", "midL", "upL", "upR", "lowL", "lowR"], HIGH)}

WEAPONS = {
    "slingshot": {"img": "sling_relaxed", "family": "ranged-recoil", "wood": True, "restAim": cr.HERO["rest_aim"], "shotOffset": 90.0,
                  "hand": {"front": "fist", "back": "fist"},
                  "alt": {"imgs": ["sling_drawn"], "pick": "slotIndex % 1", "hidesHand": True},
                  "fx": {"release": {"img": "fx_puff", "rule": "alongShot", "anchor": "cloud", "at": "fork",
                                     "params": {"ahead": 8.0, "side": 0.0}, "z": 14.0}}},
    "spear": {"img": "spear", "family": "melee-stab", "wood": True, "restAim": -50.0, "shotOffset": 0.0,
              "hand": {"front": "fist", "back": "fist"},
              "fx": {"release": {"img": "fx_streak", "rule": "alongAim", "anchor": "tip", "at": "tip",
                                 "params": {"ahead": 4.0, "side": -5.0}, "z": 14.0}}},
    "club": {"img": "club", "family": "melee-swing", "wood": True, "restAim": -62.0, "shotOffset": 0.0,
             "hand": {"front": "fist", "back": "fist"},
             "fx": {"release": {"img": "fx_smear", "rule": "swingArc", "z": "behindBody",
                                "params": {"back": 45.0, "radius": 0.92}}}},
    "knife": {"img": "knife", "family": "melee-stab", "wood": False, "restAim": -40.0, "shotOffset": 0.0,
              "hand": {"front": "fist", "back": "fist"},
              "fx": {"release": {"img": "fx_streak", "rule": "alongAim", "anchor": "tip", "at": "tip",
                                 "params": {"ahead": 4.0, "side": -5.0}, "z": 14.0}}},
}

FAMILIES = json.load(open(os.path.join(SPUD_MA, "families.json")))["families"]     # identical motion templates
SPROUT = json.load(open(os.path.join(SPUD_MA, "families.json")))["sprout"]


def walk_arm(slot_i, ph):
    lag = [0.0, 0.0, 1.2, 1.2 + math.pi, 0.6 + math.pi, 0.6][slot_i]
    amp = [8, 22, 10, 10, 18, 18][slot_i]
    c = math.cos(ph - lag)
    return {"raise": r2(amp * c), "elbow": r2(6 + 8 * (0.5 + 0.5 * math.cos(ph - lag - 0.8))), "wrist": r2(6 * math.cos(ph - lag - 1.0))}


def idle_arm(slot_i, ph):
    lag = 0.5 * (slot_i + 1)
    return {"raise": r2(3.5 * math.sin(ph - lag)), "elbow": r2(4 + 2 * math.sin(ph - lag - 0.9)), "wrist": r2(3 * math.sin(ph - lag - 1.2))}


ARM_PARTS = ("armR", "armL", "handR", "handL", "budR", "budL", "sling", "pinchL", "puff")


def armless_and_track(cfg):
    arm_parts = [n for n in cfg["parts"] if n.startswith(ARM_PARTS)]
    acfg = copy.deepcopy({k: v for k, v in cfg.items() if k != "_dir"})
    acfg["_dir"] = cfg["_dir"]
    acfg["id"] = "player-carrot-armless"
    acfg["title"] = "Carrot body + legs + tuft (multi-arm base, arms drawn at runtime)"
    for cname, cc in acfg["clips"].items():
        for f in cc["frames"]:
            if "painted" not in f:
                f["hide"] = sorted(set(f.get("hide", [])) | set(arm_parts))
                f["show"] = [s for s in f.get("show", []) if s not in arm_parts]
    res = rigkit.build(acfg, outdir=OUT, log=print)
    R = res["renderer"]
    PAD = rigkit.PAD
    K, D = cr.K, json.load(open(os.path.join(FIG, "src", "out", "geom.json")))["D"]
    C = cr.T(PAD - D[0], PAD - D[1]) @ cr.S(K)
    track = {"units": "matrix maps body px (carrot body.png px, the socket unit) -> hero cell px (192 cell, same cell "
                      "as player-carrot.json / player-carrot-armless.json); then the game's usual cell -> world draw",
             "cell": R.C, "nativeAimShift": NATIVE_AIM_SHIFT, "clips": {}}
    for cname, cc in cfg["clips"].items():
        frames = rigkit.GENERATORS[cc["gen"]](cfg, res["parts"], cc)
        out = []
        for k, f in enumerate(frames):
            src = cc["frames"][k] if isinstance(cc["frames"], list) else {}
            if "painted" in f:
                out.append({"arms": False})
                continue
            M = rigkit.world_matrices(res["parts"], f["pose"])["body"]
            A = cr.S(R.s) @ cr.T(*R.off) @ M @ C
            e = {"arms": True, "m": [[round(float(v), 5) for v in row] for row in A[:2]]}
            if f["pose"].get("tint"):
                e["tint"] = f["pose"]["tint"]
            if "face_squint" in f["pose"].get("show", []):
                e["squint"] = True
            arms = src.get("_arms")
            if arms:
                nat = {}
                for side in ("R", "L"):
                    d = {kk: r2(v) for kk, v in arms[side].items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
                    if "aim" in d:
                        d["aim"] = r2(d["aim"] + NATIVE_AIM_SHIFT)
                    nat[side] = d
                e["native"] = nat
            out.append(e)
        track["clips"][cname] = out
    return res, track


def main():
    lib = cr.Lib()
    P = build_parts(lib)
    shp = pack(P, os.path.join(OUT, "parts.png"), os.path.join(OUT, "parts.json"))
    print("parts atlas", shp[1], "x", shp[0], len(P), "parts")
    cfg = rigkit.load_config(os.path.join(FIG, "rig.py"))
    res, track = armless_and_track(cfg)
    sec = {"walk": [[walk_arm(i, 2 * math.pi * k / 8) for i in range(6)] for k in range(8)],
           "idle": [[idle_arm(i, 2 * math.pi * k / 6) for i in range(6)] for k in range(6)],
           "hurt": [[{"raise": 36.0, "elbow": -22.0, "wrist": -14.0}] * 6, [{"raise": 28.0, "elbow": -16.0, "wrist": -10.0}] * 6,
                    [{"raise": 10.0, "elbow": -5.0}] * 6],
           "attack": [[{}] * 6] * 4,
           "death": [[{"raise": -18.0, "elbow": 12.0}] * 6, [{"raise": 95.0, "elbow": -36.0, "wrist": -30.0}] * 6] + [[{}] * 6] * 5}
    track["secondary"] = sec
    json.dump(track, open(os.path.join(OUT, "body_track.json"), "w"), indent=1)
    sockets = {"units": "body px (carrot parts/v1/body.png px); dir/aim = screen deg, y down, 0 = right (facing), -90 = up; "
                        "CANONICAL = as if on the right side: side -1 slots mirror about their own x",
               "slots": SLOTS, "layouts": {n: {"slots": s, "override": o} for n, (s, o) in LAYOUTS.items()},
               "arms": {"native": {"midR": "arm2", "midL": "arm2", "kind": "bent", "scale": 1.0},
                        "sprouted": {"front": "straight", "back": "straight_dark", "kind": "straight", "scale": SPROUT_SCALE}},
               "behindBodyZ": 10.0, "bud": {"part": "bud", "frontOnly": True}}
    json.dump(sockets, open(os.path.join(OUT, "sockets.json"), "w"), indent=1)
    json.dump({"weapons": WEAPONS, "fist34HandleAlongPlusX": True}, open(os.path.join(OUT, "weapons.json"), "w"), indent=1)
    json.dump({"families": FAMILIES, "sprout": SPROUT, "aimClamp": AIM_CLAMP, "jitterMs": JITTER, "sproutScale": SPROUT_SCALE,
               "armTurnShare": 0.6, "handD": cr.HAND_D, "loadoutRules": {"woodPerSide": "minimise (cost 10 per extra wooden weapon on a side, "
                                                                        "3 per vertically adjacent wooden pair, 1 per weapon that changes slot)"}},
              open(os.path.join(OUT, "families.json"), "w"), indent=1)
    print("wrote", sorted(f for f in os.listdir(OUT) if not f.endswith(".py")))


if __name__ == "__main__":
    main()
