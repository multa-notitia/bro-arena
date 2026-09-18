# Bro

A survivor arena in the Plot: an old walled vegetable garden at night, after rain. Everything in the garden has a face. The vegetables that went under came back wrong — screaming, cracked, glowing. You stay clean.

Vite + TypeScript, canvas 2D, zero runtime dependencies. Every sprite, effect, and sound is painted or synthesized procedurally. No image or audio assets.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721). The dev server binds `0.0.0.0:4721`.

```bash
npm run build
npm run preview
```

No API keys. Audio starts after the first click.

## This slice (art direction)

Playable test of the locked look, not the full roster.

- **Two player vegetables:** Spud and Carrot. Always clean. Other characters stay in the pack, hidden.
- **Three player models** on the gate card: **Wash** (A, lumpy watercolour), **Sketch** (B, oval ink, simple face), **Stain** (C, graphic cute).
- **Painting language** in Settings (title and pause): **A Wet soil**, **B Nightmare ink**, **C Ink stain**. This is how the whole plot is painted, independent of the player model.
- **Mud is enemies only.** Nightmare foes use Direction B construction: unique screaming faces, neon glow in the cracks, readable vegetable, mud splash at the feet.
- **Matching enemies:** Pea, Sprout, and a carrot-like charger. Fully animated — leaf teeter, walk, blink, mouths; nightmare scream.

## What is in the game

- **20 timed waves**, hordes, elites, a Great Mud Pea as the wave 10 / 20 stand-in boss for this slice.
- **16 weapons in 4 tiers** across melee, ranged, and elemental.
- **Full stat sheet**, gardener's table between waves, 40 items, chests, trees.
- **Procedural watercolour / ink / stain renderer** and synthesized audio.

## Controls

WASD / arrows to move. P or Escape holds still. 1–4 pick cards. M quiets the garden. Virtual stick on touch. On the gate, left/right or F cycles Wash / Sketch / Stain.

## Layout

```
src/
  core/     shared types and math
  data/     vegetables, weapons, items, enemies, waves
  game/     simulation and the run state machine
  render/   paint languages, species sprites, world drawing
  ui/       DOM screens, HUD, keyboard and joystick
  audio/    synthesized sfx and procedural music
  main.ts   wiring
```
