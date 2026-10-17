#!/usr/bin/env python3
"""Export the SIDE-VIEW chili's multi-arm runtime data (figures/player-chili/multiarm/). Same format as the spud
(figures/player-potato/multiarm/README.md) plus the side-view additions of art/HERO_SIDE_VIEW_BRIEF.md:
  sockets.json  "view": "side", per-slot "layer" ("front" = near side, in front of the body / "back" = far side,
                behind the body, dark arms), "hero" (which hero arm a native slot replays: R near / L far), a "mirror"
                note, and "arms.raised" (the painted raised arm used by keys with "raised": true).
  families.json melee-slash key 0 = {"raised": true, "rrot", "aim"} (+ raise/elbow fallback for arms without raised art)

  python3 figures/player-chili/multiarm/export.py
Writes: player-chili-armless.{json,png,webp}, body_track.json, parts.png/.json, sockets.json, weapons.json, families.json
All pixels are the paintings' own (affine transforms only; ink stroke on new cut edges).
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
import chili as sp  # noqa: E402
import numpy as np  # noqa: E402
import rigkit  # noqa: E402

OUT = HERE
SPROUT_SCALE = 0.85
AIM_CLAMP = 50.0
JITTER = [80, 200]
F = sp.SPUD_F
SPUD_SC = {"club": 0.48, "sling": 0.47, "fx_smear": 0.8, "fx_streak": 0.5, "fx_puff": 0.42, "fx_dust": 0.55}
FX_SLASH_K = 0.46            # = the hero strike slash size


def r2(v):
    return round(float(v), 2)


def pt(p):
    return [r2(p[0]), r2(p[1])]


def scaled(img, k):
    out, (x0, y0) = sp.bake(img, sp.S(k), pad=2)
    return out, sp.T(-x0, -y0) @ sp.S(k)


def trim(img, M):
    A = img[..., 3] > 0.01
    ys, xs = np.where(A)
    x0, y0 = max(0, xs.min() - 2), max(0, ys.min() - 2)
    x1, y1 = min(img.shape[1], xs.max() + 3), min(img.shape[0], ys.max() + 3)
    return img[y0:y1, x0:x1].copy(), sp.T(-x0, -y0) @ M


def build_parts(lib):
    P = {}

    def add(name, rgba, pts, **meta):
        P[name] = (rgba, {k: pt(v) for k, v in pts.items()}, meta)

    for n, a in lib.arms.items():
        for half in ("upper", "fore"):
            img, M = trim(*scaled(a[half], sp.SC["arm"]))
            add(f"{n}_{half}", img, {"shoulder": sp.ap(M, a["shoulder"]), "elbow": sp.ap(M, a["elbow"]), "wrist": sp.ap(M, a["wrist"])},
                src="chili side " + n + " (painted fist cut off at the wrist)", dir0=r2(a["dir0"]), fore0=r2(a["fore0"]))
    for n, src in (("long_cut", "arm2"), ("long_dark_cut", "arm_dark2")):
        la = lib.long[src]
        img, M = trim(*scaled(la["img"], sp.SC["long_arm"]))
        sh, wr = sp.ap(M, la["shoulder"]), sp.ap(M, la["wrist"])
        add(n, img, {"shoulder": sh, "wrist": wr}, src="chili side " + src + " (fist cut off)",
            dir0=r2(math.degrees(math.atan2(wr[1] - sh[1], wr[0] - sh[0]))))
    ra = lib.raised
    img, M = scaled(ra["img"], sp.SC["raised"])
    sh, g = sp.ap(M, ra["shoulder"]), sp.ap(M, ra["grip"])
    add("raised", img, {"shoulder": sh, "grip": g}, src="chili side arm_raised (keeps its painted fist)",
        dir0=r2(math.degrees(math.atan2(g[1] - sh[1], g[0] - sh[0]))),
        note="shoulder point lies BELOW the painting (a shrug: the arm starts behind the body edge); the weapon "
             "goes through the painted fist (grip) and is drawn BEHIND the body")
    img, M = trim(*scaled(lib.fist34, sp.SC["fist34"]))
    add("fist34", img, {"wrist": sp.ap(M, sp.FIST34["wrist"]), "grip": sp.ap(M, sp.FIST34["grip"])},
        src="chili side fist_handle (painted handle removed, rotated: handle along +x)", axis=0.0,
        note="handle runs along +x through the curl; draw the weapon UNDER it")
    for n in ("fist", "fist_dark", "palm", "palm_dark"):
        k = sp.SC["palm"] if n == "palm" else sp.SC["hand"]
        img, M = scaled(lib.hands[n], k)
        note = {"palm_dark": "no dark open hand painted: = fist_dark (the far hand stays a fist)"}.get(n, "")
        add(n, img, {"grip": sp.ap(M, sp.HANDS[n]["grip"])}, src="chili side " + n + " (pre-rotated for the R(d_fore - 22) rule)",
            **({"note": note} if note else {}))
    img, M = scaled(lib.knife, sp.SC["knife"])
    add("knife", img, {"grip": sp.ap(M, sp.KNIFE["grip"]), "tip": sp.ap(M, sp.KNIFE["tip"]), "head": sp.ap(M, sp.KNIFE["tip"])},
        src="chili side knife", axis=r2(sp.KNIFE["axis"]))
    img, M = scaled(lib.cleaver, sp.SC["cleaver"])
    add("cleaver", img, {"grip": sp.ap(M, sp.CLEAVER["grip"]), "head": sp.ap(M, sp.CLEAVER["head"]), "tip": sp.ap(M, sp.CLEAVER["head"])},
        src="chili v1 cleaver (frontal sheet; no side cleaver painted)", axis=r2(sp.CLEAVER["axis"]))
    club = sp.load_spud("v1", "club")
    img, M = scaled(club, SPUD_SC["club"] * F)
    add("club", img, {"grip": sp.ap(M, (36.0, 136.0)), "head": sp.ap(M, (150.0, 30.0))}, src="spud v1 club", axis=-48.0)
    img, M = scaled(sp.load_spud("v1", "sling_relaxed"), SPUD_SC["sling"] * F)
    add("sling_relaxed", img, {"grip": sp.ap(M, (30.0, 136.0)), "fork": sp.ap(M, (95.0, 10.0))}, src="spud v1 sling_relaxed", axis=-63.0)
    img, M = scaled(lib.slash, FX_SLASH_K)
    add("fx_slash", img, {"bulge": sp.ap(M, lib.slash_lead)},
        src="chili side slash (rotated by -%.0f deg: at the strike the runtime rotation shows it as painted)" % sp.SLASH_MID_REF,
        note="`bulge` = the spray LEAD end (sits on the blade path); the thin crescent trails up and back over the head")
    sm = sp.clean_fx(sp.load_spud("v2", "fx_smear"))
    A = sm[..., 3] > 0.5
    ys, xs = np.where(A)
    bul = (float(xs.min()), float(ys[xs < xs.min() + 3].mean()))
    h, w = sm.shape[:2]
    Mf = sp.T(w * SPUD_SC["fx_smear"] * F, 0) @ sp.FLIPX @ sp.S(SPUD_SC["fx_smear"] * F)
    img, (x0, y0) = sp.bake(sm, Mf, pad=2)
    add("fx_smear", img, {"bulge": sp.ap(sp.T(-x0, -y0) @ Mf, bul)}, src="spud v2 fx_smear (mirrored)")
    pf = sp.clean_fx(sp.load_spud("v2", "fx_puff"))
    A = pf[..., 3] > 0.5
    ys, xs = np.where(A[:, : int(0.38 * pf.shape[1])])
    img, M = scaled(pf, SPUD_SC["fx_puff"] * F)
    add("fx_puff", img, {"cloud": sp.ap(M, (float(xs.mean()), float(ys.mean())))}, src="spud v2 fx_puff")
    du = sp.clean_fx(sp.load_spud("v2", "fx_dust"))
    img, M = scaled(du, SPUD_SC["fx_dust"] * F)
    add("fx_dust", img, {"center": (img.shape[1] / 2, img.shape[0] / 2)}, src="spud v2 fx_dust")
    return P


def pack(P, out_png, out_json):
    from PIL import Image
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
    H = 1 << (y + rowh - 1).bit_length()
    atlas = np.zeros((H, W, 4), np.float32)
    for n, (img, pts, meta) in items:
        x, y, w, h = rects[n]
        atlas[y:y + h, x:x + w] = img
    Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(out_png)
    js = {"image": os.path.basename(out_png), "units": "1 part px = 1 body px (parts/legacy/body.png px = legacy rest px + 10)",
          "parts": {n: dict({"rect": list(rects[n]), "points": P[n][1]}, **P[n][2]) for n in sorted(P)}}
    json.dump(js, open(out_json, "w"), indent=1)
    return atlas.shape


# ============================================================================ sockets: a ladder down each body side
# front = near side (right edge of the body, z > 10, red arms); back = far side (left edge, z < 10, dark arms)
SLOTS = {
    "midN": {"pos": [101, 146], "side": 1, "layer": "front", "hero": "R", "dir": 70.0, "z": 11.0, "native": True},
    "midF": {"pos": [44, 139], "side": 1, "layer": "back", "hero": "L", "dir": 108.0, "z": 4.0, "native": True},
    "upN": {"pos": [102, 112], "side": 1, "layer": "front", "dir": -20.0, "z": 11.4, "native": False},
    "upF": {"pos": [46, 106], "side": 1, "layer": "back", "dir": -5.0, "z": 4.2, "native": False},
    "lowN": {"pos": [97, 180], "side": 1, "layer": "front", "dir": 40.0, "z": 11.2, "native": False},
    "lowF": {"pos": [50, 172], "side": 1, "layer": "back", "dir": 115.0, "z": 3.8, "native": False},
}
LAYOUTS = {"1": ["midN", "midF"], "2": ["midN", "midF"], "3": ["midN", "midF", "upN"], "4": ["midN", "midF", "upN", "upF"],
           "5": ["midN", "midF", "upN", "upF", "lowN"], "6": ["midN", "midF", "upN", "upF", "lowN", "lowF"]}

WEAPONS = {
    "knife": {"img": "knife", "family": "melee-slash", "wood": False, "restAim": -62.0, "shotOffset": 0.0,
              "hand": {"front": "fist34", "back": "fist_dark"},
              "fx": {"release": {"img": "fx_slash", "rule": "swingArc", "z": "aboveArm",
                                 "params": {"back": 10.0, "radius": 0.92}}}},
    "cleaver": {"img": "cleaver", "family": "melee-swing", "wood": False, "restAim": -62.0, "shotOffset": 0.0,
                "hand": {"front": "fist34", "back": "fist_dark"},
                "fx": {"release": {"img": "fx_slash", "rule": "swingArc", "z": "aboveArm",
                                   "params": {"back": 16.0, "radius": 0.9}}}},
    "club": {"img": "club", "family": "melee-swing", "wood": True, "restAim": -62.0, "shotOffset": 0.0,
             "hand": {"front": "fist34", "back": "fist_dark"},
             "fx": {"release": {"img": "fx_smear", "rule": "swingArc", "z": "behindBody",
                                "params": {"back": 45.0, "radius": 0.92}}}},
    "slingshot": {"img": "sling_relaxed", "family": "ranged-recoil", "wood": True, "restAim": -96.0, "shotOffset": 90.0,
                  "hand": {"front": "fist", "back": "fist_dark"},
                  "fx": {"release": {"img": "fx_puff", "rule": "alongShot", "anchor": "cloud", "at": "fork",
                                     "params": {"ahead": 8.0, "side": 0.0}, "z": 14.0}}},
}


def load_rig():
    import importlib.util
    spec = importlib.util.spec_from_file_location("chili_rig", os.path.join(FIG, "rig.py"))
    rig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rig)
    return rig


def slash_family(rig):
    A = rig.ATTACK_R
    keep = lambda d: {k: v for k, v in d.items() if k in ("raise", "elbow", "aim", "thrust", "raised", "rrot")}  # noqa: E731
    return [
        # windup: painted raised arm (front layer); arms without raised art (back layer) use raise/elbow instead
        dict({"ms": 60}, **keep(A[0]), raise_=None, squash=0.03),
        dict({"ms": 45}, **keep(A[1]), show=["release"], ev=["release"], squash=-0.03),
        dict({"ms": 70}, **keep(A[2]), show=["release"], squash=0.025),
        dict({"ms": 80}, **keep(A[3])),
    ]


FAMILIES = {
    "melee-swing": [
        {"ms": 60, "raise": 120, "elbow": 20, "aim": -150, "squash": 0.02},
        {"ms": 45, "raise": 40, "elbow": -20, "aim": 10, "thrust": 2, "show": ["release"], "ev": ["release"], "squash": -0.02},
        {"ms": 70, "raise": 0, "elbow": -10, "aim": 60, "thrust": 1, "squash": 0.025},
        {"ms": 80, "raise": 10, "elbow": 30, "aim": -50},
    ],
    "ranged-recoil": [
        {"ms": 90, "raise": 40, "elbow": 26, "aim": -98, "thrust": -4, "squash": 0.01},
        {"ms": 45, "raise": 50, "elbow": -30, "aim": -90, "thrust": 5, "show": ["release"], "ev": ["release"]},
        {"ms": 70, "raise": 56, "elbow": -10, "aim": -112, "thrust": 1, "squash": 0.015},
        {"ms": 80, "raise": 40, "elbow": 0, "aim": -100},
    ],
}
SPROUT = [{"ms": 40, "scale": 0.12, "squash": 0.06, "dust": True}, {"ms": 40, "scale": 0.5, "squash": 0.05},
          {"ms": 50, "scale": 1.15, "squash": 0.03}, {"ms": 50, "scale": 0.94, "squash": -0.01},
          {"ms": 60, "scale": 1.0, "squash": 0.0}]


def walk_arm(slot_i, ph):
    lag = [0.0, 0.0, 1.2, 1.2 + math.pi, 0.6, 0.6 + math.pi][slot_i]
    amp = [7, 22, 10, 10, 16, 16][slot_i]
    c = math.cos(ph - lag)
    return {"raise": r2(amp * c), "elbow": r2(6 + 8 * (0.5 + 0.5 * math.cos(ph - lag - 0.8))), "wrist": r2(6 * math.cos(ph - lag - 1.0))}


def idle_arm(slot_i, ph):
    lag = 0.5 * (slot_i + 1)
    return {"raise": r2(3.5 * math.sin(ph - lag)), "elbow": r2(4 + 2 * math.sin(ph - lag - 0.9)), "wrist": r2(3 * math.sin(ph - lag - 1.2))}


NATIVE_KEYS = ("raise", "elbow", "aim", "thrust", "wrist", "raised", "rrot")


def armless_and_track(cfg):
    arm_parts = [n for n in cfg["parts"] if n.startswith(("armR", "armL", "handR", "handL", "knife", "slash"))]
    acfg = copy.deepcopy({k: v for k, v in cfg.items() if k != "_dir"})
    acfg["_dir"] = cfg["_dir"]
    acfg["id"] = "player-chili-armless"
    acfg["title"] = "Chili body + legs, side view (multi-arm base, arms drawn at runtime)"
    for cname, cc in acfg["clips"].items():
        for f in cc["frames"]:
            if "painted" not in f:
                f["hide"] = sorted(set(f.get("hide", [])) | set(arm_parts))
                f["show"] = [s for s in f.get("show", []) if s not in arm_parts]
    res = rigkit.build(acfg, outdir=OUT, log=print)
    R = res["renderer"]
    PAD = rigkit.PAD
    D = json.load(open(os.path.join(FIG, "src", "out", "geom.json")))["D"]
    C = sp.T(PAD - D[0], PAD - D[1]) @ sp.S(sp.K)
    track = {"units": "matrix maps body px (the socket unit) -> hero cell px (192 cell, same cell as player-chili.json / "
                      "player-chili-armless.json), FACING RIGHT; for a left-facing hero mirror the composed cell about "
                      "the anchor x (see sockets.json mirror)", "cell": R.C, "clips": {}}
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
            if arms and cname != "attack":     # attack natives come from the family keys (else raise counts twice)
                e["native"] = {h: {kk: (v if isinstance(v, bool) else r2(v)) for kk, v in arms[h].items() if kk in NATIVE_KEYS}
                               for h in ("R", "L")}
            out.append(e)
        track["clips"][cname] = out
    return res, track


def main():
    lib = sp.Lib()
    P = build_parts(lib)
    shp = pack(P, os.path.join(OUT, "parts.png"), os.path.join(OUT, "parts.json"))
    print("parts atlas", shp[1], "x", shp[0], len(P), "parts")
    rig = load_rig()
    cfg = rigkit.load_config(os.path.join(FIG, "rig.py"))
    res, track = armless_and_track(cfg)
    track["secondary"] = {
        "walk": [[walk_arm(i, 2 * math.pi * k / 8) for i in range(6)] for k in range(8)],
        "idle": [[idle_arm(i, 2 * math.pi * k / 6) for i in range(6)] for k in range(6)],
        "hurt": [[{"raise": 36.0, "elbow": -22.0, "wrist": -14.0}] * 6, [{"raise": 28.0, "elbow": -16.0, "wrist": -10.0}] * 6,
                 [{"raise": 10.0, "elbow": -5.0}] * 6],
        "attack": [[{}] * 6] * 4,
        "death": [[{"raise": -18.0, "elbow": 12.0}] * 6, [{"raise": 95.0, "elbow": -36.0, "wrist": -30.0}] * 6] + [[{}] * 6] * 5}
    json.dump(track, open(os.path.join(OUT, "body_track.json"), "w"), indent=1)
    sockets = {
        "view": "side",
        "units": "body px (parts/legacy/body.png px); dir/aim = screen deg, y down, 0 = right = FACING, -90 = up. "
                 "All slots are canonical facing-right (side +1); `layer` front = near side (drawn over the body), "
                 "back = far side (drawn behind it, dark arms + dark hands).",
        "mirror": "The figure faces its walking direction; when walking left OR when the target is behind "
                  "(target x < anchor x in facing-right space), the WHOLE composed figure (body + every arm) is mirrored "
                  "about the anchor x. Compose facing right with the target mirrored into facing-right space, then flip "
                  "the result (compose_ref.MultiArm.frame(..., facing=-1)). Arms therefore only ever aim into the facing "
                  "half-plane (aimClamp around the weapon rest aim).",
        "slots": SLOTS, "layouts": {n: {"slots": s, "override": {}} for n, s in LAYOUTS.items()},
        "arms": {"native": {"midN": "arm1", "midF": "arm_dark1", "kind": "bent", "scale": 1.0},
                 "sprouted": {"front": "long_cut", "back": "long_dark_cut", "kind": "straight", "scale": SPROUT_SCALE},
                 "raised": {"front": "raised", "weaponZ": 9.5,
                            "note": "keys with raised:true on a FRONT-layer arm swap the arm for this painting (one piece, "
                                    "rotated by rrot about its shoulder) and draw the weapon at weaponZ (behind the body = "
                                    "behind the head); back-layer arms use the key's raise/elbow instead"}},
        "behindBodyZ": 10.0, "bud": None,
    }
    json.dump(sockets, open(os.path.join(OUT, "sockets.json"), "w"), indent=1)
    json.dump({"weapons": WEAPONS, "fist34HandleAlongPlusX": True}, open(os.path.join(OUT, "weapons.json"), "w"), indent=1)
    fams = dict(FAMILIES)
    sl = slash_family(rig)
    sl[0].pop("raise_", None)
    sl[0].update({"raise": 120, "elbow": 20})          # fallback for back-layer arms (no raised painting)
    fams["melee-slash"] = sl
    json.dump({"families": fams, "sprout": SPROUT, "aimClamp": AIM_CLAMP, "jitterMs": JITTER, "sproutScale": SPROUT_SCALE,
               "armTurnShare": 0.6, "handD": sp.HAND_D,
               "loadoutRules": {"woodPerLayer": "minimise (cost 10 per extra wooden weapon on a layer, 3 per vertically adjacent "
                                                "wooden pair, 1 per weapon that changes slot)"}},
              open(os.path.join(OUT, "families.json"), "w"), indent=1)
    print("wrote", sorted(f for f in os.listdir(OUT) if not f.endswith(".py")))


if __name__ == "__main__":
    main()
