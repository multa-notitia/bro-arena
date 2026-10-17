// Tunable combat/motion/readability knobs. Gameplay numbers (damage, HP,
// cooldowns, spawn rates) stay in src/data and src/game. Tweak these, not those.

import { clamp } from './core/math.ts'
import type { World } from './core/types.ts'

const JUICE_KEY = 'bro.reducedJuice'

export const FEEL = {
  camera: {
    /** Smaller = closer. 441 world px across a 1280 css window is zoom ~2.90. */
    worldWidth: 441,
    /**
     * The potato body is ~29.8 world px tall at the authored fit of 0.25
     * (119 cell px of painted figure). 29.8 × (1280/441) ≈ 86 css px,
     * 12% of a 720p frame. Enemies share this zoom. zoomMin keeps a
     * narrower window from shrinking the hero; zoomMax leaves 1280 unclamped.
     */
    zoomMin: 2.2,
    zoomMax: 3.35,
  },
  shake: {
    max: 22,
    decay: 9,
    /** Directional share vs. noisy perpendicular jitter. */
    directional: 0.72,
    jitter: 0.55,
    freqX: 61.3,
    freqY: 73.9,
    hit: 2.4,
    crit: 5.2,
    kill: 6.5,
    eliteKill: 10,
    bossKill: 16,
    hurt: 11,
    weaponKick: 2.8,
    bossEnter: 14,
    scream: 7,
  },
  hitStop: {
    /** Seconds; stacked then capped. Tiny on chips so hordes stay at 60fps. */
    hit: 0.012,
    crit: 0.028,
    kill: 0.038,
    eliteKill: 0.055,
    bossKill: 0.09,
    hurt: 0.055,
    max: 0.08,
  },
  kill: {
    chunkScale: 1.42,
    inkSize: 1.7,
    stainLife: 3.4,
  },
  motion: {
    dustSpeed: 42,
    lean: 0.38,
    startSquash: 0.22,
    stopSquash: 0.16,
    footEvery: 0.48,
  },
  shadow: {
    /** Peak alpha of the soft ground shadow. */
    alpha: 0.35,
    /** Width as a fraction of the sprite footprint. Stay under 0.8. */
    footprint: 0.74,
  },
  garden: {
    /**
     * Furrow art is 146 px tall. At 0.4 a bed's world height stays within
     * about 3× the hero's body width once the camera sits at the default
     * zoom. Plot spacing uses the same factor so the beds stay on the strip.
     */
    scale: 0.4,
  },
  projectile: {
    trailPts: 10,
    stretch: 0.9,
  },
} as const

export type HitStopKind = 'hit' | 'crit' | 'kill' | 'eliteKill' | 'bossKill' | 'hurt'

function readJuice(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(JUICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeJuice(v: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(JUICE_KEY, v ? '1' : '0')
  } catch {
    /* private mode */
  }
}

let reduced = readJuice()
let freeze = 0

export function getReducedJuice(): boolean {
  return reduced
}

export function setReducedJuice(v: boolean): void {
  reduced = !!v
  writeJuice(reduced)
  if (reduced) freeze = 0
}

/** 0..1 multiplier applied to shake, flash, and freeze. */
export function juiceScale(): number {
  return reduced ? 0.18 : 1
}

export function requestHitStop(kind: HitStopKind): void {
  if (reduced) return
  freeze = Math.min(FEEL.hitStop.max, freeze + FEEL.hitStop[kind])
}

/** Real dt in, sim dt out. Zero while a freeze frame is holding. */
export function consumeHitStop(dt: number): number {
  if (freeze <= 0) return dt
  freeze -= dt
  if (freeze < 0) freeze = 0
  return 0
}

export function resetFeel(): void {
  freeze = 0
}

function unit(dx: number, dy: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy) || 1
  return { x: dx / d, y: dy / d }
}

export function addTrauma(world: World, amount: number, dirX = 0, dirY = 0): void {
  const add = amount * juiceScale()
  if (add <= 0.01) return
  const cam = world.camera
  const next = clamp(cam.shake + add, 0, FEEL.shake.max)
  const w = add / Math.max(next, 0.001)
  const dir = unit(dirX, dirY)
  cam.shakeDirX = cam.shakeDirX * (1 - w) + dir.x * w
  cam.shakeDirY = cam.shakeDirY * (1 - w) + dir.y * w
  cam.shake = next
}

export function cameraShakeOffset(world: World): { x: number; y: number } {
  const cam = world.camera
  const mag = cam.shake
  if (mag < 0.04) return { x: 0, y: 0 }
  const t = world.time
  const s = FEEL.shake
  const nx = Math.sin(t * s.freqX)
  const ny = Math.cos(t * s.freqY)
  const px = -cam.shakeDirY
  const py = cam.shakeDirX
  return {
    x: cam.shakeDirX * mag * s.directional + (nx * cam.shakeDirX + ny * px) * mag * s.jitter * 0.45,
    y: cam.shakeDirY * mag * s.directional + (ny * cam.shakeDirY + nx * py) * mag * s.jitter * 0.45,
  }
}

export function flashStrength(raw: number): number {
  return raw * juiceScale()
}
