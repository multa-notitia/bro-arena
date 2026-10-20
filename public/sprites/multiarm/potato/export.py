#!/usr/bin/env python3
"""SIDE VIEW (2026-10-17). Export the spud's multi-arm runtime data (figures/player-potato/multiarm/). See README.md for the format.

  python3 figures/player-potato/multiarm/export.py
Writes: player-potato-armless.{json,png,webp}  body+legs sheet, SAME cells/clips/anchor as the hero sheet, no arms
        body_track.json   per clip frame: body px -> hero-cell px matrix, arms visible, tint, native arm poses
        parts.png/.json   every arm / hand / weapon / fx painting, pre-scaled to body px, with named points
        sockets.json      slot geometry + layout per arm count (1..6)
        weapons.json      grip, axis, family, hands, alt painting, fx placement per weapon
        families.json     attack pose clips per family + idle/walk/hurt secondary motion + sprout pop + rules
All pixels are the paintings' own (affine transforms only; rigkit's ink stroke on new cut edges).
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
import side as sp  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402
import rigkit  # noqa: E402
import spritekit as sk  # noqa: E402

OUT = HERE
SPROUT_SCALE = 0.8
AIM_CLAMP = 50.0
JITTER = [80, 200]
SC2 = {"sling_fist": 0.52, "fx_smear": 0.8, "fx_streak": 0.5, "fx_puff": 0.42, "fx_dust": 0.55}


def r2(v):
    return round(float(v), 2)


def pt(p):
    return [r2(p[0]), r2(p[1])]


# ============================================================================ parts (pre-scaled to body px)
def scaled(img, k, flip=False):
    """painted px -> body px (scale k, optional mirror). returns (rgba, M painted->part px)."""
    h, w = img.shape[:2]
    M = sp.S(k)
    if flip:
        M = sp.T(w * k, 0) @ sp.FLIPX @ M
    out, (x0, y0) = sp.bake(img, M, pad=2)
    return out, sp.T(-x0, -y0) @ M


def cut_wrist(img, col):
    """v2 long arm: drop the painted hand beyond the wrist column (the separate fist sits there), ink the cut."""
    out = img.copy()
    xx = np.arange(img.shape[1])[None, :].astype(np.float32)
    out[..., 3] *= np.clip((col + 1.0 - xx) / 2.0, 0, 1)
    return rigkit.stroke_new_edges(out, img[..., 3], rigkit.ink_colour(img).tolist(), 1.6)


V2 = os.path.join(FIG, "frontal_v2", "parts")
V2K = 0.82 / sp.K          # frontal v2 body px -> side body px at the same on-screen size (K 0.82 vs 0.75)


def v2load(tag, name):
    return np.asarray(Image.open(os.path.join(V2, tag, name + ".png")).convert("RGBA")).astype(np.float32) / 255.0


def turned(img, deg, k):
    """painted px -> part px: rotate by deg, scale k (tight canvas). returns (rgba, M)."""
    M = sp.R(deg) @ sp.S(k)
    out, (x0, y0) = sp.bake(img, M, pad=2)
    return out, sp.T(-x0, -y0) @ M


def build_parts(lib):
    P = {}

    def add(name, rgba, pts, **meta):
        P[name] = (rgba, {k: pt(v) for k, v in pts.items()}, meta)

    # native bent arms (side sheet), split at the painted elbow: near = arm_bent2 (light), far = arm_dark_bent2
    for n in ("arm_bent2", "arm_dark_bent2"):
        a = lib.arms[n]
        for half in ("upper", "fore"):
            img, M = scaled(a[half], sp.SC["arm"])
            pts = {"shoulder": sp.ap(M, a["shoulder"]), "elbow": sp.ap(M, a["elbow"]), "wrist": sp.ap(M, a["wrist"])}
            add(f"{n}_{half}", img, pts, src="side " + n, dir0=r2(a["dir0"]), fore0=r2(a["fore0"]))
    # straight arms for sprouted slots (painted without a hand, so no wrist cut): near light / far dark
    for n, out in (("arm_straight", "long_cut"), ("arm_dark_straight", "long_dark_cut")):
        la = lib.long[n]
        img, M = scaled(la["img"], sp.SC["long_arm"])
        sh, wr = sp.ap(M, la["shoulder"]), sp.ap(M, la["wrist"])
        add(out, img, {"shoulder": sh, "wrist": wr}, src="side " + n,
            dir0=r2(math.degrees(math.atan2(wr[1] - sh[1], wr[0] - sh[0]))))
    # fist on handle (handle stub dropped, already turned so the handle runs along +x)
    img, M = scaled(lib.fist34, sp.SC["fist34"])
    add("fist34", img, {"wrist": sp.ap(M, sp.FIST34["wrist"]), "grip": sp.ap(M, sp.FIST34["grip"])},
        src="side fist_grip (painted handle dropped, turned handle -> +x)", axis=0.0,
        note="handle runs along +x through the curl; draw the weapon UNDER it")
    # camera-facing hands: painted upright (out = -90); pre-turned so the runtime's R(d_fore - 22) points them along
    # the forearm. No dark palm on the sheet: palm_dark = the dark fist (a closed far hand reads fine behind the body)
    for n, src, hp in (("fist", lib.fist, sp.FIST), ("fist_dark", lib.fist_dark, sp.FIST_DARK), ("palm", lib.palm, sp.PALM)):
        img, M = turned(src, sp.RT_HAND_OUT - hp["out"], sp.SC["hand"])
        add(n, img, {"grip": sp.ap(M, hp["grip"])}, src="side " + n)
    # polish: painted dark open palm (heroes_inbetween_v1 chili row, recoloured to the spud's dark arm)
    img, M = turned(lib.palm_dark, sp.RT_HAND_OUT - sp.PALM_DARK["out"], sp.SC["palm_dark"])
    add("palm_dark", img, {"grip": sp.ap(M, sp.PALM_DARK["grip"])}, src="heroes_inbetween_v1 dark open palm (polish)")
    # polish: painted club-over-shoulder windup arm (mirrored, painted club removed outside the fist)
    wp = sp.PTS_P["arm_windup"]
    img, M = scaled(lib.windup, sp.SC["windup"] * sp.SC["arm"] / sp.SC["arm"])
    add("windup", img, {"shoulder": sp.ap(M, wp["shoulder"]), "grip": sp.ap(M, wp["grip"])},
        src="heroes_inbetween_v1 potato row club-over-shoulder windup (polish)", axis=wp["axis"],
        note="raised art: front slots on a raised:true key swap the arm for this piece; weapon drawn through the fist, behind the body")
    img, M = scaled(lib.bud, sp.SC["bud"])
    add("bud", img, {"center": sp.ap(M, lib.bud_c)}, src="side arm_straight top cap (shoulder joint)")
    # weapons: the side sheet's spiked club; knife + slingshot borrowed from the frontal spud sheet (no hand painted in)
    img, M = scaled(lib.club, sp.SC["club"])
    add("club", img, {"grip": sp.ap(M, sp.CLUB["grip"]), "head": sp.ap(M, sp.CLUB["head"])}, src="side club", axis=r2(sp.CLUB["axis"]))
    kn = v2load("v1", "knife")
    img, M = scaled(kn, 0.39 * V2K)
    add("knife", img, {"grip": sp.ap(M, (34.0, 121.0)), "tip": sp.ap(M, (kn.shape[1] - 8.0, 10.0))}, src="frontal v1 knife", axis=-42.0)
    img, M = scaled(v2load("v1", "sling_relaxed"), 0.47 * V2K)
    add("sling_relaxed", img, {"grip": sp.ap(M, (30.0, 136.0)), "fork": sp.ap(M, (95.0, 10.0))}, src="frontal v1 sling_relaxed", axis=-63.0)
    # fx: the side sheet's smear in the swingArc convention; streak / puff / dust borrowed from the frontal v2 sheet
    sm = sp.smear_img()
    img, M = scaled(sm, sp.SC["fx_smear"])
    add("fx_smear", img, {"bulge": sp.ap(M, sp.smear_bulge(sm))}, src="side smear (flipped + turned: convex +x, lead below)")
    import importlib.util
    spec = importlib.util.spec_from_file_location("spud_fx", os.path.join(FIG, "frontal_v2", "src", "spud.py"))
    fx = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fx)                     # only its pink-fringe clean_fx is used
    st = fx.clean_fx(v2load("v2", "fx_streak"), trail_fade=False)
    A = st[..., 3] > 0.5
    ys, xs = np.where(A)
    img, M = scaled(st, SC2["fx_streak"] * V2K)
    add("fx_streak", img, {"tip": sp.ap(M, (float(xs.max()), float(ys[xs > xs.max() - 6].mean()))),
                           "tail": sp.ap(M, (float(xs.min()), float(ys[xs < xs.min() + 6].mean())))}, src="frontal v2 fx_streak")
    pf = fx.clean_fx(v2load("v2", "fx_puff"))
    A = pf[..., 3] > 0.5
    ys, xs = np.where(A[:, : int(0.38 * pf.shape[1])])
    img, M = scaled(pf, SC2["fx_puff"] * V2K)
    add("fx_puff", img, {"cloud": sp.ap(M, (float(xs.mean()), float(ys.mean())))}, src="frontal v2 fx_puff")
    du = fx.clean_fx(v2load("v2", "fx_dust"))
    img, M = scaled(du, SC2["fx_dust"] * V2K)
    add("fx_dust", img, {"center": (img.shape[1] / 2, img.shape[0] / 2)}, src="frontal v2 fx_dust")
    return P


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
    js = {"image": os.path.basename(out_png), "units": "1 part px = 1 body px (parts/cc/body.png px of the side-view spud)",
          "parts": {n: dict({"rect": list(rects[n]), "points": P[n][1]}, **P[n][2]) for n in sorted(P)}}
    json.dump(js, open(out_json, "w"), indent=1)
    return atlas.shape


# ============================================================================ sockets / weapons / families
# SIDE VIEW: every slot faces right (side +1, nothing mirrored per slot; the game mirrors the whole figure).
# layer "front" = near side, drawn over the body (light arm + bud); "back" = far side, behind the body (dark arm).
# Names keep the runtime's <up|mid|low><R|L> pattern: R = near/front, L = far/back.
SLOTS = {
    "midR": {"pos": [154, 158], "side": 1, "dir": 54.0, "z": 11.0, "native": True, "layer": "front"},
    "midL": {"pos": [26, 126], "side": 1, "dir": 118.0, "z": 4.0, "native": True, "layer": "back"},
    "upR": {"pos": [166, 124], "side": 1, "dir": -8.0, "z": 11.4, "native": False, "layer": "front"},
    "upL": {"pos": [62, 26], "side": 1, "dir": -42.0, "z": 3.6, "native": False, "layer": "back"},
    "lowR": {"pos": [140, 190], "side": 1, "dir": 34.0, "z": 11.6, "native": False, "layer": "front"},
    "lowL": {"pos": [22, 168], "side": 1, "dir": 146.0, "z": 3.8, "native": False, "layer": "back"},
}
LAYOUTS = {"1": (["midR", "midL"], {}), "2": (["midR", "midL"], {}), "3": (["midR", "midL", "upR"], {}),
           "4": (["midR", "midL", "upR", "upL"], {}), "5": (["midR", "midL", "upR", "upL", "lowR"], {}),
           "6": (["midR", "midL", "upR", "upL", "lowR", "lowL"], {})}

WEAPONS = {
    "club": {"img": "club", "family": "melee-swing", "wood": True, "restAim": -62.0, "shotOffset": 0.0,
             "hand": {"front": "fist34", "back": "fist_dark"},
             "fx": {"release": {"img": "fx_smear", "rule": "swingArc", "z": "behindBody",
                                "params": {"back": 40.0, "radius": 0.92}}}},
    "knife": {"img": "knife", "family": "melee-stab", "wood": False, "restAim": -40.0, "shotOffset": 0.0,
              "hand": {"front": "fist34", "back": "fist_dark"},
              "fx": {"release": {"img": "fx_streak", "rule": "alongAim", "anchor": "tip", "at": "tip",
                                 "params": {"ahead": 4.0, "side": -5.0}, "z": 14.0}}},
    "slingshot": {"img": "sling_relaxed", "family": "ranged-recoil", "wood": True, "restAim": -96.0, "shotOffset": 90.0,
                  "hand": {"front": "fist", "back": "fist_dark"},
                  "fx": {"release": {"img": "fx_puff", "rule": "alongShot", "anchor": "cloud", "at": "fork",
                                     "params": {"ahead": 8.0, "side": 0.0}, "z": 14.0}}},
}

FAMILIES = {
    # same keys as the hero's attack clip (rig.py ATTACK). weaponBehind: draw the weapon behind the body on that
    # key (front slots only; the over-the-shoulder windup), optional, ignored by older compositors.
    "melee-swing": [
        {"ms": 60, "raise": 100, "elbow": -40, "aim": -108, "squash": 0.02, "weaponBehind": True, "raised": True, "rrot": 24.0},
        {"ms": 45, "raise": 36, "elbow": -62, "aim": 6, "thrust": 2, "show": ["release"], "ev": ["release"], "squash": -0.02},
        {"ms": 70, "raise": 10, "elbow": -56, "aim": 26, "thrust": 1, "squash": 0.025},
        {"ms": 80, "raise": 6, "elbow": -8, "aim": -40},
    ],
    "melee-stab": [
        {"ms": 60, "raise": -6, "elbow": 30, "aim": -46, "thrust": -3, "squash": 0.015},
        {"ms": 45, "raise": 26, "aim": -6, "straight": True, "thrust": 4, "show": ["release"], "ev": ["release"], "squash": -0.02},
        {"ms": 70, "raise": 20, "aim": 2, "straight": True, "thrust": 2, "squash": 0.02},
        {"ms": 80, "raise": 6, "elbow": -6, "aim": -30},
    ],
    "ranged-recoil": [
        {"ms": 90, "raise": 10, "elbow": 26, "aim": -98, "thrust": -4, "squash": 0.01},
        {"ms": 45, "raise": 16, "elbow": -40, "aim": -90, "thrust": 5, "show": ["release"], "ev": ["release"]},
        {"ms": 70, "raise": 26, "elbow": -14, "aim": -112, "thrust": 1, "squash": 0.015},
        {"ms": 80, "raise": 8, "elbow": -4, "aim": -100},
    ],
}
SPROUT = [{"ms": 40, "scale": 0.12, "squash": 0.06, "bud": 0.9, "dust": True}, {"ms": 40, "scale": 0.5, "squash": 0.05, "bud": 1.15},
          {"ms": 50, "scale": 1.15, "squash": 0.03, "bud": 0.7}, {"ms": 50, "scale": 0.94, "squash": -0.01},
          {"ms": 60, "scale": 1.0, "squash": 0.0}]


def walk_arm(slot_i, ph):
    lag = [0.0, 0.0, 1.2, 1.2 + math.pi, 0.6 + math.pi, 0.6][slot_i]
    amp = [8, 22, 10, 10, 18, 18][slot_i]
    c = math.cos(ph - lag)
    return {"raise": r2(amp * c), "elbow": r2(6 + 8 * (0.5 + 0.5 * math.cos(ph - lag - 0.8))), "wrist": r2(6 * math.cos(ph - lag - 1.0))}


def idle_arm(slot_i, ph):
    lag = 0.5 * (slot_i + 1)
    return {"raise": r2(3.5 * math.sin(ph - lag)), "elbow": r2(4 + 2 * math.sin(ph - lag - 0.9)), "wrist": r2(3 * math.sin(ph - lag - 1.2))}


# ============================================================================ armless sheet + body track
def armless_and_track(cfg):
    arm_parts = [n for n in cfg["parts"] if n.startswith(("armR", "armL", "handR", "handL", "budR", "budL", "club", "smear"))]  # + clubB
    acfg = copy.deepcopy({k: v for k, v in cfg.items() if k != "_dir"})
    acfg["_dir"] = cfg["_dir"]
    acfg["id"] = "player-potato-armless"
    acfg["title"] = "Spud body + legs, side view (multi-arm base, arms drawn at runtime)"
    for cname, cc in acfg["clips"].items():
        for f in cc["frames"]:
            if "painted" not in f:
                f["hide"] = sorted(set(f.get("hide", [])) | set(arm_parts))
                f["show"] = [s for s in f.get("show", []) if s not in arm_parts]
    res = rigkit.build(acfg, outdir=OUT, log=print)
    R = res["renderer"]
    PAD = rigkit.PAD
    K, D = sp.K, json.load(open(os.path.join(FIG, "src", "out", "geom.json")))["D"]
    C = sp.T(PAD - D[0], PAD - D[1]) @ sp.S(K)
    track = {"units": "matrix maps body px (side spud parts/cc/body.png px, the socket unit) -> hero cell px (192 cell, same cell "
                      "as player-potato.json / player-potato-armless.json); then the game's usual cell -> world draw",
             "cell": R.C, "clips": {}}
    for cname, cc in cfg["clips"].items():
        frames = rigkit.GENERATORS[cc["gen"]](cfg, res["parts"], cc)
        out = []
        for k, f in enumerate(frames):
            src = cc["frames"][k] if isinstance(cc["frames"], list) else {}
            if "painted" in f:
                out.append({"arms": False})
                continue
            M = rigkit.world_matrices(res["parts"], f["pose"])["body"]
            A = sp.S(R.s) @ sp.T(*R.off) @ M @ C
            e = {"arms": True, "m": [[round(float(v), 5) for v in row] for row in A[:2]]}
            if f["pose"].get("tint"):
                e["tint"] = f["pose"]["tint"]
            if "face_squint" in f["pose"].get("show", []):
                e["squint"] = True
            arms = src.get("_arms")
            if arms:
                e["native"] = {"R": {kk: r2(v) for kk, v in arms["R"].items()}, "L": {kk: r2(v) for kk, v in arms["L"].items()}}
            out.append(e)
        track["clips"][cname] = out
    return res, track


def main():
    lib = sp.Lib()
    P = build_parts(lib)
    shp = pack(P, os.path.join(OUT, "parts.png"), os.path.join(OUT, "parts.json"))
    print("parts atlas", shp[1], "x", shp[0], len(P), "parts")
    cfg = rigkit.load_config(os.path.join(FIG, "rig.py"))
    res, track = armless_and_track(cfg)
    # secondary arm motion per hero clip frame for every slot index (0..5): sprouted arms + natives holding
    # something other than the hero's own club (the hero's exact native poses are in body_track[...].native)
    sec = {"walk": [[walk_arm(i, f.get("_ph", 2 * math.pi * k / 8)) for i in range(6)] for k, f in enumerate(cfg["clips"]["walk"]["frames"])],
           "idle": [[idle_arm(i, f.get("_ph", 2 * math.pi * k / 6)) for i in range(6)] for k, f in enumerate(cfg["clips"]["idle"]["frames"])],
           "hurt": [[{"raise": 36.0, "elbow": -22.0, "wrist": -14.0}] * 6, [{"raise": 28.0, "elbow": -16.0, "wrist": -10.0}] * 6,
                    [{"raise": 10.0, "elbow": -5.0}] * 6],
           "attack": [[{}] * 6] * 4,
           "death": [[{"raise": -18.0, "elbow": 12.0}] * 6, [{"raise": 95.0, "elbow": -36.0, "wrist": -30.0}] * 6] + [[{}] * 6] * 5}
    track["secondary"] = sec
    json.dump(track, open(os.path.join(OUT, "body_track.json"), "w"), indent=1)
    sockets = {"units": "body px (parts/cc/body.png px of the side-view spud); dir/aim = screen deg, y down, 0 = right "
                        "(facing), -90 = up",
               "view": "side",
               "mirror": "every slot is side +1 (facing right); nothing is mirrored per slot. When the target is behind "
                         "the hero (or it walks left) the game mirrors the WHOLE composite (body cell + all arms) about "
                         "the anchor x, exactly like it already does for sheets; aim maths stays in the unmirrored frame "
                         "(mirror the target x about the anchor first). See compose_ref.MultiArm.frame(facing=-1).",
               "layers": {"front": "near side: drawn over the body (z > behindBodyZ), light arm + bud",
                          "back": "far side: behind the body (z < behindBodyZ), dark arm + dark hand"},
               "slots": SLOTS, "layouts": {n: {"slots": s, "override": o} for n, (s, o) in LAYOUTS.items()},
               "arms": {"native": {"midR": "arm_bent2", "midL": "arm_dark_bent2", "kind": "bent", "scale": 1.0},
                        "sprouted": {"front": "long_cut", "back": "long_dark_cut", "kind": "straight", "scale": SPROUT_SCALE},
                        "raised": {"front": "windup", "weaponZ": 9.4,
                                   "note": "keys with raised:true on a FRONT-layer arm swap the arm for this painting (club over "
                                           "the shoulder); the weapon goes through its fist, behind the body"}},
               "behindBodyZ": 10.0, "bud": {"part": "bud", "frontOnly": True}}
    json.dump(sockets, open(os.path.join(OUT, "sockets.json"), "w"), indent=1)
    json.dump({"weapons": WEAPONS, "fist34HandleAlongPlusX": True}, open(os.path.join(OUT, "weapons.json"), "w"), indent=1)
    json.dump({"families": FAMILIES, "sprout": SPROUT, "aimClamp": AIM_CLAMP, "jitterMs": JITTER, "sproutScale": SPROUT_SCALE,
               "armTurnShare": 0.6, "handD": sp.HAND_D, "loadoutRules": {"woodPerSide": "minimise (cost 10 per extra wooden weapon on a side, "
                                                                        "3 per vertically adjacent wooden pair, 1 per weapon that changes slot)"}},
              open(os.path.join(OUT, "families.json"), "w"), indent=1)
    print("wrote", sorted(f for f in os.listdir(OUT) if not f.endswith(".py")))

    # weapons v2 (bold side-view weapon set, baked bigger; code weapon drawScale -> 1.0): tools/weapons_v2/weapons_v2_apply.py
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "..", "tools", "weapons_v2"))
    import weapons_v2_apply as weapons_v2
    weapons_v2.apply(OUT, "potato")
    # art pass 9: multi-arm weapon spread + dark far-side weapon twins (tools/pass9/spread_apply.py, data in tools/pass9/data)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "..", "tools", "pass9"))
    import spread_apply as pass9
    pass9.apply(OUT, "potato")

if __name__ == "__main__":
    main()
