import { TAU, clamp, ease, lerp } from '../core/math.ts'
import type { AnimState, Form, Palette, Species } from '../core/types.ts'
import {
  darken,
  inkStroke,
  mixColor,
  n01,
  rgba,
  wash,
  wobbleBlob,
} from './watercolor.ts'

interface BodyCache {
  canvas(
    key: string,
    w: number,
    h: number,
    paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): HTMLCanvasElement
}

export const MUD_DEFAULT = '#33241a'
export const GLOW_DEFAULT = '#d9ff5c'
export const BODY_R = 30

export const SPECIES_LIST: readonly Species[] = [
  'potato',
  'carrot',
  'chili',
  'turnip',
  'pumpkin',
  'radish',
  'eggplant',
  'onion',
  'pea',
  'sprout',
  'garlic',
  'cabbage',
  'beet',
  'marrow',
  'corn',
  'broccoli',
]

export function isSpecies(s: string): s is Species {
  return (SPECIES_LIST as readonly string[]).includes(s)
}

const KIND_SPECIES: Record<string, Species> = {
  blob: 'pea',
  sprout: 'sprout',
  runner: 'radish',
  crab: 'turnip',
  wisp: 'garlic',
  brute: 'pumpkin',
  spitter: 'chili',
  hive: 'cabbage',
  charger: 'carrot',
  eliteBlob: 'pea',
  eliteBrute: 'pumpkin',
  mother: 'marrow',
  lord: 'beet',
}

const CHAR_SPECIES: Record<string, Species> = {
  'well-rounded': 'potato',
  brawler: 'turnip',
  ranger: 'carrot',
  bull: 'pumpkin',
  lucky: 'radish',
  mage: 'chili',
  glutton: 'eggplant',
  loud: 'onion',
}

export function resolveSpecies(paint: string, species?: string, kindOrId?: string): Species {
  if (species && isSpecies(species)) return species
  if (isSpecies(paint)) return paint
  if (kindOrId && KIND_SPECIES[kindOrId]) return KIND_SPECIES[kindOrId]
  if (kindOrId && CHAR_SPECIES[kindOrId]) return CHAR_SPECIES[kindOrId]
  return 'potato'
}

export function mudOf(p: Palette): string {
  return p.mud ?? MUD_DEFAULT
}

export function glowOf(p: Palette): string {
  return p.glow ?? GLOW_DEFAULT
}

export function paletteKey(p: Palette): string {
  return `${p.body}|${p.shade}|${p.ink}|${p.accent}|${p.eye}|${p.mud ?? ''}|${p.glow ?? ''}`
}

export const SPECIES_PALETTES: Record<Species, Palette> = {
  potato: { body: '#c9a962', shade: '#8f6e36', ink: '#2c2014', accent: '#6b8f71', eye: '#1a1208', mud: '#33241a', glow: '#d9ff5c' },
  carrot: { body: '#e6792b', shade: '#b3541c', ink: '#4a2410', accent: '#4f8a3c', eye: '#1a1208', mud: '#33241a', glow: '#ffd23d' },
  chili: { body: '#d9382a', shade: '#8e1f14', ink: '#2c0c08', accent: '#3f6b2e', eye: '#1a0808', mud: '#33241a', glow: '#ff3b1f' },
  turnip: { body: '#efe6dc', shade: '#b07aa8', ink: '#3a2430', accent: '#5f8a4e', eye: '#1a1214', mud: '#33241a', glow: '#ff8a3d' },
  pumpkin: { body: '#e08a2e', shade: '#a35a16', ink: '#2c1808', accent: '#5a6e3a', eye: '#1a1008', mud: '#33241a', glow: '#ff6b2b' },
  radish: { body: '#e05a7a', shade: '#a0344f', ink: '#2c1018', accent: '#4f8a3c', eye: '#1a080c', mud: '#33241a', glow: '#ff4fd8' },
  eggplant: { body: '#5b3a7a', shade: '#3a2352', ink: '#160c1c', accent: '#4f8a3c', eye: '#f0e8d8', mud: '#33241a', glow: '#b56bff' },
  onion: { body: '#f1dfb8', shade: '#c9a86d', ink: '#3a2c18', accent: '#7ba35b', eye: '#1a140c', mud: '#33241a', glow: '#e6ff5c' },
  pea: { body: '#7fae4a', shade: '#4f7a2a', ink: '#1c2810', accent: '#c4d48a', eye: '#14200c', mud: '#33241a', glow: '#d9ff5c' },
  sprout: { body: '#9ccd6a', shade: '#5a8a38', ink: '#243014', accent: '#d4e07a', eye: '#1a240c', mud: '#33241a', glow: '#c8ff6a' },
  garlic: { body: '#efe8dc', shade: '#c8b8a4', ink: '#2c241c', accent: '#b7a4c9', eye: '#1a1410', mud: '#33241a', glow: '#c9a4ff' },
  cabbage: { body: '#8fb87a', shade: '#5a7a48', ink: '#1c2814', accent: '#c8dd9a', eye: '#14200c', mud: '#33241a', glow: '#9dff8a' },
  beet: { body: '#7a1f3a', shade: '#3d0f1f', ink: '#14080c', accent: '#e9c7d1', eye: '#f0d0d8', mud: '#33241a', glow: '#ff1f4b' },
  marrow: { body: '#6f8f4a', shade: '#3e5a28', ink: '#1c2410', accent: '#b9c98a', eye: '#14200c', mud: '#33241a', glow: '#a4ff3d' },
  corn: { body: '#e8c44a', shade: '#b08a22', ink: '#2c240c', accent: '#5a8a3a', eye: '#1a1408', mud: '#33241a', glow: '#ffe66a' },
  broccoli: { body: '#4a8a3a', shade: '#2c5a24', ink: '#142010', accent: '#8fbf6a', eye: '#0c1408', mud: '#33241a', glow: '#9dff8a' },
}

export function sizeBucket(r: number): number {
  if (r >= 42) return 48
  if (r >= 28) return 36
  if (r >= 18) return 30
  return 24
}

export interface Rig {
  eyeL: { x: number; y: number }
  eyeR: { x: number; y: number }
  eyeS: number
  mouth: { x: number; y: number }
  mouthW: number
  shL: { x: number; y: number }
  shR: { x: number; y: number }
  hipL: { x: number; y: number }
  hipR: { x: number; y: number }
  armLen: number
  legLen: number
}

