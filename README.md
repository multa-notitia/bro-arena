# Bro

A survivor arena set in the Plot: an old walled vegetable garden at night, after rain. Everything in the garden has a face. The vegetables that went under the mud came back wrong — coated, glowing, screaming. You are one that stayed clean. Or one that chose the Mud.

Vite + TypeScript, canvas 2D, zero runtime dependencies. Every sprite, effect, and sound is painted or synthesized procedurally in watercolour — no image or audio assets.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721). The dev server binds `0.0.0.0:4721` (not 3000 / 5173 / 8080).

Production build:

```bash
npm run build
npm run preview
```

No API keys or services. Audio starts after the first click.

## What is in the game

- **Two forms for every vegetable.** Clean, and nightmare-mud: dripping mud coat, glowing eyes, wide screaming mouth, far more dangerous. Pick either form for your character at the gate. Enemies come up in the Mud more often as the waves go on — and more often still if you are muddy yourself.
- **8 playable vegetables** — Spud, Turnip, Carrot, Pumpkin, Radish, Chili, Eggplant, Onion — each with arms, legs, a face, its own stats, starting weapon, perks, and a Mud variant with a different trade.
- **13 enemy kinds, all vegetables** — peas, sprouts, radishes, turnips, garlic, pumpkins, chilis, cabbages, carrots; Great Mud elites; The Marrow Below on wave 10 and The Beet Heart on wave 20, with phases.
- **Screams.** Nightmare vegetables stop, stretch, and scream on a timer: a shockwave, a speed surge, extra peas from a cabbage, or a mud-drag from a boss.
- **20 timed waves**, hordes, elites from wave 6, bosses on 10 and 20.
- **16 weapons in 4 tiers** across melee, ranged, and elemental; thrust, sweep, shoot, orbit, aura, and chain lightning; duplicates combine to tier up; 6 slots, the first two held in hand.
- **Full stat sheet** — max HP, regen, life steal, damage by class, attack speed, crit, range, armor, dodge, speed, luck, harvesting, pickup range, XP gain, knockback, consumable heal.
- **Economy** — materials are XP and currency; the gardener's table between waves with tiered offers, turn-over, lock, sell; 40 passive items with specials; chests from elites; trees drop fruit.
- **Watercolour renderer** — wet-edge washes, granulation, paper grain, loose ink, splatter deaths, ink-bloom spawns, walk cycles, blinks, mouths, squash and stretch, weapon swing and recoil, projectile trails, ink-wipe transitions, additive eye glow.
- **Audio** — synthesized SFX for every event including screams and mud, procedural music for the gate, waves, the Mud, bosses, and the table.
- **Controls** — WASD / arrows; P or Escape holds still; 1–4 pick cards; M quiets the garden; virtual stick on touch devices.

## Layout

```
src/
  core/     shared types and math (the contract between modules)
  data/     vegetables, forms, weapons, items, enemies, waves, level-ups, economy
  game/     simulation, screams, forms, and the run state machine
  render/   watercolour painter, species sprites, world drawing, particle fx
  ui/       DOM screens, HUD, keyboard and joystick input
  audio/    synthesized sfx and procedural music
  main.ts   wiring
```
