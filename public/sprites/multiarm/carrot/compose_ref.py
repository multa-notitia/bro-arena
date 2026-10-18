#!/usr/bin/env python3
"""Reference multi-arm compositor for the SIDE-VIEW carrot. Copied from figures/player-chili/multiarm/compose_ref.py (the
team's side-view compose_ref) with the sheet id changed and two more data-driven SIDE: switches for the carrot
(arms.emptyHand null -> no palm on weapon-less arms; weapons alt.imgsBack on back-layer slots).
Chili header: figures/player-potato/multiarm/compose_ref.py + the side-view
additions of art/HERO_SIDE_VIEW_BRIEF.md, marked "SIDE:" below: slot `layer` (front/back) instead of left/right sides,
native slots replay the hero arm named by slot `hero`, painted raised arm for `raised` keys, no shoulder bud, and
whole-figure mirroring with frame(..., facing=-1)). Without those keys it behaves exactly like the spud's. Reads ONLY the exported files in this folder
(player-chili-armless.*, body_track.json, parts.*, sockets.json, weapons.json, families.json) and composes one
frame in hero-cell px. It is the executable spec for README.md (used to render previews/multiarm_showcase.mp4);
the game port should reproduce `arm_layers()` + `frame()` exactly.
"""
import itertools
import json
import math
import os
import random

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FLIPX = np.diag([-1.0, 1.0, 1.0])


def T(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], np.float64)


def R(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float64)


def S(k):
    return np.array([[k, 0, 0], [0, k, 0], [0, 0, 1]], np.float64)


def ap(M, p):
    v = M @ np.array([p[0], p[1], 1.0])
    return (v[0], v[1])


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def premul(a):
    o = a.copy()
    o[..., :3] *= o[..., 3:4]
    return o


