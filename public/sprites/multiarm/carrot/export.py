#!/usr/bin/env python3
"""Export the SIDE-VIEW carrot's multi-arm runtime data (figures/player-carrot/multiarm/). Same format as the spud's
front-facing export (figures/player-potato/multiarm/README.md) plus the side-view fields: sockets.json "view": "side",
per-slot "layer" ("front" / "back"), "mirror" note, "emptyHand": null, "bud": null; weapons alt "imgsBack".
(The front-facing carrot export is kept in frontal_v2/multiarm/.)

  python3 figures/player-carrot/multiarm/export.py
Writes: player-carrot-armless.{json,png,webp}  body+legs+tuft sheet, SAME cells/clips/anchor as the hero sheet, no arms
        body_track.json   per clip frame: body px -> hero-cell px matrix, arms visible, tint, native arm poses
                          (native "R" = NEAR arm (front layer), "L" = FAR arm (back layer))
        parts.png/.json   every arm / hand / weapon / fx painting, pre-scaled to body px, with named points
                          (carrot side paintings + the carrot spear and the shared club / knife / fx from
                          frontal_v2/multiarm, rescaled to side body px so they keep their on-screen size)
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
import polishkit  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import rigkit  # noqa: E402

OUT = HERE
FRONTAL_MA = os.path.join(FIG, "frontal_v2", "multiarm")      # shared weapons / fx / families (frozen copy)
KF = cr.K_FRONTAL / cr.K                                       # frontal body px -> side body px
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
    import spritekit as sk
    P = {}

    def add(name, rgba, pts, **meta):
        P[name] = (rgba, {k: pt(v) for k, v in pts.items()}, meta)

    # bent arms split at the elbow: arm_L (near native), arm_dark_bent (far native), arm_bent (spare)
    for n in ("arm_L", "arm_dark_bent", "arm_bent"):
        a = lib.arms[n]
        for half, src in (("upper", "upper"), ("fore", "lower")):
            img, M = scaled(a[src], cr.SC["arm"])
            pts = {"shoulder": cr.ap(M, a["shoulder"]), "elbow": cr.ap(M, a["elbow"]), "wrist": cr.ap(M, a["wrist"])}
            add(f"{n}_{half}", img, pts, src="carrot side_v1 " + n, dir0=r2(a["dir0"]), fore0=r2(a["fore0"]))
    # straight arms = sprouted arms (light for front-layer slots, dark for back-layer slots); painted small fist at the
    # end is covered by the weapon fist (handD past the wrist)
    for n, out in (("arm_straight", "straight"), ("arm_dark_straight", "straight_dark")):
        a = lib.arms[n]
        img, M = scaled(a["whole"], cr.SC["arm"])
        sh, wr = cr.ap(M, a["shoulder"]), cr.ap(M, a["wrist"])
        add(out, img, {"shoulder": sh, "wrist": wr}, src="carrot side_v1 " + n, dir0=r2(cr.ang(sh, wr)))
    # hands: fists (light / dark painted), palms (light painted, dark = palette tint of the light one)
    # polish: the stub arm's own painted fist (pre-turned for R(d_fore - 22)), at the arm's scale
    for n, img0, gp in (("fist", lib.fist, lib.fist_grip), ("fist_dark", lib.fist_dark, lib.fist_dark_grip)):
        img, M = scaled(img0, cr.SC["hand"])
        add(n, img, {"grip": cr.ap(M, gp)}, src="heroes_inbetween_v1 carrot stub arm, own painted fist (polish)")
    img, M = scaled(lib.palm, cr.SC["palm"])
    add("palm", img, {"grip": cr.ap(M, cr.PTS["palm"]["wrist"])}, src="carrot side_v1 palm")
    # painted dark open palm (fingers up as painted): pre-turned 90 + 22 so compose_ref's R(d_fore - 22) points the
    # fingers along the forearm; grip = handD (body px) up the fingers from the painted wrist
    pw = cr.PTS["palm_dark"]["wrist"]
    pdi, Mp = polishkit.rot_about(lib.palm_dark, 90.0 + cr.HAND_ROT, pw)
    gpd = (pw[0], pw[1] - cr.HAND_D / cr.SC["palm_dark"])
    img, M = scaled(pdi, cr.SC["palm_dark"])
    add("palm_dark", img, {"grip": cr.ap(M @ Mp, gpd)}, src="heroes_inbetween_v1 chili row dark open palm, carrot dark palette (polish)")
    img, M = scaled(lib.pinch, cr.SC["hand"])
    add("pinch", img, {"grip": cr.ap(M, cr.PTS["pinch"]["grip"]), "wrist": cr.ap(M, cr.PTS["pinch"]["wrist"])}, src="carrot side_v1 pinch")
    # slingshot (relaxed, as painted: band loop trails back)
    img0, pts0, axis0 = lib.slings["sling_relaxed"]
    img, M = scaled(img0, cr.SC["sling"])
    add("sling_relaxed", img, {"grip": cr.ap(M, pts0["grip"]), "fork": cr.ap(M, pts0["fork"])}, src="carrot side_v1 sling_relaxed",
        axis=r2(axis0))
    # one-arm alt = the painted drawn slingshot (painted band length, pinch hand + pebble) with the slot's fist baked on the
    # grip (light fist + light pinch for front slots, dark fist + dark-tinted pinch for back slots)
    for nm, dark in (("sling_drawn", False), ("sling_drawn_dark", True)):
        imd, ptsd, axisd = cr.drawn_sling(stretch=1.0, dark_pinch=dark)
        ls = cr.S(cr.SC["sling"]) @ cr.T(-ptsd["grip"][0], -ptsd["grip"][1])          # grip at (0, 0), axis unchanged
        fist = lib.fist_dark if dark else lib.fist
        gp = lib.fist_dark_grip if dark else lib.fist_grip
        # fist as the runtime places it for a forearm along d_fore with the slingshot at aim: relative rot = d_fore - 22 - (aim - axis)
        rel = (-10.0 - cr.HAND_ROT) - (-90.0 - axisd)
        lf = cr.R(rel) @ cr.S(cr.SC["hand"]) @ cr.T(-gp[0], -gp[1])
        bs, os_ = cr.bake(imd, ls, pad=2)
        bf, of = cr.bake(fist, lf, pad=2)
        x0, y0 = min(os_[0], of[0]), min(os_[1], of[1])
        x1 = max(os_[0] + bs.shape[1], of[0] + bf.shape[1])
        y1 = max(os_[1] + bs.shape[0], of[1] + bf.shape[0])
        can = np.zeros((int(y1 - y0), int(x1 - x0), 4), np.float32)
        sk.paste(can, bs, os_[0] - x0, os_[1] - y0)
        sk.paste(can, bf, of[0] - x0, of[1] - y0)
        sh = cr.T(-x0, -y0)
        add(nm, can, {"grip": cr.ap(sh, (0, 0)), "fork": cr.ap(sh @ ls, ptsd["fork"]), "pouch": cr.ap(sh @ ls, ptsd["pouch"])},
            src="carrot side_v1 sling_drawn (mirrored; painted pinch hand" + (", tinted dark" if dark else "") + ") + fist on the grip",
            axis=r2(axisd), note="fist + stretched band + pinch hand baked together: the runtime hides the separate hand while shown")
    # polish: one-arm windup alt = the PAINTED half-drawn slingshot in a carrot hand (heroes_inbetween_v1), mirrored
    # to shoot right; light hand for front slots, hand recoloured dark for back slots (the hand is part of the painting)
    for nm, img0 in (("sling_half", lib.sling_half), ("sling_half_dark", lib.sling_half_dark)):
        sp = cr.PTS["sling_half"]
        W = img0.shape[1]
        im = img0[:, ::-1].copy()
        q = {k: (W - 1 - v[0], v[1]) for k, v in sp.items()}
        img, M = scaled(im, cr.SC["sling_half"])
        add(nm, img, {k: cr.ap(M, v) for k, v in q.items()}, axis=r2(cr.ang(q["grip"], q["fork"])),
            src="heroes_inbetween_v1 carrot row half-drawn slingshot (mirrored; painted carrot hand" + (", recoloured dark" if "dark" in nm else "") + ")",
            note="painted hand included: the runtime hides the separate hand while shown")
    # carrot spear (frontal v2 painting) + shared spud club / knife / fx, frontal body px -> side body px (x KF)
    fj = json.load(open(os.path.join(FRONTAL_MA, "parts.json")))
    fatlas = np.asarray(Image.open(os.path.join(FRONTAL_MA, fj["image"])).convert("RGBA")).astype(np.float32) / 255
    for n in ("spear", "club", "knife", "fx_smear", "fx_streak", "fx_puff", "fx_dust"):
        p = fj["parts"][n]
        x, y, w, h = p["rect"]
        img, M = scaled(fatlas[y:y + h, x:x + w].copy(), KF)
        meta = {k: v for k, v in p.items() if k not in ("rect", "points")}
        meta["src"] = "frontal_v2/multiarm (x%.3f to side body px) " % KF + str(meta.get("src", ""))
        add(n, img, {k: cr.ap(M, v) for k, v in p["points"].items()}, **meta)
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
    js = {"image": os.path.basename(out_png), "units": "1 part px = 1 body px (the side carrot's upright body canvas, "
                                                       "K = %.2f rest px per body px)" % cr.K,
          "parts": {n: dict({"rect": list(rects[n]), "points": P[n][1]}, **P[n][2]) for n in sorted(P)}}
    json.dump(js, open(out_json, "w"), indent=1)
    return atlas.shape


# ============================================================================ sockets / weapons / families
def _slots():
    """ladder of shoulders down the body side: front-layer slots (light arms, drawn over the body) near the front edge,
    back-layer slots (dark arms, behind the body) a little further in so the arm emerges at the front edge."""
    def at(frac, inset, side=+1):
        x, y = cr.edge_x(frac, side)
        return [r2(x - inset * side), r2(y)]
    n, f = cr.HERO["near"], cr.HERO["far"]
    return {   # names / fields as the chili's side export: N = near (front layer), F = far (back layer); side +1 everywhere
        "midN": {"pos": pt(n["pos"]), "side": 1, "layer": "front", "hero": "R", "dir": n["dir"], "z": 11.0, "native": True},
        "midF": {"pos": pt(f["pos"]), "side": 1, "layer": "back", "hero": "L", "dir": f["dir"], "z": 4.0, "native": True},
        "upF": {"pos": at(0.58, 16), "side": 1, "layer": "back", "dir": 15.0, "z": 4.2, "native": False},
        "lowN": {"pos": at(0.80, 7), "side": 1, "layer": "front", "dir": 55.0, "z": 11.2, "native": False},
        "lowF": {"pos": at(0.80, 18), "side": 1, "layer": "back", "dir": 35.0, "z": 3.8, "native": False},
        "upN": {"pos": at(0.585, 5), "side": 1, "layer": "front", "dir": 5.0, "z": 11.4, "native": False},
    }


SLOTS = _slots()
ARMED_FAR = {"midF": {"dir": 72.0}}          # far native arm reaches forward under the body when it holds a weapon
LAYOUTS = {"1": (["midN", "midF"], {}), "2": (["midN", "midF"], ARMED_FAR), "3": (["midN", "midF", "upF"], ARMED_FAR),
           "4": (["midN", "midF", "upF", "lowN"], ARMED_FAR), "5": (["midN", "midF", "upF", "lowN", "lowF"], ARMED_FAR),
           "6": (["midN", "midF", "upF", "lowN", "lowF", "upN"], ARMED_FAR)}

WEAPONS = {
    "slingshot": {"img": "sling_relaxed", "family": "ranged-recoil", "wood": True, "restAim": cr.HERO["rest_aim"], "shotOffset": 90.0,
                  "hand": {"front": "fist", "back": "fist_dark"},
                  "alt": {"imgs": ["sling_half"], "imgsBack": ["sling_half_dark"], "pick": "slotIndex % 1", "hidesHand": True},
                  "fx": {"release": {"img": "fx_puff", "rule": "alongShot", "anchor": "cloud", "at": "fork",
                                     "params": {"ahead": 8.0, "side": 0.0}, "z": 14.0}}},
    "spear": {"img": "spear", "family": "melee-stab", "wood": True, "restAim": -50.0, "shotOffset": 0.0,
              "hand": {"front": "fist", "back": "fist_dark"},
              "fx": {"release": {"img": "fx_streak", "rule": "alongAim", "anchor": "tip", "at": "tip",
                                 "params": {"ahead": 4.0, "side": -5.0}, "z": 14.0}}},
    "club": {"img": "club", "family": "melee-swing", "wood": True, "restAim": -62.0, "shotOffset": 0.0,
             "hand": {"front": "fist", "back": "fist_dark"},
             "fx": {"release": {"img": "fx_smear", "rule": "swingArc", "z": "behindBody",
                                "params": {"back": 45.0, "radius": 0.92}}}},
    "knife": {"img": "knife", "family": "melee-stab", "wood": False, "restAim": -40.0, "shotOffset": 0.0,
              "hand": {"front": "fist", "back": "fist_dark"},
              "fx": {"release": {"img": "fx_streak", "rule": "alongAim", "anchor": "tip", "at": "tip",
                                 "params": {"ahead": 4.0, "side": -5.0}, "z": 14.0}}},
}

FAMILIES = json.load(open(os.path.join(FRONTAL_MA, "families.json")))["families"]     # identical motion templates (spud)
SPROUT = json.load(open(os.path.join(FRONTAL_MA, "families.json")))["sprout"]


def walk_arm(slot_i, ph):
    lag = [0.0, 0.0, 1.2, 1.2 + math.pi, 0.6 + math.pi, 0.6][slot_i]
    amp = [8, 22, 10, 10, 18, 18][slot_i]
    c = math.cos(ph - lag)
    return {"raise": r2(amp * c), "elbow": r2(6 + 8 * (0.5 + 0.5 * math.cos(ph - lag - 0.8))), "wrist": r2(6 * math.cos(ph - lag - 1.0))}


def idle_arm(slot_i, ph):
    lag = 0.5 * (slot_i + 1)
    return {"raise": r2(3.5 * math.sin(ph - lag)), "elbow": r2(4 + 2 * math.sin(ph - lag - 0.9)), "wrist": r2(3 * math.sin(ph - lag - 1.2))}


ARM_PARTS = ("armN", "armF", "handN", "palmF", "sling", "puff")


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
    track = {"units": "matrix maps body px (side carrot upright body canvas px, the socket unit) -> hero cell px (192 cell, "
                      "same cell as player-carrot.json / player-carrot-armless.json); then the game's usual cell -> world draw "
                      "(mirrored about the anchor when facing left). native R = near arm (front layer), L = far arm (back layer)",
             "view": "side",
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
            if arms and cname != "attack":         # attacking arms take the family keys (no double raise)
                nat = {}
                for side, key in (("R", "N"), ("L", "F")):
                    d = {kk: r2(v) for kk, v in arms[key].items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
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
    sec = {"walk": [[walk_arm(i, f.get("_ph", 2 * math.pi * k / 8)) for i in range(6)] for k, f in enumerate(cfg["clips"]["walk"]["frames"])],
           "idle": [[idle_arm(i, f.get("_ph", 2 * math.pi * k / 6)) for i in range(6)] for k, f in enumerate(cfg["clips"]["idle"]["frames"])],
           "hurt": [[{"raise": 36.0, "elbow": -22.0, "wrist": -14.0}] * 6, [{"raise": 28.0, "elbow": -16.0, "wrist": -10.0}] * 6,
                    [{"raise": 10.0, "elbow": -5.0}] * 6],
           "attack": [[{}] * 6] * 4,
           "death": [[{"raise": -18.0, "elbow": 12.0}] * 6, [{"raise": 95.0, "elbow": -36.0, "wrist": -30.0}] * 6] + [[{}] * 6] * 5}
    track["secondary"] = sec
    json.dump(track, open(os.path.join(OUT, "body_track.json"), "w"), indent=1)
    sockets = {"view": "side",
               "units": "body px (side carrot upright body canvas px); dir/aim = screen deg, y down, 0 = right = FACING, -90 = up. "
                        "All slots are canonical facing-right (side +1); `layer` front = near side (drawn over the body), "
                        "back = far side (drawn behind it, dark arms + dark hands). Native slots replay the hero arm named "
                        "by `hero` (R = near, L = far) from body_track.",
               "mirror": "The figure faces its walking direction; when walking left OR when the target is behind (target x < "
                         "anchor x in facing-right space), the WHOLE composed figure (body + every arm) is mirrored about the "
                         "anchor x. Compose facing right with the target mirrored into facing-right space, then flip the "
                         "result (compose_ref.MultiArm.frame(..., facing=-1)). Arms only ever aim into the facing half-plane.",
               "slots": SLOTS, "layouts": {n: {"slots": s_, "override": o} for n, (s_, o) in LAYOUTS.items()},
               "arms": {"native": {"midN": "arm_L", "midF": "arm_dark_bent", "kind": "bent", "scale": 1.0},
                        "sprouted": {"front": "straight", "back": "straight_dark", "kind": "straight", "scale": SPROUT_SCALE},
                        "emptyHand": None},
               "behindBodyZ": 10.0, "bud": None}
    json.dump(sockets, open(os.path.join(OUT, "sockets.json"), "w"), indent=1)
    json.dump({"weapons": WEAPONS, "fist34HandleAlongPlusX": True}, open(os.path.join(OUT, "weapons.json"), "w"), indent=1)
    json.dump({"families": FAMILIES, "sprout": SPROUT, "aimClamp": AIM_CLAMP, "jitterMs": JITTER, "sproutScale": SPROUT_SCALE,
               "armTurnShare": 0.6, "handD": cr.HAND_D, "handRot": cr.HAND_ROT, "loadoutRules": {"woodPerSide": "minimise (cost 10 per extra wooden weapon on a side, "
                                                                        "3 per vertically adjacent wooden pair, 1 per weapon that changes slot)"}},
              open(os.path.join(OUT, "families.json"), "w"), indent=1)
    print("wrote", sorted(f for f in os.listdir(OUT) if not f.endswith(".py")))


if __name__ == "__main__":
    main()