function rig(
  r: number,
  eyesY: number,
  mouthY: number,
  extra?: Partial<Rig>,
): Rig {
  const eyeS = r * 0.22
  const base: Rig = {
    eyeL: { x: -r * 0.28, y: eyesY },
    eyeR: { x: r * 0.3, y: eyesY },
    eyeS,
    mouth: { x: 0, y: mouthY },
    mouthW: r * 0.38,
    shL: { x: -r * 0.72, y: r * 0.05 },
    shR: { x: r * 0.72, y: r * 0.05 },
    hipL: { x: -r * 0.28, y: r * 0.72 },
    hipR: { x: r * 0.3, y: r * 0.72 },
    armLen: r * 0.7,
    legLen: r * 0.42,
  }
  return { ...base, ...extra }
}

export function speciesRig(species: Species, r: number): Rig {
  switch (species) {
    case 'carrot':
      return rig(r, r * 0.05, r * 0.42, {
        shL: { x: -r * 0.55, y: -r * 0.05 },
        shR: { x: r * 0.55, y: -r * 0.05 },
        hipL: { x: -r * 0.16, y: r * 0.92 },
        hipR: { x: r * 0.16, y: r * 0.92 },
        armLen: r * 0.62,
        legLen: r * 0.32,
        mouthW: r * 0.28,
      })
    case 'chili':
      return rig(r, -r * 0.08, r * 0.22, {
        shL: { x: -r * 0.55, y: 0 },
        shR: { x: r * 0.7, y: r * 0.1 },
        hipL: { x: -r * 0.15, y: r * 0.78 },
        hipR: { x: r * 0.35, y: r * 0.72 },
      })
    case 'pea':
      return rig(r * 0.85, -r * 0.12, r * 0.22, {
        shL: { x: -r * 0.7, y: 0 },
        shR: { x: r * 0.7, y: 0 },
        hipL: { x: -r * 0.22, y: r * 0.62 },
        hipR: { x: r * 0.22, y: r * 0.62 },
        armLen: r * 0.55,
        legLen: r * 0.34,
        eyeS: r * 0.2,
        mouthW: r * 0.28,
      })
    case 'sprout':
      return rig(r, r * 0.22, r * 0.48, {
        shL: { x: -r * 0.42, y: r * 0.2 },
        shR: { x: r * 0.42, y: r * 0.2 },
        hipL: { x: -r * 0.16, y: r * 0.85 },
        hipR: { x: r * 0.16, y: r * 0.85 },
        eyeS: r * 0.16,
        mouthW: r * 0.22,
        armLen: r * 0.5,
        legLen: r * 0.28,
      })
    case 'pumpkin':
      return rig(r, -r * 0.08, r * 0.28, {
        shL: { x: -r * 1.05, y: r * 0.05 },
        shR: { x: r * 1.05, y: r * 0.05 },
        hipL: { x: -r * 0.4, y: r * 0.7 },
        hipR: { x: r * 0.4, y: r * 0.7 },
        mouthW: r * 0.5,
        armLen: r * 0.65,
      })
    case 'eggplant':
      return rig(r, r * 0.05, r * 0.38, {
        shL: { x: -r * 0.7, y: r * 0.15 },
        shR: { x: r * 0.7, y: r * 0.15 },
        hipL: { x: -r * 0.28, y: r * 0.85 },
        hipR: { x: r * 0.28, y: r * 0.85 },
      })
    case 'marrow':
      return rig(r, -r * 0.05, r * 0.18, {
        eyeL: { x: r * 0.35, y: -r * 0.12 },
        eyeR: { x: r * 0.75, y: -r * 0.08 },
        mouth: { x: r * 0.7, y: r * 0.18 },
        shL: { x: -r * 1.05, y: 0 },
        shR: { x: r * 1.15, y: 0 },
        hipL: { x: -r * 0.35, y: r * 0.48 },
        hipR: { x: r * 0.55, y: r * 0.48 },
        mouthW: r * 0.32,
        armLen: r * 0.55,
        legLen: r * 0.36,
      })
    case 'corn':
      return rig(r, -r * 0.05, r * 0.28, {
        shL: { x: -r * 0.55, y: 0 },
        shR: { x: r * 0.55, y: 0 },
        hipL: { x: -r * 0.18, y: r * 0.85 },
        hipR: { x: r * 0.18, y: r * 0.85 },
        mouthW: r * 0.26,
      })
    case 'broccoli':
      return rig(r, r * 0.05, r * 0.32, {
        shL: { x: -r * 0.55, y: r * 0.15 },
        shR: { x: r * 0.55, y: r * 0.15 },
        hipL: { x: -r * 0.2, y: r * 0.88 },
        hipR: { x: r * 0.2, y: r * 0.88 },
      })
    case 'beet':
      return rig(r, -r * 0.1, r * 0.22, {
        hipL: { x: -r * 0.22, y: r * 0.7 },
        hipR: { x: r * 0.22, y: r * 0.7 },
      })
    case 'radish':
      return rig(r, -r * 0.08, r * 0.2, {
        shL: { x: -r * 0.62, y: 0 },
        shR: { x: r * 0.62, y: 0 },
        hipL: { x: -r * 0.18, y: r * 0.62 },
        hipR: { x: r * 0.18, y: r * 0.62 },
        eyeS: r * 0.18,
        mouthW: r * 0.26,
        armLen: r * 0.52,
        legLen: r * 0.3,
      })
    case 'cabbage':
      return rig(r, -r * 0.05, r * 0.22, {
        shL: { x: -r * 0.9, y: 0 },
        shR: { x: r * 0.9, y: 0 },
      })
    default:
      return rig(r, -r * 0.14, r * 0.26)
  }
}

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function inkW(r: number, nightmare: boolean): number {
  return Math.max(nightmare ? 3.4 : 2.4, r * (nightmare ? 0.16 : 0.12))
}

