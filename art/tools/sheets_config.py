"""Layout + animation config for every Bro sheet.

Units
-----
* Cell sizes / positions are atlas pixels (1x).
* Clip frame `ox`/`oy` are **world pixels** (the game applies them before scaling, see
  src/render/sheets.ts drawActorSheet). +ox = forward (mirrored with facing), +oy = down.
* `sx`/`sy` are scaleX/scaleY around the anchor. The builder adds an automatic `oy`
  correction so squash/stretch keeps the feet planted (anchor sits at body centre, so a
  plain scaleY would lift the feet). Set `plant: False` on a frame to skip it.

Frame registration modes (`reg`)
--------------------------------
* "feet"   x = torso (distance-transform peak of the main body), y = ground contact line
* "right"  x = right edge of the main body (head of the worm), y = contact
* "center" x,y = torso centre aligned to the sheet's mean body-centre (radial bursts)
* "grid"   keep the painter's placement relative to the grid cell (VFX rows)
"""

HERO_CELLS = ["walk0", "walk1", "walk2", "walk3", "idle", "hurt", "attack", "death"]


def breathe(frame, steps=6, amp=0.03, ms=(170, 130, 130, 170, 130, 130), extra=None):
    """Single painted frame -> breathing loop. Sine-sampled, extremes held a bit longer."""
    import math
    out = []
    for k in range(steps):
        b = (1 - math.cos(2 * math.pi * k / steps)) / 2
        f = {"f": frame, "ms": ms[k % len(ms)], "sx": round(1 + amp * b, 4), "sy": round(1 - amp * b, 4)}
        if extra:
            f.update(extra(k, b))
        out.append(f)
    return out


def hero_clips(release_events=("release", "spawnFx")):
    return {
        "idle": {"loop": True, "frames": breathe("idle", amp=0.03)},
        "walk": {"loop": True, "torso_lock": 0.8, "frames": [
            {"f": "walk0", "ms": 100, "sx": 1.04, "sy": 0.95},
            {"f": "walk1", "ms": 100, "sx": 0.98, "sy": 1.03, "oy": -1.5},
            {"f": "walk2", "ms": 100, "sx": 1.04, "sy": 0.95},
            {"f": "walk3", "ms": 100, "sx": 0.98, "sy": 1.03, "oy": -1.5},
        ]},
        "hurt": {"loop": False, "frames": [
            {"f": "hurt_flash", "ms": 40, "sx": 1.14, "sy": 0.86, "ox": -2.5, "ev": ["hurt"]},
            {"f": "hurt", "ms": 60, "sx": 0.94, "sy": 1.07, "ox": -2.0},
            {"f": "hurt", "ms": 80, "sx": 1.02, "sy": 0.98, "ox": -1.0},
        ]},
        "attack": {"loop": False, "frames": [
            {"f": "idle", "ms": 60, "sx": 1.07, "sy": 0.93, "ox": -1.5},
            {"f": "attack", "ms": 45, "sx": 0.92, "sy": 1.09, "ox": 2.0, "ev": list(release_events)},
            {"f": "attack", "ms": 70, "sx": 1.03, "sy": 0.98, "ox": 1.0},
            {"f": "attack", "ms": 80, "ox": 0.5},
        ]},
        # player death in game = 0.55 s
        "death": {"loop": False, "frames": [
            {"f": "hurt_flash", "ms": 60, "sx": 1.16, "sy": 0.82},
            {"f": "hurt", "ms": 60, "sx": 0.9, "sy": 1.12, "oy": -1},
            {"f": "death_flash", "ms": 50, "sx": 0.85, "sy": 0.85, "ev": ["spawnFx"], "plant": False},
            {"f": "death", "ms": 110, "sx": 1.08, "sy": 1.08, "plant": False},
            {"f": "death", "ms": 140, "plant": False},
            {"f": "death", "ms": 70, "sx": 0.85, "sy": 0.85, "plant": False},
            {"f": "death", "ms": 60, "sx": 0.6, "sy": 0.6, "plant": False},
        ]},
    }


