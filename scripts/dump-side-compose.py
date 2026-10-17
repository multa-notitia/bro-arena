#!/usr/bin/env python3
"""Dump compose_ref arm_layers for the keyed frames the TS port must match."""
import importlib.util
import json
import os

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "sprites", "multiarm")


def load(hero):
    path = os.path.join(ROOT, hero, "compose_ref.py")
    spec = importlib.util.spec_from_file_location(hero + "_ref", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.MultiArm(os.path.join(ROOT, hero))


def layers(ma, slot, clip, fi, weapon, t, target):
    tr = ma.track["clips"][clip][fi]
    ma.B = np.vstack([np.array(tr["m"], np.float64), [0, 0, 1]])
    out = []
    for name, M, z in ma.arm_layers(slot, clip, fi, weapon, t, 1.0, target):
        out.append({"name": name, "z": float(z), "m": np.asarray(M, np.float64).round(8).tolist()})
    return out


def case(hero, label, ma, n, slot_i, clip, fi, weapon, t, target=None):
    slots = ma.layout(n)
    return {
        "hero": hero,
        "label": label,
        "clip": clip,
        "fi": fi,
        "slot": slot_i,
        "weapon": weapon,
        "t": t,
        "target": target,
        "layers": layers(ma, slots[slot_i], clip, fi, weapon, t, target),
    }


def main():
    potato = load("potato")
    chili = load("chili")
    carrot = load("carrot")
    radish = load("radish")
    rows = [
        case("potato", "club windup behind the head", potato, 1, 0, "idle", 0, "club", 0),
        case("potato", "club release smear", potato, 1, 0, "idle", 0, "club", 70),
        case("potato", "far arm empty palm", potato, 1, 1, "idle", 0, None, None),
        case("chili", "slash windup raised arm", chili, 1, 0, "idle", 0, "knife", 0),
        case("chili", "slash release arc", chili, 1, 0, "idle", 0, "knife", 70),
        case("carrot", "drawn slingshot", carrot, 1, 0, "idle", 0, "slingshot", 10),
        case("carrot", "dark drawn slingshot", carrot, 1, 1, "idle", 0, "slingshot", 10),
        case("carrot", "empty arm has no palm", carrot, 1, 1, "walk", 0, None, None),
        case("radish", "pistol on the near arm", radish, 3, 0, "idle", 0, "pistol", None),
        case("radish", "far native arm stays empty", radish, 3, 3, "idle", 0, None, None),
    ]
    # A target in front of the potato, so aim leaves the rest pose.
    tr = potato.track["clips"]["idle"][0]
    ax = potato.sheet["anchor"]["x"] * potato.cell
    rows.append(case("potato", "aim at a target ahead", potato, 1, 0, "idle", 0, "club", None, [ax + 80, 40]))
    print(json.dumps(rows))


if __name__ == "__main__":
    main()