function outline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pal: Palette,
  seed: number,
  nightmare: boolean,
  extra?: { n?: number; wobble?: number; rotation?: number },
): void {
  inkStroke(ctx, cx, cy, rx, ry, pal.ink, {
    seed,
    width: inkW(Math.min(rx, ry), nightmare),
    alpha: nightmare ? 0.94 : 0.88,
    n: extra?.n ?? 11,
    wobble: extra?.wobble,
    rotation: extra?.rotation,
  })
}

function nightmarePal(pal: Palette): Palette {
  const mud = mudOf(pal)
  const paper = '#c4b89a'
  return {
    body: mixColor(mixColor(pal.body, paper, 0.28), mud, 0.12),
    shade: mixColor(mixColor(pal.shade, paper, 0.22), mud, 0.16),
    ink: mixColor(pal.ink, '#1a1410', 0.2),
    accent: mixColor(pal.accent, paper, 0.18),
    eye: pal.eye,
    mud,
    glow: glowOf(pal),
  }
}

function paintMudCoat(ctx: CanvasRenderingContext2D, r: number, pal: Palette, seed: number): void {
  const mud = mudOf(pal)
  const wet = mixColor(mud, pal.body, 0.18)
  const top = r * (-0.28 + n01(0, seed) * 0.2)
  const path = new Path2D()
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const x = lerp(-r * 1.45, r * 1.45, u)
    let y = top + (n01(i, seed + 1) - 0.5) * r * 0.38
    if (n01(i, seed + 2) > 0.78) y += r * (0.28 + n01(i, seed + 3) * 0.22)
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.lineTo(r * 1.5, r * 1.7)
  path.lineTo(-r * 1.5, r * 1.7)
  path.closePath()
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.64
  ctx.fillStyle = mud
  ctx.fill(path)
  ctx.globalAlpha = 0.28
  ctx.fillStyle = wet
  ctx.fill(wobbleBlob(0, r * 0.55, r * 0.95, r * 0.55, seed + 4, { n: 10, wobble: 0.32 }))
  ctx.restore()
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const x = side * r * (0.55 + n01(i, seed + 11) * 0.4)
    const y0 = r * (0.15 + n01(i, seed + 12) * 0.25)
    const h = r * (0.45 + n01(i, seed + 13) * 0.4)
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.58
    ctx.fillStyle = mud
    ctx.fill(wobbleBlob(x, y0 - h * 0.35, r * 0.1, h * 0.5, seed + 14 + i, { n: 6, wobble: 0.4 }))
    ctx.restore()
  }
  const drips = 3 + Math.floor(n01(3, seed) * 3)
  for (let i = 0; i < drips; i++) {
    const x = (n01(i, seed + 8) - 0.5) * r * 1.4
    const len = r * (0.18 + n01(i, seed + 9) * 0.28)
    ctx.globalAlpha = 0.78
    ctx.fillStyle = mud
    ctx.fill(wobbleBlob(x, r * 0.95 + len * 0.35, r * 0.09, len * 0.55, seed + i, { n: 6, wobble: 0.3 }))
    ctx.beginPath()
    ctx.arc(x, r * 0.95 + len, r * 0.07, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 0.28
  ctx.fillStyle = mixColor(mud, '#fff6e8', 0.22)
  ctx.fill(wobbleBlob(-r * 0.18, r * 0.42, r * 0.24, r * 0.1, seed + 20, { n: 6, wobble: 0.3 }))
  ctx.globalAlpha = 1
}

function leaves(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pal: Palette, seed: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const a = -1.2 + i * (2.4 / Math.max(1, n - 1))
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    wash(ctx, 0, -r * 0.35, r * 0.22, r * 0.45, pal.accent, { seed: seed + i, shade: darken(pal.accent, 0.25), n: 7, wobble: 0.28 })
    inkStroke(ctx, 0, -r * 0.35, r * 0.24, r * 0.48, pal.ink, { seed: seed + i, width: 1.2, n: 7, alpha: 0.75 })
    ctx.restore()
  }
}

function paintPotato(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, 0, r * 1.05, r * 0.92, pal.body, { seed, shade: pal.shade, n: 10, wobble: 0.18 })
  for (let i = 0; i < 5; i++) {
    const a = n01(i, seed + 4) * TAU
    const d = r * (0.15 + n01(i, seed + 5) * 0.45)
    ctx.globalAlpha = 0.45
    ctx.fillStyle = pal.shade
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.85, r * 0.08, r * 0.06, a, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  outline(ctx, 0, 0, r * 1.08, r * 0.95, pal, seed, nm, { n: 12, wobble: 0.1 })
}

function paintCarrot(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  leaves(ctx, 0, -r * 0.72, r * 1.05, pal, seed, 5)
  const path = new Path2D()
  path.moveTo(0, r * 1.08)
  path.quadraticCurveTo(-r * 0.55, r * 0.1, -r * 0.42, -r * 0.55)
  path.quadraticCurveTo(0, -r * 0.72, r * 0.42, -r * 0.55)
  path.quadraticCurveTo(r * 0.55, r * 0.1, 0, r * 1.08)
  path.closePath()
  ctx.fillStyle = pal.body
  ctx.globalAlpha = 0.95
  ctx.fill(path)
  ctx.globalAlpha = 0.4
  ctx.fillStyle = pal.shade
  ctx.fill(wobbleBlob(r * 0.08, r * 0.25, r * 0.22, r * 0.5, seed, { n: 6, wobble: 0.2 }))
  ctx.globalAlpha = 1
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = inkW(r, nm)
  ctx.globalAlpha = nm ? 0.94 : 0.88
  ctx.stroke(path)
  ctx.globalAlpha = 1
}

function paintChili(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, r * 0.08, r * 0.05, r * 0.55, r * 1.05, pal.body, { seed, shade: pal.shade, n: 9, wobble: 0.22, rotation: 0.45 })
  wash(ctx, -r * 0.15, -r * 0.15, r * 0.42, r * 0.7, pal.body, { seed: seed + 2, shade: pal.shade, n: 7, wobble: 0.2, rotation: -0.4 })
  wash(ctx, 0, -r * 0.85, r * 0.16, r * 0.22, pal.accent, { seed: seed + 4, n: 5, wobble: 0.2, passes: 2 })
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.95)
  ctx.quadraticCurveTo(r * 0.15, -r * 1.15, r * 0.08, -r * 1.28)
  ctx.stroke()
  outline(ctx, r * 0.05, 0, r * 0.72, r * 1.08, pal, seed, nm, { n: 10, rotation: 0.2 })
}

