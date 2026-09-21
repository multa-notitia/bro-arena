# Bro

A survivor arena in the Plot: an old walled vegetable garden at night, after rain. Everything in the garden has a face. The vegetables that went under came back wrong — screaming, cracked, glowing. You stay clean.

Vite + TypeScript, canvas 2D, zero runtime dependencies. Most sprites, effects, and sound are painted or synthesized procedurally. Image-sprite exceptions sit beside the procedural faces: the magenta radish and the wet-soil chili cut from the Direction A board, plus the earlier Concept A chili pepper sheet.

Cloud preview of this build can lag. Run it on your own desktop.

## Run locally

Needs Node.js (22 is fine). No API keys. Vite binds **port 4721** (not 3000 / 5173 / 8080). Audio starts after the first click.

```bash
git clone -b cursor/farm-loop-88e8 https://github.com/multa-notitia/bro-arena.git
cd bro-arena
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

Same commands if you already have the folder:

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

`preview` also serves on 4721.

## This slice (art direction)

Playable test of the locked look, not the full roster. Former versions stay selectable. Nothing here replaces Wash, Sketch, Stain, or painting languages A/B/C.

- **Four player vegetables:** Radish, Spud, Carrot, and Chili. Always the player form. Other characters stay in the pack, hidden. The radish keeps the mud painted on its lower body because that is how the board looks — it is still form `normal`, not a mud enemy.
- **Three procedural models** on every gate card: **Wash** (A, lumpy watercolour), **Sketch** (B, oval ink, simple face), **Stain** (C, graphic cute).
- **Board** on Radish is the magenta painting cut from `mud-concept-a-wet-soil.png` (pointy top, V brows, mud on the lower body). Live legs plant and swing, arms hold the knife, eyes look at aim, mouth chatters, and a contact shadow sits under the feet. Sheet row 1 stays in the atlas. Not a procedural redraw.
- **Board** on Chili is the wet-soil pepper from `concept-a-chili-boardmatch-idle.png`. Same live rig: plant-then-swing feet, arms on the gait, white eyes, smile, brown sticks, contact shadow under the feet only. The knife is in the right hand and hacks — short windup, fast arc, follow-through. A killing slash turns the monster into watercolor chunks. The wand stays in the left hand. Painted is still selectable.
- **Painted** sits beside those on Chili. The earlier Concept A pepper sheet is still the sprite — leaf teeter, walk squash/stretch, blink lids composited over the painted eyes. Wand only.
- **Painting language** in Settings (title and pause): **A Wet soil**, **B Nightmare ink**, **C Ink stain**. This is how the whole plot is painted, independent of the player model.
- **Mud is enemies only.** Nightmare foes use Direction B construction: unique screaming faces, neon glow in the cracks, readable vegetable, mud splash at the feet.
- **Matching enemies:** Pea, Sprout, and a carrot-like charger. Fully animated — leaf teeter, walk, blink, mouths; nightmare scream.
- **The farm is the battleground.** Three garden rows (North, Middle, South) sit on the paddock — four beds each. Between waves you sow. Matching monsters crawl **out of those beds**, not from the arena walls. Peas, Sprouts, and Carrots start unlocked; Garlic, Pumpkin, and Chili show up in the shed as waves (and luck) go on. Seeds you plant are spent. They do not return at harvest. Restock from monster seed drops and the farming shed. Fertilizer fattens harvest for one wave. Pesticide slows the row. Too greedy and they overwhelm you; too timid and you under-scale later. North and south are farther. Middle comes up in your face.

Concept sources live in `public/concept-a/`. Cut frames live in `src/assets/concept-a/` (Painted chili) and `src/assets/concept-a/board/` (Board radish and Board chili), as PNG plus hex dumps the GitHub clone can load. Recut with `python3 scripts/cut_concept_a_chili.py`, `python3 scripts/cut_concept_a_radish.py`, or `python3 scripts/cut_chili_board.py` (needs Pillow and NumPy), then `python3 scripts/encode_png_hex.py`.

## What is in the game

- **20 timed waves**, hordes, elites, a Great Mud Pea as the wave 10 / 20 stand-in boss for this slice.
- **Plant UI between waves**, seed drops, and spawns from planted beds. Crops stay readable on the field while the wave runs.
- **Two shops, same scrap:** the shed (seeds, fertilizer, pesticide) then the gardener's table (weapons and items). First wave skips both.
- **16 weapons in 4 tiers** across melee, ranged, and elemental.
- **Full stat sheet**, 40 items, chests, trees.
- **Procedural watercolour / ink / stain renderer**, Board radish, Board chili, and Painted chili image sprites, and synthesized audio.

## Controls

WASD / arrows to move. P or Escape holds still. 1–4 pick cards. 1–6 pick an unlocked seed on the plant screen. M quiets the garden. Virtual stick on touch. On the gate, left/right or F cycles Wash / Sketch / Stain, plus Board on Radish, and Board and Painted on Chili. Chili opens on Board.

## Layout

```
src/
  core/     shared types and math
  data/     vegetables, weapons, items, enemies, waves, crops
  game/     simulation and the run state machine
  render/   paint languages, species sprites, Board / Painted blit, world drawing
  ui/       DOM screens, HUD, keyboard and joystick
  audio/    synthesized sfx and procedural music
  assets/   cut Concept A frames
  main.ts   wiring
public/concept-a/   original concept paintings
```