def enemy_death(pre="hurt_flash"):
    # enemy DEATH_TIME in game = 0.45 s; the sheet has no alpha channel per frame, so the
    # burst shrinks out instead of popping off.
    return {"loop": False, "frames": [
        {"f": pre, "ms": 50, "sx": 1.22, "sy": 0.78},
        {"f": "death_flash", "ms": 40, "sx": 0.85, "sy": 0.85, "ev": ["spawnFx"]},
        {"f": "death", "ms": 90, "sx": 1.1, "sy": 1.1},
        {"f": "death", "ms": 120},
        {"f": "death", "ms": 80, "sx": 0.82, "sy": 0.82},
        {"f": "death", "ms": 60, "sx": 0.55, "sy": 0.55},
    ]}


def std_hurt(k=1.0):
    return {"loop": False, "frames": [
        {"f": "hurt_flash", "ms": 40, "sx": 1 + 0.14 * k, "sy": 1 - 0.14 * k, "ox": -2.5, "ev": ["hurt"]},
        {"f": "hurt", "ms": 60, "sx": 1 - 0.06 * k, "sy": 1 + 0.07 * k, "ox": -2.0},
        {"f": "hurt", "ms": 80, "sx": 1.02, "sy": 0.98, "ox": -1.0},
    ]}


FLASH_EXTRAS = {
    "hurt_flash": ("tint", "hurt", (1.0, 0.97, 0.9), 0.78),
    "death_flash": ("tint", "death", (1.0, 0.98, 0.92), 0.55),
}

HERO_COMMON = dict(kind="actor", cols=4, rows=2, cells=HERO_CELLS, r=17, cell=192, scale=0.62,
                   torso_x=0.41, feet_y=0.94, body=["walk0", "walk1", "walk2", "walk3", "idle"],
                   extras=FLASH_EXTRAS, preview_bg_alpha=0.62)