function paintTurnip(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  leaves(ctx, 0, -r * 0.85, r * 0.85, pal, seed, 3)
  wash(ctx, 0, 0, r * 0.95, r * 0.95, pal.body, { seed, shade: pal.shade, n: 9, wobble: 0.14 })
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, r * 0.35, r * 0.95, r * 0.65, 0, 0, TAU)
  ctx.clip()
  wash(ctx, 0, r * 0.4, r * 0.9, r * 0.55, pal.shade, { seed: seed + 3, n: 8, wobble: 0.16, passes: 3 })
  ctx.restore()
  outline(ctx, 0, 0, r * 0.98, r * 0.98, pal, seed, nm)
}

function paintPumpkin(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.08, r * 1.35, r * 0.95, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.1 })
  ctx.strokeStyle = rgba(pal.ink, 0.35)
  ctx.lineWidth = 1.6
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
    ctx.beginPath()
    ctx.moveTo(r * x, -r * 0.55)
    ctx.quadraticCurveTo(r * x * 0.7, r * 0.1, r * x * 0.85, r * 0.85)
    ctx.stroke()
  }
  wash(ctx, 0, -r * 0.95, r * 0.16, r * 0.28, pal.accent, { seed: seed + 4, n: 5, wobble: 0.15, passes: 2 })
  outline(ctx, 0, r * 0.08, r * 1.38, r * 0.98, pal, seed, nm, { n: 10 })
}

function paintRadish(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  leaves(ctx, 0, -r * 0.7, r * 0.7, pal, seed, 3)
  wash(ctx, 0, 0, r * 0.78, r * 0.78, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.14 })
  wash(ctx, 0, r * 0.55, r * 0.32, r * 0.28, '#f2ead8', { seed: seed + 3, shade: '#d8c8b0', n: 6, wobble: 0.18, passes: 2 })
  outline(ctx, 0, 0.05 * r, r * 0.82, r * 0.88, pal, seed, nm)
}

function paintEggplant(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.15, r * 0.85, r * 1.15, pal.body, { seed, shade: pal.shade, n: 9, wobble: 0.12 })
  ctx.globalAlpha = 0.4
  ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.35)
  ctx.fill(wobbleBlob(-r * 0.22, -r * 0.15, r * 0.22, r * 0.4, seed + 4, { n: 6, wobble: 0.2 }))
  ctx.globalAlpha = 1
  wash(ctx, 0, -r * 0.95, r * 0.55, r * 0.28, pal.accent, { seed: seed + 6, shade: darken(pal.accent, 0.2), n: 6, wobble: 0.16 })
  outline(ctx, 0, r * 0.12, r * 0.88, r * 1.18, pal, seed, nm)
}

function paintOnion(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.08, r * 0.95, r * 0.95, pal.body, { seed, shade: pal.shade, n: 9, wobble: 0.1 })
  ctx.strokeStyle = rgba(pal.ink, 0.22)
  ctx.lineWidth = 1.8
  for (const s of [0.55, 0.75, 0.95]) {
    ctx.beginPath()
    ctx.ellipse(0, r * 0.08, r * s, r * s, 0, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }
  ctx.strokeStyle = pal.accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-r * 0.12, -r * 0.85)
  ctx.quadraticCurveTo(-r * 0.2, -r * 1.2, -r * 0.05, -r * 1.35)
  ctx.moveTo(r * 0.1, -r * 0.85)
  ctx.quadraticCurveTo(r * 0.22, -r * 1.25, r * 0.08, -r * 1.4)
  ctx.stroke()
  outline(ctx, 0, r * 0.08, r * 0.98, r * 0.98, pal, seed, nm)
}

function paintPea(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, 0, r * 0.82, r * 0.82, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12 })
  ctx.globalAlpha = 0.45
  ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.4)
  ctx.beginPath()
  ctx.ellipse(-r * 0.2, -r * 0.22, r * 0.18, r * 0.14, -0.4, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  outline(ctx, 0, 0, r * 0.86, r * 0.86, pal, seed, nm, { n: 9 })
}

function paintSprout(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.35, r * 0.38, r * 0.55, mixColor(pal.body, '#e8f0c8', 0.35), { seed, shade: pal.shade, n: 7, wobble: 0.16 })
  ctx.save()
  ctx.translate(-r * 0.28, -r * 0.35)
  ctx.rotate(-0.5)
  wash(ctx, 0, 0, r * 0.48, r * 0.22, pal.accent, { seed: seed + 2, shade: pal.shade, n: 7, wobble: 0.25 })
  ctx.restore()
  ctx.save()
  ctx.translate(r * 0.3, -r * 0.28)
  ctx.rotate(0.55)
  wash(ctx, 0, 0, r * 0.42, r * 0.2, pal.body, { seed: seed + 4, shade: pal.shade, n: 7, wobble: 0.25 })
  ctx.restore()
  wash(ctx, 0, r * 0.55, r * 0.42, r * 0.38, pal.body, { seed: seed + 6, shade: pal.shade, n: 8, wobble: 0.18 })
  outline(ctx, 0, r * 0.4, r * 0.48, r * 0.7, pal, seed, nm)
}

function paintGarlic(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.1, r * 0.95, r * 0.9, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12 })
  ctx.strokeStyle = rgba(pal.accent, 0.7)
  ctx.lineWidth = 1.4
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.55)
    ctx.quadraticCurveTo(Math.sin(a) * r * 0.7, r * 0.15, Math.sin(a) * r * 0.55, r * 0.85)
    ctx.stroke()
  }
  wash(ctx, 0, -r * 0.85, r * 0.12, r * 0.2, pal.accent, { seed: seed + 3, n: 5, passes: 2 })
  outline(ctx, 0, r * 0.1, r * 0.98, r * 0.94, pal, seed, nm)
}

function paintCabbage(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 0.7
    wash(ctx, Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.1, r * (1.05 - i * 0.12), r * (0.9 - i * 0.08), i % 2 ? pal.accent : pal.body, {
      seed: seed + i,
      shade: pal.shade,
      n: 8,
      wobble: 0.18,
    })
  }
  outline(ctx, 0, 0, r * 1.12, r * 0.98, pal, seed, nm, { n: 12, wobble: 0.16 })
}

