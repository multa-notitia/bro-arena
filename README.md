# Bro

A Brotato-style survivor arena in the browser, painted in watercolour. You are the last potato in the paddock. Weapons fire themselves. Materials walk home. The blight does not get bored.

Vite + TypeScript, canvas 2D, zero runtime dependencies. Every sprite, effect, and sound is generated procedurally — no image or audio assets.

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

- **Characters** — 8 potatoes with their own stats, starting weapons, perks, and palettes.
- **Waves** — 20 timed waves, hordes, elites from wave 6, bosses on waves 10 and 20.
- **Enemies** — 13 kinds: chasers, wanderers, chargers, shooters, spawners, tanks, elites, bosses with phases.
- **Weapons** — 16 weapons in 4 tiers across melee, ranged, and elemental classes; thrust, sweep, shoot, orbit, aura, and chain-lightning behaviours; combine duplicates to tier up; up to 6 slots.
- **Stats** — Brotato's sheet: max HP, regen, life steal, damage, melee/ranged/elemental damage, attack speed, crit, range, armor, dodge, speed, luck, harvesting, pickup range, XP gain, knockback, consumable heal.
- **Economy** — materials double as XP and currency; shop between waves with tiered offers, reroll, lock, sell; 30+ passive items with specials; chests from elites; trees drop fruit.
- **Level-ups** — 4 stat cards per level, tier odds driven by luck and wave.
- **Watercolour renderer** — wet-edge washes, granulation, paper grain, loose ink outlines, splatter deaths, ink-bloom spawns, squash/stretch animation, weapon swing/recoil/orbit animation, projectile trails, ink-wipe transitions.
- **Audio** — synthesized SFX for every event and procedural music for title, wave, boss, and shop.
- **Screens** — boot, error, title, character select, HUD, level-up, shop, pause with stats, game over, victory.
- **Controls** — WASD / arrows on desktop, P or Escape to pause, 1–4 for level-up cards; virtual joystick on touch devices.

## Layout

```
src/
  core/     shared types and math (the contract between modules)
  data/     characters, weapons, items, enemies, waves, level-ups, economy
  game/     simulation and the run state machine
  render/   watercolour painter, sprite cache, world drawing, particle fx
  ui/       DOM screens, HUD, keyboard and joystick input
  audio/    synthesized sfx and procedural music
  main.ts   wiring
```