SHEETS = [
    dict(HERO_COMMON, id="player-radish", src="image8.jpg", title="Radish hero",
         reg={"death": "center"}, clips=hero_clips()),
    dict(HERO_COMMON, id="player-potato", src="image9.jpg", title="Spud hero",
         reg={"death": "feet"}, clips=hero_clips()),
    dict(HERO_COMMON, id="player-carrot", src="image0.jpg", title="Carrot hero",
         reg={"death": "center"}, clips=hero_clips()),
    dict(HERO_COMMON, id="player-chili", src="image11.jpg", title="Chili hero (slash attack)",
         reg={"death": "center"}, clips=hero_clips()),

    dict(id="enemy-blob", key={"pastel_fix": True}, src="image12.jpg", title="Mud blob (Pea / Mud Pea)", kind="actor", cols=4, rows=2,
         cells=["hop0", "hop1", "hop2", "hop3", "idle", "hurt", "move", "death"],
         r=14, cell=160, scale=0.62, torso_x=0.5, feet_y=0.86, body=["hop0", "hop1", "hop3", "idle"],
         extras=FLASH_EXTRAS, reg={"death": "feet"}, preview_bg_alpha=0.55,
         clips={
             "idle": {"loop": True, "frames": breathe("idle", amp=0.05, ms=(160, 120, 120, 160, 120, 120))},
             # hop: anticipation squash -> launch stretch -> airborne -> land -> impact squash -> settle
             "walk": {"loop": True, "frames": [
                 {"f": "hop0", "ms": 90, "sx": 1.12, "sy": 0.86},
                 {"f": "hop1", "ms": 60, "sx": 0.88, "sy": 1.14, "oy": -2},
                 {"f": "hop2", "ms": 90, "sx": 0.92, "sy": 1.1, "oy": -8},
                 {"f": "move", "ms": 90, "sx": 0.97, "sy": 1.04, "oy": -9},
                 {"f": "hop3", "ms": 60, "sx": 0.94, "sy": 1.07, "oy": -3},
                 {"f": "hop0", "ms": 60, "sx": 1.2, "sy": 0.78},
                 {"f": "idle", "ms": 70, "sx": 1.06, "sy": 0.95},
             ]},
             "hurt": std_hurt(1.4),
             "attack": {"loop": False, "frames": [
                 {"f": "hop0", "ms": 90, "sx": 1.14, "sy": 0.84},
                 {"f": "move", "ms": 60, "sx": 0.88, "sy": 1.14, "ox": 3, "oy": -4, "ev": ["hit"]},
                 {"f": "move", "ms": 110, "ox": 2, "oy": -2},
             ]},
             "death": enemy_death(),
         }),

    dict(id="enemy-charger", key={"pastel_fix": True}, src="image13.jpg", title="Mud carrot (charger)", kind="actor", cols=4, rows=2,
         cells=["run0", "run1", "run2", "run3", "idle", "hurt", "charge", "death"],
         r=18, cell=208, scale=0.64, torso_x=0.5, feet_y=0.94, body=["run0", "run1", "run2", "run3", "idle"],
         extras=FLASH_EXTRAS, reg={"death": "feet"}, preview_bg_alpha=0.55,
         clips={
             "idle": {"loop": True, "frames": breathe("idle", amp=0.03)},
             "walk": {"loop": True, "torso_lock": 0.8, "frames": [
                 {"f": "run0", "ms": 85, "sx": 1.04, "sy": 0.95},
                 {"f": "run1", "ms": 85, "sx": 0.98, "sy": 1.04, "oy": -1.5},
                 {"f": "run2", "ms": 85, "sx": 1.04, "sy": 0.95},
                 {"f": "run3", "ms": 85, "sx": 0.98, "sy": 1.04, "oy": -1.5},
             ]},
             "hurt": std_hurt(),
             # plays for state windup (0.72 s) + charging; holds the charge pose while dashing
             "attack": {"loop": False, "frames": [
                 {"f": "idle", "ms": 150, "sx": 1.03, "sy": 0.97, "ox": -0.5},
                 {"f": "idle", "ms": 150, "sx": 1.06, "sy": 0.94, "ox": -1.0},
                 {"f": "idle", "ms": 150, "sx": 1.09, "sy": 0.91, "ox": -2.0},
                 {"f": "idle", "ms": 150, "sx": 1.12, "sy": 0.88, "ox": -2.5},
                 {"f": "idle", "ms": 70, "sx": 1.15, "sy": 0.85, "ox": -3.0},
                 {"f": "charge", "ms": 60, "sx": 0.88, "sy": 1.12, "ox": 4.0, "ev": ["release", "spawnFx"]},
                 {"f": "charge", "ms": 120, "sx": 1.05, "sy": 0.96, "ox": 2.0},
                 {"f": "charge", "ms": 200, "ox": 1.0},
             ]},
             "death": enemy_death(),
         }),

    dict(id="enemy-spitter", key={"pastel_fix": True}, src="image5.jpg", title="Mud worm (spitter)", kind="actor", cols=4, rows=2,
         cells=["crawl0", "crawl1", "crawl2", "crawl3", "idle", "hurt", "spit", "death"],
         r=16, cell=256, scale=0.66, torso_x=0.5, feet_y=0.90, body=["crawl0", "crawl1", "crawl2", "crawl3", "idle"],
         extras=FLASH_EXTRAS, reg={"crawl0": "right", "crawl1": "right", "crawl2": "right", "crawl3": "right",
                                   "idle": "right", "hurt": "feet", "spit": "feet", "death": "feet"},
         right_x=0.82, anchor_x="bbox", nudge={"spit": (-10, 0)}, preview_bg_alpha=0.55,
         clips={
             "idle": {"loop": True, "frames": breathe("idle", amp=0.035)},
             # inchworm: flat -> arch up -> high arch -> settle; head stays registered
             "walk": {"loop": True, "frames": [
                 {"f": "crawl0", "ms": 120, "sx": 1.04, "sy": 0.95},
                 {"f": "crawl1", "ms": 105, "sx": 0.99, "sy": 1.02},
                 {"f": "crawl2", "ms": 120, "sx": 0.98, "sy": 1.04, "oy": -0.5},
                 {"f": "crawl3", "ms": 105, "sx": 1.01, "sy": 0.99},
             ]},
             "hurt": std_hurt(),
             "attack": {"loop": False, "frames": [
                 {"f": "idle", "ms": 90, "sx": 1.07, "sy": 0.91},
                 {"f": "spit", "ms": 50, "sx": 0.93, "sy": 1.09, "ox": 1.5, "ev": ["release", "spawnFx"]},
                 {"f": "spit", "ms": 120, "sx": 1.02, "sy": 0.98},
                 {"f": "spit", "ms": 100},
             ]},
             "death": enemy_death(),
         }),

    dict(id="enemy-eliteBlob", key={"pastel_fix": True}, src="image14.jpg", title="Great Mud Pea (elite / boss)", kind="actor", cols=4, rows=2,
         cells=["idle0", "idle1", "move0", "move1", "windup", "impact", "hurt", "death"],
         r=24, cell=256, scale=0.77, torso_x=0.5, feet_y=0.93, body=["idle0", "idle1", "move0", "move1"],
         extras=FLASH_EXTRAS, reg={"death": "feet", "impact": "feet"}, preview_bg_alpha=0.55,
         clips={
             "idle": {"loop": True, "frames": [
                 {"f": "idle0", "ms": 150},
                 {"f": "idle0", "ms": 140, "sx": 1.015, "sy": 0.985},
                 {"f": "idle1", "ms": 180, "sx": 1.03, "sy": 0.97},
                 {"f": "idle1", "ms": 150, "sx": 1.03, "sy": 0.97},
                 {"f": "idle1", "ms": 140, "sx": 1.015, "sy": 0.985},
                 {"f": "idle0", "ms": 150, "sx": 1.0, "sy": 1.0},
             ]},
             "walk": {"loop": True, "frames": [
                 {"f": "move0", "ms": 140, "sx": 1.06, "sy": 0.94},
                 {"f": "move1", "ms": 140, "sx": 0.97, "sy": 1.04, "oy": -2},
                 {"f": "move0", "ms": 140, "sx": 1.06, "sy": 0.94},
                 {"f": "move1", "ms": 140, "sx": 0.97, "sy": 1.04, "oy": -2},
             ]},
             "hurt": std_hurt(0.8),
             # telegraph: growing stretch + rise, hang, then SLAM
             "attack": {"loop": False, "frames": [
                 {"f": "windup", "ms": 160, "sx": 0.98, "sy": 1.04, "oy": -1},
                 {"f": "windup", "ms": 160, "sx": 0.95, "sy": 1.08, "oy": -2},
                 {"f": "windup", "ms": 160, "sx": 0.92, "sy": 1.13, "oy": -4},
                 {"f": "windup", "ms": 100, "sx": 0.89, "sy": 1.18, "oy": -6},
                 {"f": "impact", "ms": 45, "sx": 1.16, "sy": 0.84, "ev": ["hit", "spawnFx"]},
                 {"f": "impact", "ms": 80, "sx": 1.08, "sy": 0.93},
                 {"f": "impact", "ms": 110, "sx": 1.02, "sy": 0.98},
                 {"f": "idle0", "ms": 80, "sx": 0.95, "sy": 1.06, "oy": -1},
                 {"f": "idle0", "ms": 80},
             ]},
             "death": enemy_death(),
         }),

    dict(id="fx-ink", key={"pastel_fix": True}, src="image16.jpg", title="VFX", kind="fx", cols=6, rows=4, cell=128, scale=None,
         cells=[f"{n}{i}" for n in ["muzzle", "hitSpark", "inkBurst", "dust"] for i in range(6)],
         row_names=["muzzle", "hitSpark", "inkBurst", "dust"],
         clips={
             "muzzle": {"loop": False, "anchor": "row", "frames": [{"f": f"muzzle{i}", "ms": m} for i, m in enumerate([30, 35, 35, 40, 40, 45])]},
             "hitSpark": {"loop": False, "anchor": "row", "frames": [{"f": f"hitSpark{i}", "ms": m} for i, m in enumerate([35, 40, 40, 45, 50, 60])]},
             "inkBurst": {"loop": False, "anchor": "row", "frames": [{"f": f"inkBurst{i}", "ms": m} for i, m in enumerate([40, 45, 45, 50, 60, 120])]},
             "dust": {"loop": False, "anchor": "row", "frames": [{"f": f"dust{i}", "ms": m} for i, m in enumerate([45, 50, 55, 60, 70, 90])]},
         }),

    dict(id="pickups", src="image17.jpg", title="Pickups", kind="icons", cols=4, rows=2, cell=128, scale=0.46,
         cells=["xpSmall", "xpLarge", "coin", "heart", "crate", "magnet", "bomb", "chest"]),

    dict(id="prop-furrow", src="image2.jpg", title="Garden furrow strip", kind="prop", cols=1, rows=1, scale=0.5),
    dict(id="prop-bed", src="image.jpg", title="Garden bed block", kind="prop", cols=1, rows=1, scale=0.5),
]