function paintBeet(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  leaves(ctx, 0, -r * 0.85, r * 0.7, { ...pal, accent: pal.accent }, seed, 3)
  wash(ctx, 0, 0, r * 0.95, r * 0.9, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12 })
  ctx.strokeStyle = rgba('#3d0f1f', 0.55)
  ctx.lineWidth = 1.3
  for (let i = 0; i < 4; i++) {
    const a = -0.6 + i * 0.4
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.3)
    ctx.quadraticCurveTo(Math.sin(a) * r * 0.5, r * 0.1, Math.sin(a) * r * 0.4, r * 0.55)
    ctx.stroke()
  }
  ctx.strokeStyle = pal.accent
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(0, r * 0.75)
  ctx.quadraticCurveTo(r * 0.12, r * 1.1, 0, r * 1.35)
  ctx.stroke()
  outline(ctx, 0, 0, r * 0.98, r * 0.94, pal, seed, nm)
}

function paintMarrow(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, r * 0.1, 0, r * 1.55, r * 0.62, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12, rotation: -0.12 })
  ctx.strokeStyle = rgba(pal.accent, 0.7)
  ctx.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    const x = -r * 0.9 + i * r * 0.55
    ctx.beginPath()
    ctx.moveTo(x, -r * 0.35)
    ctx.quadraticCurveTo(x + r * 0.1, 0, x, r * 0.4)
    ctx.stroke()
  }
  outline(ctx, r * 0.1, 0, r * 1.58, r * 0.65, pal, seed, nm, { n: 11, rotation: -0.12 })
}

function paintCorn(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, -r * 0.45, 0, r * 0.35, r * 0.95, pal.accent, { seed, shade: darken(pal.accent, 0.2), n: 7, wobble: 0.18, rotation: -0.25 })
  wash(ctx, r * 0.45, 0.05 * r, r * 0.32, r * 0.9, pal.accent, { seed: seed + 2, n: 7, wobble: 0.18, rotation: 0.28 })
  wash(ctx, 0, 0, r * 0.48, r * 1.05, pal.body, { seed: seed + 4, shade: pal.shade, n: 7, wobble: 0.08 })
  ctx.fillStyle = rgba(pal.shade, 0.35)
  for (let y = -4; y <= 4; y++) {
    for (let x = -1; x <= 1; x++) {
      ctx.beginPath()
      ctx.arc(x * r * 0.16, y * r * 0.16, r * 0.055, 0, TAU)
      ctx.fill()
    }
  }
  outline(ctx, 0, 0, r * 0.52, r * 1.08, pal, seed, nm, { n: 9 })
}

function paintBroccoli(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  wash(ctx, 0, r * 0.45, r * 0.28, r * 0.55, '#c4a06a', { seed, shade: '#8a6a38', n: 6, wobble: 0.12, passes: 3 })
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU
    wash(
      ctx,
      Math.cos(a) * r * 0.35,
      -r * 0.25 + Math.sin(a) * r * 0.22,
      r * 0.38,
      r * 0.32,
      i % 2 ? pal.accent : pal.body,
      { seed: seed + i, shade: pal.shade, n: 7, wobble: 0.28, passes: 2 },
    )
  }
  outline(ctx, 0, -r * 0.15, r * 0.85, r * 0.7, pal, seed, nm, { n: 11, wobble: 0.22 })
}

function paintSpeciesSilhouette(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  r: number,
  seed: number,
  nm: boolean,
): void {
  switch (species) {
    case 'potato':
      paintPotato(ctx, pal, r, seed, nm)
      break
    case 'carrot':
      paintCarrot(ctx, pal, r, seed, nm)
      break
    case 'chili':
      paintChili(ctx, pal, r, seed, nm)
      break
    case 'turnip':
      paintTurnip(ctx, pal, r, seed, nm)
      break
    case 'pumpkin':
      paintPumpkin(ctx, pal, r, seed, nm)
      break
    case 'radish':
      paintRadish(ctx, pal, r, seed, nm)
      break
    case 'eggplant':
      paintEggplant(ctx, pal, r, seed, nm)
      break
    case 'onion':
      paintOnion(ctx, pal, r, seed, nm)
      break
    case 'pea':
      paintPea(ctx, pal, r, seed, nm)
      break
    case 'sprout':
      paintSprout(ctx, pal, r, seed, nm)
      break
    case 'garlic':
      paintGarlic(ctx, pal, r, seed, nm)
      break
    case 'cabbage':
      paintCabbage(ctx, pal, r, seed, nm)
      break
    case 'beet':
      paintBeet(ctx, pal, r, seed, nm)
      break
    case 'marrow':
      paintMarrow(ctx, pal, r, seed, nm)
      break
    case 'corn':
      paintCorn(ctx, pal, r, seed, nm)
      break
    case 'broccoli':
      paintBroccoli(ctx, pal, r, seed, nm)
      break
    default: {
      const _n: never = species
      void _n
      paintPotato(ctx, pal, r, seed, nm)
    }
  }
}