class MultiArm:
    def __init__(self, d=HERE):
        L = lambda n: json.load(open(os.path.join(d, n)))  # noqa: E731
        self.track, self.sock, self.wpn, self.fam = L("body_track.json"), L("sockets.json"), L("weapons.json"), L("families.json")
        pj = L("parts.json")
        atlas = np.asarray(Image.open(os.path.join(d, pj["image"])).convert("RGBA")).astype(np.float32) / 255
        self.parts = {}
        for n, p in pj["parts"].items():
            x, y, w, h = p["rect"]
            self.parts[n] = dict(p, pm=premul(atlas[y:y + h, x:x + w]).astype(np.float32))
        sm = L("player-carrot-armless.json")
        self.sheet = sm
        sa = np.asarray(Image.open(os.path.join(d, sm["meta"]["pngFallback"])).convert("RGBA")).astype(np.float32) / 255
        self.sheet_atlas = sa
        self.cell = sm["frameWidth"]

    # ------------------------------------------------------------------ data helpers
    def layout(self, n_weapons):
        n = str(max(1, min(6, n_weapons)))
        lay = self.sock["layouts"][n]
        out = []
        for i, nm in enumerate(lay["slots"]):
            s = dict(self.sock["slots"][nm])
            s.update(lay["override"].get(nm, {}))
            s.update(name=nm, index=i)
            out.append(s)
        return out

    def assign(self, loadout, slots, prev=None):
        """weapons -> slots: minimise wooden weapons sharing a side / adjacent, and slot hops (families.json)."""
        n = len(slots)
        ws = list(loadout[:n]) + [None] * (n - len(loadout[:n]))
        order = {"up": 0, "mid": 1, "low": 2}
        best, best_c = None, 1e9
        for perm in sorted(set(itertools.permutations(range(n)))):
            a = [ws[p] for p in perm]
            c = 0.0
            for side in ((1, -1) if self.sock.get("view") != "side" else ("front", "back")):    # SIDE: per layer
                key_of = (lambda s_: s_["side"]) if self.sock.get("view") != "side" else (lambda s_: s_["layer"])
                wood = sorted(order[slots[i]["name"][:-1]] for i in range(n)
                              if key_of(slots[i]) == side and a[i] and self.wpn["weapons"][a[i]]["wood"])
                if len(wood) >= 2:
                    c += 10 * (len(wood) - 1) + 3 * sum(1 for x, y in zip(wood, wood[1:]) if y - x == 1)
            ref = prev or ws
            c += sum(1 for i in range(n) if ref[i] is not None and a[i] != ref[i])
            if c < best_c:
                best, best_c = a, c
        return best

    def family_key(self, fam, t):
        if t is None or t < 0:
            return None
        for k in self.fam["families"][fam]:
            if t < k["ms"]:
                return k
            t -= k["ms"]
        return None

    @staticmethod
    def jitter(slot_index, cycle, seed=7):
        return random.Random(seed * 1000 + slot_index * 37 + cycle).uniform(80, 200)

    def _wimg(self, w, front):
        """pass 9: back-layer slots draw the dark far-side twin (weapons.json imgBack) when present; points stay w.img's."""
        ib = w.get("imgBack")
        return ib if (not front and ib in self.parts) else w["img"]

    # ------------------------------------------------------------------ one arm
    def arm_layers(self, slot, clip, fi, weapon, t_attack=None, grow=1.0, target=None):
        """returns [(part name, matrix part px -> body px, z)], all body px (apply body_track after)."""
        P = slot["pos"]
        sd = slot["side"]
        native = slot["native"]
        tr = self.track["clips"][clip][fi]
        sec = self.track["secondary"][clip][fi][slot["index"]] if clip in self.track["secondary"] else {}
        w = self.wpn["weapons"].get(weapon) if weapon else None
        pose = dict(sec)
        if native and tr.get("native"):            # hero's own native arm motion for this frame (club poses)
            hp = dict(tr["native"][slot.get("hero", "R" if sd > 0 else "L")])          # SIDE: slot names its hero arm
            pose = {k: v for k, v in hp.items() if k in ("raise", "elbow", "wrist", "thrust", "raised", "rrot")}
            if w and "aim" in hp:
                pose["wrist"] = hp["aim"] + 62.0          # hero club rest aim -62: keep the swing, other weapons' rest
        key = self.family_key(w["family"], t_attack) if w else None
        ref = w["restAim"] if w else 0.0
        if key:
            base_raise = pose.get("raise", 0.0)
            pose = {k: v for k, v in key.items() if k not in ("ms", "ev")}
            pose["raise"] = pose.get("raise", 0.0) + 0.3 * base_raise
            ref = key.get("aim", ref)
        aim_c = (pose.get("aim", (w["restAim"] + pose.get("wrist", 0.0)) if w else 0.0))
        dc = 0.0
        if target is not None and w:
            sw = ap(self.B, P)
            t_ang = math.degrees(math.atan2(target[1] - sw[1], target[0] - sw[0]))
            refc = ref + w["shotOffset"]
            ref_w = refc if sd > 0 else 180 - refc
            delta = max(-self.fam["aimClamp"], min(self.fam["aimClamp"], wrap(t_ang - ref_w)))
            dc = delta if sd > 0 else -delta
        aim_c += dc
        k = (1.0 if native else self.sock["arms"]["sprouted"]["scale"]) * grow
        front = slot["z"] > self.sock["behindBodyZ"]
        z = slot["z"]
        out = []
        raised_art = (self.sock["arms"].get("raised") or {}).get("front") if front else None
        if pose.get("raised") and raised_art:       # SIDE: painted raised arm (windup), weapon behind the body
            ra = self.parts[raised_art]
            sh, gp = ra["points"]["shoulder"], ra["points"]["grip"]
            Lm = T(*P) @ R(pose.get("rrot", 0.0) + self.fam["armTurnShare"] * dc) @ S(k) @ T(-sh[0], -sh[1])
            out.append((raised_art, Lm, z))
            if w:
                g = ap(Lm, gp)
                wp = self.parts[w["img"]]
                gw = wp["points"]["grip"]
                Wm = T(*g) @ R(aim_c - wp["axis"]) @ S(k) @ T(-gw[0], -gw[1])
                out.append((self._wimg(w, front), Wm, self.sock["arms"]["raised"].get("weaponZ", 9.5)))
            return out
        raise_ = pose.get("raise", 0.0)
        th = pose.get("thrust", 0.0)
        straight = (not native) or pose.get("straight", False)
        if not straight:
            art = self.sock["arms"]["native"][slot["name"]]
            up, fo = self.parts[art + "_upper"], self.parts[art + "_fore"]
            sh, el, wr = up["points"]["shoulder"], up["points"]["elbow"], up["points"]["wrist"]
            d_up = slot["dir"] - raise_ + self.fam["armTurnShare"] * dc
            U = T(*P) @ R(d_up - up["dir0"]) @ S(k) @ T(-sh[0], -sh[1])
            eb = pose.get("elbow", 0.0)
            F = U @ T(*el) @ R(-eb) @ T(-el[0], -el[1])
            d_fore = d_up + (up["fore0"] - up["dir0"]) - eb
            if th:
                F = T(th * k * math.cos(math.radians(d_fore)), th * k * math.sin(math.radians(d_fore))) @ F
            wrist = ap(F, wr)
            out += [(art + "_fore", F, z), (art + "_upper", U, z + 0.02)]
        else:
            nm = self.sock["arms"]["sprouted"]["front" if front else "back"]
            la = self.parts[nm]
            sh, wr = la["points"]["shoulder"], la["points"]["wrist"]
            d_fore = aim_c if pose.get("straight") else slot["dir"] - raise_ + self.fam["armTurnShare"] * dc
            Lm = T(*P) @ R(d_fore - la["dir0"]) @ S(k) @ T(-sh[0], -sh[1])
            if th:
                Lm = T(th * k * math.cos(math.radians(d_fore)), th * k * math.sin(math.radians(d_fore))) @ Lm
            wrist = ap(Lm, wr)
            out.append((nm, Lm, z))
        hd = self.fam["handD"] * k
        g_cam = (wrist[0] + hd * math.cos(math.radians(d_fore)), wrist[1] + hd * math.sin(math.radians(d_fore)))
        use_alt = bool(w and pose.get("alt") and "alt" in w)
        if w:
            hname = w["hand"]["front" if front else "back"]
            hp = self.parts[hname]
            if hname == "fist34":
                H = T(*wrist) @ R(aim_c) @ S(k) @ T(-hp["points"]["wrist"][0], -hp["points"]["wrist"][1])
                g = ap(H, hp["points"]["grip"])
            else:                       # camera-facing fist: hole on the grip point, upright to the painted forearm
                g = g_cam
                H = T(*g) @ R(d_fore - 22.0) @ S(k) @ T(-hp["points"]["grip"][0], -hp["points"]["grip"][1])
            if use_alt:
                alts = w["alt"]["imgs"] if front else w["alt"].get("imgsBack", w["alt"]["imgs"])   # SIDE: dark alt
                an = alts[slot["index"] % len(alts)]
                apart = self.parts[an]
                ga = apart["points"]["grip"]
                Wm = T(*g) @ R(aim_c - apart["axis"]) @ S(k) @ T(-ga[0], -ga[1])
                out.append((an, Wm, z + 0.06))
            else:
                wp = self.parts[w["img"]]
                gw = wp["points"]["grip"]
                Wm = T(*g) @ R(aim_c - wp["axis"]) @ S(k) @ T(-gw[0], -gw[1])
                out += [(self._wimg(w, front), Wm, z + 0.03), (hname, H, z + 0.06)]
            if key and "release" in (key.get("show") or []):
                out += self.fx_layers(w, Wm, P, aim_c, k, z, front)
        elif self.sock["arms"].get("emptyHand", "palm") is not None:     # SIDE: null = the arm's own painted fist
            hname = "palm" if front else "palm_dark"
            hp = self.parts[hname]
            H = T(*g_cam) @ R(d_fore - 22.0 + pose.get("wrist", 0.0)) @ S(k) @ T(-hp["points"]["grip"][0], -hp["points"]["grip"][1])
            out.append((hname, H, z + 0.06))
        if front and self.sock.get("bud", {"part": "bud"}) is not None:     # SIDE: no bud (painted round shoulders)
            b = self.parts["bud"]
            c = b["points"]["center"]
            out.append(("bud", T(*P) @ S(k) @ T(-c[0], -c[1]), z + 0.04))
        if sd < 0:
            Wf = T(P[0], 0) @ FLIPX @ T(-P[0], 0)
            out = [(n, Wf @ M if n != "bud" else M, zz) for n, M, zz in out]
        return out

    def fx_layers(self, w, Wm, P, aim_c, k, z, front):
        fx = w["fx"]["release"]
        part = self.parts[fx["img"]]
        prm = fx.get("params", {})
        zz = (9.5 if front else z - 0.05) if fx["z"] == "behindBody" else (z + 0.5 if fx["z"] == "aboveArm" else fx["z"])  # SIDE: aboveArm
        if fx["rule"] == "swingArc":
            head = ap(Wm, self.parts[w["img"]]["points"]["head"])
            a = math.degrees(math.atan2(head[1] - P[1], head[0] - P[0]))
            reach = math.hypot(head[0] - P[0], head[1] - P[1])
            mid = a - prm["back"]
            c = (P[0] + prm["radius"] * reach * math.cos(math.radians(mid)), P[1] + prm["radius"] * reach * math.sin(math.radians(mid)))
            b = part["points"]["bulge"]
            return [(fx["img"], T(*c) @ R(mid) @ S(k) @ T(-b[0], -b[1]), zz)]
        wp = self.parts[w["img"]]
        at = ap(Wm, wp["points"][fx["at"]])
        d = aim_c + (w["shotOffset"] if fx["rule"] == "alongShot" else 0.0)
        cx = at[0] + prm.get("ahead", 0) * k * math.cos(math.radians(d)) - prm.get("side", 0) * k * math.sin(math.radians(d))
        cy = at[1] + prm.get("ahead", 0) * k * math.sin(math.radians(d)) + prm.get("side", 0) * k * math.cos(math.radians(d))
        an = part["points"][fx["anchor"]]
        return [(fx["img"], T(cx, cy) @ R(d) @ S(k) @ T(-an[0], -an[1]), zz)]

    # ------------------------------------------------------------------ one frame
    def anchor_x(self):
        return self.sheet["anchor"]["x"] * self.cell

    def facing_for(self, target, walking=0):
        """SIDE: +1 facing right / -1 left. Target behind (x < anchor x) flips; else the walking direction; else +1."""
        if target is not None:
            return 1 if target[0] >= self.anchor_x() else -1
        return -1 if walking < 0 else 1

    def frame(self, clip, fi, arms, target=None, extra=(), margin=110, facing=1):
        """arms: list of dict(slot, weapon, t_attack, grow). target: hero-cell px. returns RGBA float canvas
        (cell + 2*margin square) in hero-cell px offset by margin, plus the frame's tint.
        SIDE: facing=-1 composes facing right with the target mirrored about the anchor x, then mirrors the whole
        canvas about the anchor x (the game draws the sheet flipped the same way)."""
        if facing < 0 and target is not None:
            target = (2 * self.anchor_x() - target[0], target[1])
        tr = self.track["clips"][clip][fi]
        sm = self.sheet["clips"][clip]["frames"][fi]
        cols = self.sheet["columns"]
        r_, c_ = divmod(sm["i"], cols)
        cell = self.sheet_atlas[r_ * self.cell:(r_ + 1) * self.cell, c_ * self.cell:(c_ + 1) * self.cell]
        N = self.cell + 2 * margin
        acc = np.zeros((N, N, 4), np.float32)
        layers = [("__body__", None, 10.0)]
        if tr.get("arms"):
            self.B = np.vstack([np.array(tr["m"]), [0, 0, 1]])
            tg = target
            for a in arms:
                if a.get("grow", 1.0) > 0.01:
                    layers += self.arm_layers(a["slot"], clip, fi, a.get("weapon"), a.get("t_attack"), a.get("grow", 1.0), tg)
            layers += list(extra)
        base = T(margin, margin)
        for n, M, z in sorted(layers, key=lambda l: l[2]):
            if n == "__body__":
                src = premul(cell)
                m = base[:2].astype(np.float32)
            else:
                src = self.parts[n]["pm"]
                m = (base @ self.B @ M)[:2].astype(np.float32)
            wp = cv2.warpAffine(src, m, (N, N), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            wp = np.clip(wp, 0, 1)
            wp[..., :3] = np.minimum(wp[..., :3], wp[..., 3:4])
            acc = wp + acc * (1 - wp[..., 3:4])
        if facing < 0:                              # SIDE: mirror the premultiplied canvas about the anchor x
            x0 = margin + self.anchor_x()
            acc = cv2.warpAffine(acc, np.float32([[-1, 0, 2 * x0], [0, 1, 0]]), (N, N), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        a = np.maximum(acc[..., 3:4], 1e-6)
        out = np.dstack([np.where(acc[..., 3:4] > 1e-4, acc[..., :3] / a, 0), acc[..., 3:4]])
        return np.clip(out, 0, 1), tr.get("tint")
