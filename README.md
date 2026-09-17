# Bro

A Brotato-style survivor arena in the browser. You are the last potato in the paddock. Weapons fire themselves. XP walks home. The blight does not get bored.

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

No API keys. Audio is synthesized in the browser and starts after the first click.

## First slice

- **Player** — a potato you steer with WASD / arrows on desktop, or a left-side stick on a phone.
- **Enemies** — sprouts, lumps, runners, and brutes that scale with the wave.
- **Auto-attack weapons** — Peeler from the start; Spud Gun, Peel Orbit, and Mash Hammer as level-up unlocks.
- **XP / level-up** — gems drop, get vacuumed in, and pause the run for three mutation cards (keys 1–3 or tap).
- **Waves** — timed pressure, a short quiet between waves, then a thicker mix.
- **States** — boot/loading, empty paddock on the title screen, canvas boot error with retry, pause, level-up, mashed (game over).

Desktop HUD sits in a top row. On a phone the stick appears, pause is a large tap target, and level-up cards stack full width.