function paintSpeciesMarks(ctx: CanvasRenderingContext2D, species: Species, pal: Palette, r: number, seed: number): void {
  switch (species) {
    case 'potato':
      for (let i = 0; i < 5; i++) {
        const a = n01(i, seed + 4) * TAU
        const d = r * (0.15 + n01(i, seed + 5) * 0.45)
        ctx.fillStyle = pal.shade
        ctx.beginPath()
        ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.85, r * 0.08, r * 0.06, a, 0, TAU)
        ctx.fill()
      }
      break
    case 'carrot':
    case 'turnip':
    case 'radish':
    case 'beet':
      leaves(ctx, 0, species === 'carrot' ? -r * 0.72 : -r * 0.85, species === 'carrot' ? r * 1.05 : r * 0.7, pal, seed, species === 'carrot' ? 5 : 3)
      if (species === 'radish') {
        wash(ctx, 0, r * 0.55, r * 0.32, r * 0.28, '#f2ead8', { seed: seed + 3, shade: '#d8c8b0', n: 6, wobble: 0.18, passes: 2 })
      }
      if (species === 'beet') {
        ctx.strokeStyle = rgba('#3d0f1f', 0.65)
        ctx.lineWidth = 1.3
        for (let i = 0; i < 4; i++) {
          const a = -0.6 + i * 0.4
          ctx.beginPath()
          ctx.moveTo(0, -r * 0.3)
          ctx.quadraticCurveTo(Math.sin(a) * r * 0.5, r * 0.1, Math.sin(a) * r * 0.4, r * 0.55)
          ctx.stroke()
        }
        ctx.strokeStyle = pal.accent
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(0, r * 0.75)
        ctx.quadraticCurveTo(r * 0.12, r * 1.1, 0, r * 1.35)
        ctx.stroke()
      }
      break
    case 'chili':
      wash(ctx, 0, -r * 0.85, r * 0.16, r * 0.22, pal.accent, { seed: seed + 4, n: 5, wobble: 0.2, passes: 2 })
      ctx.strokeStyle = pal.ink
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.95)
      ctx.quadraticCurveTo(r * 0.15, -r * 1.15, r * 0.08, -r * 1.28)
      ctx.stroke()
      break
    case 'pumpkin':
      ctx.strokeStyle = rgba(pal.ink, 0.55)
      ctx.lineWidth = 1.8
      for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
        ctx.beginPath()
        ctx.moveTo(r * x, -r * 0.55)
        ctx.quadraticCurveTo(r * x * 0.7, r * 0.1, r * x * 0.85, r * 0.85)
        ctx.stroke()
      }
      wash(ctx, 0, -r * 0.95, r * 0.16, r * 0.28, pal.accent, { seed: seed + 4, n: 5, wobble: 0.15, passes: 2 })
      break
    case 'eggplant':
      wash(ctx, 0, -r * 0.95, r * 0.55, r * 0.28, pal.accent, { seed: seed + 6, shade: darken(pal.accent, 0.2), n: 6, wobble: 0.16 })
      ctx.globalAlpha = 0.45
      ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.35)
      ctx.fill(wobbleBlob(-r * 0.22, -r * 0.15, r * 0.22, r * 0.4, seed + 4, { n: 6, wobble: 0.2 }))
      ctx.globalAlpha = 1
      break
    case 'onion':
      ctx.strokeStyle = rgba(pal.ink, 0.4)
      ctx.lineWidth = 1.3
      for (const s of [0.55, 0.75, 0.95]) {
        ctx.beginPath()
        ctx.ellipse(0, r * 0.08, r * s, r * s, 0, 0.15, Math.PI - 0.15)
        ctx.stroke()
      }
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-r * 0.12, -r * 0.85)
      ctx.quadraticCurveTo(-r * 0.2, -r * 1.2, -r * 0.05, -r * 1.35)
      ctx.moveTo(r * 0.1, -r * 0.85)
      ctx.quadraticCurveTo(r * 0.22, -r * 1.25, r * 0.08, -r * 1.4)
      ctx.stroke()
      break
    case 'pea':
      ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.4)
      ctx.beginPath()
      ctx.ellipse(-r * 0.2, -r * 0.22, r * 0.18, r * 0.14, -0.4, 0, TAU)
      ctx.fill()
      break
    case 'sprout':
      ctx.save()
      ctx.translate(-r * 0.28, -r * 0.35)
      ctx.rotate(-0.5)
      wash(ctx, 0, 0, r * 0.48, r * 0.22, pal.accent, { seed: seed + 2, shade: pal.shade, n: 7, wobble: 0.25 })
      ctx.restore()
      ctx.save()
      ctx.translate(r * 0.3, -r * 0.28)
      ctx.rotate(0.55)
      wash(ctx, 0, 0, r * 0.42, r * 0.2, pal.body, { seed: seed + 4, shade: pal.shade, n: 7, wobble: 0.25 })
      ctx.restore()
      break
    case 'garlic':
      ctx.strokeStyle = rgba(pal.accent, 0.8)
      ctx.lineWidth = 1.4
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.55)
        ctx.quadraticCurveTo(Math.sin(a) * r * 0.7, r * 0.15, Math.sin(a) * r * 0.55, r * 0.85)
        ctx.stroke()
      }
      wash(ctx, 0, -r * 0.85, r * 0.12, r * 0.2, pal.accent, { seed: seed + 3, n: 5, passes: 2 })
      break
    case 'cabbage':
      ctx.strokeStyle = rgba(pal.ink, 0.35)
      ctx.lineWidth = 1.4
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.ellipse(0, 0, r * (0.7 + i * 0.14), r * (0.58 + i * 0.12), i * 0.2, 0, TAU)
        ctx.stroke()
      }
      break
    case 'marrow':
      ctx.strokeStyle = rgba(pal.accent, 0.8)
      ctx.lineWidth = 3
      for (let i = 0; i < 4; i++) {
        const x = -r * 0.9 + i * r * 0.55
        ctx.beginPath()
        ctx.moveTo(x, -r * 0.35)
        ctx.quadraticCurveTo(x + r * 0.1, 0, x, r * 0.4)
        ctx.stroke()
      }
      break
    case 'corn':
      wash(ctx, -r * 0.45, 0, r * 0.35, r * 0.95, pal.accent, { seed, shade: darken(pal.accent, 0.2), n: 7, wobble: 0.18, rotation: -0.25 })
      wash(ctx, r * 0.45, 0.05 * r, r * 0.32, r * 0.9, pal.accent, { seed: seed + 2, n: 7, wobble: 0.18, rotation: 0.28 })
      ctx.fillStyle = rgba(pal.shade, 0.45)
      for (let y = -4; y <= 4; y++) {
        for (let x = -1; x <= 1; x++) {
          ctx.beginPath()
          ctx.arc(x * r * 0.16, y * r * 0.16, r * 0.055, 0, TAU)
          ctx.fill()
        }
      }
      break
    case 'broccoli':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU
        wash(
          ctx,
          Math.cos(a) * r * 0.32,
          -r * 0.25 + Math.sin(a) * r * 0.2,
          r * 0.28,
          r * 0.24,
          pal.accent,
          { seed: seed + i, shade: pal.shade, n: 6, wobble: 0.28, passes: 2 },
        )
      }
      break
    default:
      break
  }
}

export function paintCreatureBody(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  r: number,
  form: Form,
): void {
  const nm = form === 'nightmare'
  const used = nm ? nightmarePal(pal) : pal
  const seed = seedOf(species + paletteKey(pal) + form)
  paintSpeciesSilhouette(ctx, species, used, r, seed, nm)
  if (nm) {
    paintMudCoat(ctx, r, pal, seed)
    ctx.save()
    ctx.globalAlpha = 0.5
    paintSpeciesMarks(ctx, species, pal, r, seed)
    ctx.restore()
    outline(ctx, 0, r * 0.08, r * 1.12, r * 1.05, used, seed + 9, true, { n: 10, wobble: 0.14 })
  }
}

export function screamScale(scream: number): { sx: number; sy: number } {
  if (scream < 0) return { sx: 1, sy: 1 }
  const t = clamp(scream, 0, 1)
  if (t < 0.3) {
    const u = t / 0.3
    const sh = Math.sin(u * 20) * 0.03
    return { sx: lerp(1, 1.08, u) + sh, sy: lerp(1, 0.88, u) - sh * 0.5 }
  }
  if (t < 0.78) {
    const u = ease.outCubic((t - 0.3) / 0.48)
    return { sx: lerp(1.08, 0.76, u), sy: lerp(0.88, 1.45, u) }
  }
  const u = ease.outCubic((t - 0.78) / 0.22)
  return { sx: lerp(0.76, 1, u), sy: lerp(1.45, 1, u) }
}

/** Prefer anim.scream; screaming state falls back to stateT / 1.15. */
export function resolveScream(anim: AnimState, state?: string, stateT?: number): number {
  if (anim.scream >= 0) return clamp(anim.scream, 0, 1)
  if (state === 'screaming') return clamp((stateT ?? 0) / 1.15, 0, 1)
  return -1
}

export function resolveMouth(anim: AnimState, form: Form, scream: number): number {
  let m = anim.mouth ?? 0
  if (form === 'nightmare') m = Math.max(m, 0.35)
  if (scream >= 0.3) m = 1
  else if (scream >= 0) m = Math.max(m, lerp(0.18, 0.5, scream / 0.3))
  return clamp(m, 0, 1)
}

export function handLocal(rig: Rig, gait: number, side: -1 | 1, facing: 1 | -1): { x: number; y: number } {
  const sh = side < 0 ? rig.shL : rig.shR
  const swing = Math.sin(gait * TAU) * 0.7 * -side
  const ang = (side < 0 ? Math.PI * 0.85 : Math.PI * 0.15) + swing * 0.55
  return {
    x: (sh.x + Math.cos(ang) * rig.armLen) * facing,
    y: sh.y + Math.sin(ang) * rig.armLen,
  }
}

export interface LiveOpts {
  species: Species
  pal: Palette
  r: number
  form: Form
  mouth: number
  blink: number
  gait: number
  scream: number
  facing: 1 | -1
  lookX: number
  lookY: number
  t: number
  holdL?: { x: number; y: number }
  holdR?: { x: number; y: number }
  uid?: number
}

function blinkLid(blink: number): number {
  if (blink < 0) return 1
  return 1 - Math.sin(clamp(blink, 0, 1) * Math.PI)
}

function paintMouth(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  x: number,
  y: number,
  w: number,
  open: number,
  form: Form,
  facing: 1 | -1,
): void {
  ctx.save()
  ctx.translate(x * facing, y)
  ctx.strokeStyle = pal.ink
  ctx.fillStyle = '#1a100c'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (open < 0.18) {
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    ctx.quadraticCurveTo(0, w * 0.22 + open * 6, w * 0.5, 0)
    ctx.stroke()
  } else if (open < 0.55) {
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.ellipse(0, w * 0.08, w * 0.42, w * 0.18 * (0.4 + open), 0, 0, TAU)
    ctx.stroke()
  } else {
    const h = w * (0.22 + open * 0.42)
    ctx.beginPath()
    ctx.ellipse(0, h * 0.15, w * 0.48, h, 0, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.stroke()
    if (form === 'nightmare' || open > 0.85) {
      ctx.fillStyle = '#f2ead8'
      const n = 4
      for (let i = 0; i < n; i++) {
        const tx = lerp(-w * 0.32, w * 0.32, n <= 1 ? 0.5 : i / (n - 1))
        ctx.beginPath()
        ctx.moveTo(tx - 2, -h * 0.15)
        ctx.lineTo(tx, h * 0.35)
        ctx.lineTo(tx + 2, -h * 0.15)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  ctx.restore()
}

function paintEyePair(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  rig: Rig,
  facing: 1 | -1,
  lookX: number,
  lookY: number,
  blink: number,
  scream: number,
  form: Form,
  t: number,
): void {
  const lid = blinkLid(blink)
  let open = lid
  if (scream >= 0 && scream < 0.4) open *= 0.35
  else if (scream >= 0.4) open = Math.max(open, 1.15)
  const glow = glowOf(pal)
  const nm = form === 'nightmare'
  const flare = nm && scream >= 0 ? 1 + scream * 0.8 : nm ? 1 + 0.12 * Math.sin(t * 5) : 1
  for (const eye of [rig.eyeL, rig.eyeR]) {
    const ex = eye.x * facing
    const ey = eye.y
    const rs = rig.eyeS * (scream >= 0.4 ? 1.15 : 1)
    ctx.save()
    ctx.translate(ex, ey)
    ctx.scale(1, clamp(open, 0.06, 1.25))
    if (nm) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.4 * flare
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, rs * 1.55 * flare, 0, TAU)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, rs * 0.72 * flare, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fffde8'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.arc(-rs * 0.18, -rs * 0.18, rs * 0.18, 0, TAU)
      ctx.fill()
    } else {
      ctx.fillStyle = '#f4efe4'
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.48, rs * 0.55, 0, 0, TAU)
      ctx.fill()
      const px = clamp(lookX, -1, 1) * rs * 0.16
      const py = clamp(lookY, -1, 1) * rs * 0.12
      ctx.fillStyle = pal.eye
      ctx.beginPath()
      ctx.ellipse(px, py, rs * 0.22, rs * 0.24, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(px - rs * 0.08, py - rs * 0.1, rs * 0.08, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = pal.ink
      ctx.lineWidth = Math.max(0.8, rs * 0.1)
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.48, rs * 0.55, 0, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function mitten(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Palette, s: number): void {
  ctx.fillStyle = pal.body
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.ellipse(x, y, s, s * 0.85, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
}

function foot(ctx: CanvasRenderingContext2D, x: number, y: number, pal: Palette, s: number, facing: 1 | -1): void {
  ctx.fillStyle = pal.shade
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.ellipse(x + facing * s * 0.3, y, s * 1.1, s * 0.45, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
}

export function paintLiveFeatures(ctx: CanvasRenderingContext2D, o: LiveOpts): void {
  const rig = speciesRig(o.species, o.r)
  const f = o.facing
  const pal = o.form === 'nightmare' ? nightmarePal(o.pal) : o.pal
  paintEyePair(ctx, pal, rig, f, o.lookX, o.lookY, o.blink, o.scream, o.form, o.t)
  paintMouth(ctx, pal, rig.mouth.x, rig.mouth.y, rig.mouthW, o.mouth, o.form, f)

  if (o.scream >= 0.28) {
    ctx.save()
    const mx = rig.mouth.x * f
    const my = rig.mouth.y
    const u = clamp((o.scream - 0.28) / 0.72, 0, 1)
    ctx.strokeStyle = pal.ink
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.5 + u * 0.45
    const nLines = 8
    for (let i = 0; i < nLines; i++) {
      const a = -1.05 + i * (2.1 / (nLines - 1))
      const len = o.r * (0.32 + u * 0.5) * (0.65 + (i % 2) * 0.4)
      ctx.lineWidth = 1.4 + (i % 3 === 0 ? 0.8 : 0)
      ctx.beginPath()
      ctx.moveTo(mx + Math.cos(a) * o.r * 0.22, my + Math.sin(a) * o.r * 0.14)
      ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len * 0.72)
      ctx.stroke()
    }
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + u * 0.4
    ctx.strokeStyle = glowOf(o.pal)
    ctx.lineWidth = 3.2
    ctx.beginPath()
    ctx.ellipse(mx, my, o.r * (0.18 + u * 0.16), o.r * (0.12 + u * 0.12), 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
    ctx.restore()
  }

  const hl = o.holdL ?? handLocal(rig, o.gait, -1, f)
  const hr = o.holdR ?? handLocal(rig, o.gait, 1, f)
  ctx.save()
  ctx.strokeStyle = pal.ink
  ctx.lineCap = 'round'
  const armW = o.form === 'nightmare' ? Math.max(2.6, o.r * 0.11) : Math.max(3.2, o.r * 0.145)
  ctx.lineWidth = armW
  ctx.beginPath()
  ctx.moveTo(rig.shL.x * f, rig.shL.y)
  ctx.lineTo(hl.x, hl.y)
  ctx.moveTo(rig.shR.x * f, rig.shR.y)
  ctx.lineTo(hr.x, hr.y)
  ctx.stroke()
  mitten(ctx, hl.x, hl.y, pal, o.r * 0.12)
  mitten(ctx, hr.x, hr.y, pal, o.r * 0.12)

  const swing = Math.sin(o.gait * TAU)
  ctx.lineWidth = o.form === 'nightmare' ? Math.max(2.8, o.r * 0.12) : Math.max(3.4, o.r * 0.155)
  const lFoot = {
    x: rig.hipL.x * f + swing * o.r * 0.18,
    y: rig.hipL.y + rig.legLen + Math.abs(swing) * o.r * 0.04,
  }
  const rFoot = {
    x: rig.hipR.x * f - swing * o.r * 0.18,
    y: rig.hipR.y + rig.legLen + Math.abs(-swing) * o.r * 0.04,
  }
  ctx.beginPath()
  ctx.moveTo(rig.hipL.x * f, rig.hipL.y)
  ctx.lineTo(lFoot.x, lFoot.y)
  ctx.moveTo(rig.hipR.x * f, rig.hipR.y)
  ctx.lineTo(rFoot.x, rFoot.y)
  ctx.stroke()
  foot(ctx, lFoot.x, lFoot.y, pal, o.r * 0.1, f)
  foot(ctx, rFoot.x, rFoot.y, pal, o.r * 0.1, f)
  ctx.restore()

  if (o.form === 'nightmare') {
    const uid = o.uid ?? 1
    for (let i = 0; i < 3; i++) {
      const cycle = (o.t * 0.55 + n01(uid + i, 9) + i * 0.31) % 1.35
      if (cycle > 1) continue
      const x = (n01(i, uid) - 0.5) * o.r * 1.2
      const y = o.r * 0.7 + cycle * o.r * 1.4
      ctx.globalAlpha = 0.75 * (1 - cycle)
      ctx.fillStyle = mudOf(o.pal)
      ctx.beginPath()
      ctx.ellipse(x, y, o.r * 0.07, o.r * 0.1, 0, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

export function idleLive(form: Form): Pick<LiveOpts, 'mouth' | 'blink' | 'gait' | 'scream' | 'facing' | 'lookX' | 'lookY' | 't'> {
  return {
    mouth: form === 'nightmare' ? 0.4 : 0.08,
    blink: -1,
    gait: 0,
    scream: -1,
    facing: 1,
    lookX: 0.25,
    lookY: 0.1,
    t: 0,
  }
}

function scaledSprite(
  cache: BodyCache,
  key: string,
  art: number,
  q: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const px = Math.max(1, Math.round(art * q))
  return cache.canvas(`${key}:q${q}`, px, px, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2)
    ctx.scale(q, q)
    paint(ctx)
  })
}

export function creatureSprite(
  cache: BodyCache,
  species: Species,
  pal: Palette,
  form: Form,
  artR: number,
  q: number,
): HTMLCanvasElement {
  const art = Math.max(64, Math.round(artR * 4.4))
  const key = `veg:${species}:${paletteKey(pal)}:${form}:${artR}`
  return scaledSprite(cache, key, art, q, (ctx) => {
    paintCreatureBody(ctx, species, pal, artR, form)
  })
}

export function paintIdleCreature(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  r: number,
  form: Form,
): void {
  paintCreatureBody(ctx, species, pal, r, form)
  paintLiveFeatures(ctx, { species, pal, r, form, uid: 1, ...idleLive(form) })
}
