import { TAU, clamp, ease, lerp } from '../core/math.ts'
import type { AnimState, Form, ModelDir, Palette, Species } from '../core/types.ts'
import { getPaintStyle, lookKey } from './look.ts'
import {
  langBloom,
  langCracks,
  langFillPath,
  langInk,
  langMudSplash,
  langSmoke,
  langWash,
  langWorms,
  nightmareBodyPal,
} from './paintLang.ts'
import {
  darken,
  mixColor,
  n01,
  rgba,
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

type OutlineKind =
  | 'heavy'
  | 'broken'
  | 'crease'
  | 'soft'
  | 'double'
  | 'fine'
  | 'gloss'
  | 'layers'
  | 'rim'
  | 'none'
  | 'clove'
  | 'scallop'
  | 'hairy'
  | 'stripe'
  | 'husk'
  | 'floret'

type EyeKind =
  | 'lopsided'
  | 'almond'
  | 'slit'
  | 'round'
  | 'carved'
  | 'beady'
  | 'hooded'
  | 'crescent'
  | 'saucer'
  | 'dot'
  | 'close'
  | 'peek'
  | 'stare'
  | 'side'
  | 'kernel'
  | 'stemEye'

type MouthKind =
  | 'dash'
  | 'smirk'
  | 'jagged'
  | 'o'
  | 'carved'
  | 'tiny'
  | 'smug'
  | 'wail'
  | 'smile'
  | 'nub'
  | 'grimace'
  | 'hidden'
  | 'line'
  | 'sideSmile'
  | 'grin'
  | 'pout'

const OUTLINE_KIND: Record<Species, OutlineKind> = {
  potato: 'heavy',
  carrot: 'broken',
  chili: 'crease',
  turnip: 'soft',
  pumpkin: 'double',
  radish: 'fine',
  eggplant: 'gloss',
  onion: 'layers',
  pea: 'rim',
  sprout: 'none',
  garlic: 'clove',
  cabbage: 'scallop',
  beet: 'hairy',
  marrow: 'stripe',
  corn: 'husk',
  broccoli: 'floret',
}

const EYE_KIND: Record<Species, EyeKind> = {
  potato: 'lopsided',
  carrot: 'almond',
  chili: 'slit',
  turnip: 'round',
  pumpkin: 'carved',
  radish: 'beady',
  eggplant: 'hooded',
  onion: 'crescent',
  pea: 'saucer',
  sprout: 'dot',
  garlic: 'close',
  cabbage: 'peek',
  beet: 'stare',
  marrow: 'side',
  corn: 'kernel',
  broccoli: 'stemEye',
}

function lookEyeKind(species: Species, form: Form, model: ModelDir): EyeKind {
  if (form === 'nightmare') {
    if (species === 'pea') return 'saucer'
    if (species === 'carrot') return 'almond'
    if (species === 'sprout') return 'round'
    if (species === 'potato') return 'round'
  }
  if (species === 'potato') {
    if (model === 'b') return 'round'
    if (model === 'c') return 'saucer'
  }
  if (species === 'carrot') {
    if (model === 'b') return 'almond'
    if (model === 'c') return 'round'
  }
  return EYE_KIND[species]
}

function lookMouthKind(species: Species, form: Form, model: ModelDir): MouthKind {
  if (form === 'nightmare') {
    if (species === 'pea') return 'o'
    if (species === 'carrot') return 'wail'
    if (species === 'sprout') return 'o'
    if (species === 'potato') return 'o'
  }
  if (species === 'potato') {
    if (model === 'b') return 'dash'
    if (model === 'c') return 'smile'
  }
  if (species === 'carrot') {
    if (model === 'b') return 'smirk'
    if (model === 'c') return 'pout'
  }
  return MOUTH_KIND[species]
}

const MOUTH_KIND: Record<Species, MouthKind> = {
  potato: 'dash',
  carrot: 'smirk',
  chili: 'jagged',
  turnip: 'o',
  pumpkin: 'carved',
  radish: 'tiny',
  eggplant: 'smug',
  onion: 'wail',
  pea: 'smile',
  sprout: 'nub',
  garlic: 'grimace',
  cabbage: 'hidden',
  beet: 'line',
  marrow: 'sideSmile',
  corn: 'grin',
  broccoli: 'pout',
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

export function speciesRig(species: Species, r: number, model: ModelDir = 'a'): Rig {
  switch (species) {
    case 'potato':
      if (model === 'b') {
        return rig(r, -r * 0.08, r * 0.22, {
          eyeL: { x: -r * 0.16, y: -r * 0.08 },
          eyeR: { x: r * 0.16, y: -r * 0.08 },
          eyeS: r * 0.12,
          mouthW: r * 0.22,
          shL: { x: -r * 0.88, y: 0 },
          shR: { x: r * 0.88, y: 0 },
          armLen: r * 0.55,
          legLen: r * 0.28,
        })
      }
      if (model === 'c') {
        return rig(r, -r * 0.1, r * 0.32, {
          eyeL: { x: -r * 0.26, y: -r * 0.1 },
          eyeR: { x: r * 0.28, y: -r * 0.1 },
          eyeS: r * 0.24,
          mouthW: r * 0.36,
        })
      }
      return rig(r, -r * 0.12, r * 0.28, {
        eyeL: { x: -r * 0.3, y: -r * 0.1 },
        eyeR: { x: r * 0.32, y: -r * 0.16 },
        eyeS: r * 0.2,
        mouthW: r * 0.34,
      })
    case 'carrot':
      if (model === 'b' || model === 'c') {
        return rig(r, r * 0.02, r * 0.38, {
          shL: { x: -r * 0.48, y: -r * 0.02 },
          shR: { x: r * 0.48, y: -r * 0.02 },
          hipL: { x: -r * 0.14, y: r * 0.92 },
          hipR: { x: r * 0.14, y: r * 0.92 },
          armLen: r * 0.55,
          legLen: r * 0.28,
          eyeS: model === 'c' ? r * 0.2 : r * 0.14,
          mouthW: r * 0.22,
          eyeL: { x: -r * 0.22, y: r * 0.02 },
          eyeR: { x: r * 0.22, y: r * 0.02 },
        })
      }
      return rig(r, r * 0.05, r * 0.42, {
        shL: { x: -r * 0.55, y: -r * 0.05 },
        shR: { x: r * 0.55, y: -r * 0.05 },
        hipL: { x: -r * 0.16, y: r * 0.92 },
        hipR: { x: r * 0.16, y: r * 0.92 },
        armLen: r * 0.62,
        legLen: r * 0.32,
        eyeS: r * 0.16,
        mouthW: r * 0.24,
      })
    case 'chili':
      return rig(r, -r * 0.08, r * 0.22, {
        shL: { x: -r * 0.55, y: 0 },
        shR: { x: r * 0.7, y: r * 0.1 },
        hipL: { x: -r * 0.15, y: r * 0.78 },
        hipR: { x: r * 0.35, y: r * 0.72 },
        eyeS: r * 0.2,
        mouthW: r * 0.36,
      })
    case 'turnip':
      return rig(r, -r * 0.2, r * 0.18, {
        eyeS: r * 0.24,
        mouthW: r * 0.2,
        shL: { x: -r * 0.78, y: 0 },
        shR: { x: r * 0.78, y: 0 },
      })
    case 'pea':
      return rig(r * 0.85, -r * 0.12, r * 0.22, {
        shL: { x: -r * 0.7, y: 0 },
        shR: { x: r * 0.7, y: 0 },
        hipL: { x: -r * 0.22, y: r * 0.62 },
        hipR: { x: r * 0.22, y: r * 0.62 },
        armLen: r * 0.55,
        legLen: r * 0.34,
        eyeS: r * 0.28,
        mouthW: r * 0.22,
      })
    case 'sprout':
      return rig(r, r * 0.28, r * 0.52, {
        shL: { x: -r * 0.42, y: r * 0.2 },
        shR: { x: r * 0.42, y: r * 0.2 },
        hipL: { x: -r * 0.16, y: r * 0.85 },
        hipR: { x: r * 0.16, y: r * 0.85 },
        eyeS: r * 0.12,
        mouthW: r * 0.16,
        armLen: r * 0.5,
        legLen: r * 0.28,
      })
    case 'pumpkin':
      return rig(r, -r * 0.08, r * 0.28, {
        shL: { x: -r * 1.05, y: r * 0.05 },
        shR: { x: r * 1.05, y: r * 0.05 },
        hipL: { x: -r * 0.4, y: r * 0.7 },
        hipR: { x: r * 0.4, y: r * 0.7 },
        mouthW: r * 0.58,
        armLen: r * 0.65,
        eyeS: r * 0.26,
      })
    case 'eggplant':
      return rig(r, r * 0.02, r * 0.4, {
        shL: { x: -r * 0.7, y: r * 0.15 },
        shR: { x: r * 0.7, y: r * 0.15 },
        hipL: { x: -r * 0.28, y: r * 0.85 },
        hipR: { x: r * 0.28, y: r * 0.85 },
        eyeS: r * 0.2,
        mouthW: r * 0.44,
      })
    case 'onion':
      return rig(r, -r * 0.16, r * 0.3, {
        eyeS: r * 0.18,
        mouthW: r * 0.44,
        shL: { x: -r * 0.7, y: r * 0.08 },
        shR: { x: r * 0.7, y: r * 0.08 },
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
        eyeS: r * 0.16,
      })
    case 'broccoli':
      return rig(r, r * 0.38, r * 0.58, {
        shL: { x: -r * 0.42, y: r * 0.35 },
        shR: { x: r * 0.42, y: r * 0.35 },
        hipL: { x: -r * 0.18, y: r * 0.92 },
        hipR: { x: r * 0.18, y: r * 0.92 },
        eyeS: r * 0.14,
        mouthW: r * 0.2,
      })
    case 'beet':
      return rig(r, -r * 0.12, r * 0.22, {
        hipL: { x: -r * 0.22, y: r * 0.7 },
        hipR: { x: r * 0.22, y: r * 0.7 },
        eyeS: r * 0.23,
        mouthW: r * 0.3,
      })
    case 'radish':
      return rig(r, -r * 0.12, r * 0.16, {
        shL: { x: -r * 0.62, y: 0 },
        shR: { x: r * 0.62, y: 0 },
        hipL: { x: -r * 0.18, y: r * 0.62 },
        hipR: { x: r * 0.18, y: r * 0.62 },
        eyeL: { x: -r * 0.16, y: -r * 0.12 },
        eyeR: { x: r * 0.16, y: -r * 0.12 },
        eyeS: r * 0.12,
        mouthW: r * 0.18,
        armLen: r * 0.52,
        legLen: r * 0.3,
      })
    case 'garlic':
      return rig(r, -r * 0.06, r * 0.3, {
        eyeL: { x: -r * 0.14, y: -r * 0.06 },
        eyeR: { x: r * 0.16, y: -r * 0.06 },
        eyeS: r * 0.12,
        mouthW: r * 0.22,
      })
    case 'cabbage':
      return rig(r, -r * 0.02, r * 0.2, {
        shL: { x: -r * 0.9, y: 0 },
        shR: { x: r * 0.9, y: 0 },
        eyeL: { x: -r * 0.2, y: -r * 0.02 },
        eyeR: { x: r * 0.22, y: -r * 0.02 },
        eyeS: r * 0.14,
        mouthW: r * 0.18,
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

function outlineInk(pal: Palette, species: Species): string {
  switch (species) {
    case 'pea':
    case 'sprout':
    case 'cabbage':
    case 'broccoli':
      return mixColor(pal.ink, pal.shade, 0.48)
    case 'onion':
    case 'garlic':
    case 'turnip':
      return mixColor(pal.ink, pal.body, 0.22)
    case 'eggplant':
      return mixColor(pal.ink, pal.body, 0.12)
    case 'radish':
      return mixColor(pal.ink, pal.shade, 0.2)
    default:
      return pal.ink
  }
}

function accentLive(pal: Palette, nightmare: boolean): string {
  return nightmare ? mixColor(pal.accent, mudOf(pal), 0.42) : pal.accent
}

function applyOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pal: Palette,
  seed: number,
  nightmare: boolean,
  species: Species,
  extra?: { n?: number; wobble?: number; rotation?: number },
): void {
  const kind = OUTLINE_KIND[species]
  const ink = outlineInk(pal, species)
  const r = Math.min(rx, ry)
  if (kind === 'none' || kind === 'floret') {
    if (kind === 'floret') {
      langInk(ctx, cx, cy, rx, ry, ink, {
        seed,
        width: Math.max(1.1, r * 0.06),
        alpha: 0.55,
        n: 8,
        wobble: 0.1,
        rotation: extra?.rotation,
        close: 0.72,
      })
    }
    return
  }
  if (kind === 'rim') {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.strokeStyle = pal.shade
    ctx.globalAlpha = 0.55
    ctx.lineWidth = Math.max(1.6, r * 0.1)
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx * 1.02, ry * 1.02, extra?.rotation ?? 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (kind === 'gloss') {
    ctx.save()
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.55
    ctx.lineWidth = Math.max(1.2, r * 0.055)
    ctx.beginPath()
    ctx.ellipse(cx + rx * 0.12, cy + ry * 0.08, rx * 0.96, ry * 0.96, 0.12, 0.15, Math.PI * 0.95)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (kind === 'soft') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.2, r * 0.055),
      alpha: 0.42,
      n: extra?.n ?? 10,
      wobble: extra?.wobble ?? 0.14,
      rotation: extra?.rotation,
      close: 0.7,
    })
    return
  }
  if (kind === 'broken') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: inkW(r, nightmare) * 0.7,
      alpha: nightmare ? 0.86 : 0.72,
      n: extra?.n ?? 9,
      wobble: extra?.wobble ?? 0.16,
      rotation: extra?.rotation,
      close: 0.58,
    })
    langInk(ctx, cx, cy, rx * 0.98, ry * 0.98, ink, {
      seed: seed + 5,
      width: Math.max(1.1, r * 0.05),
      alpha: 0.4,
      n: 8,
      wobble: 0.2,
      rotation: (extra?.rotation ?? 0) + 0.5,
      close: 0.4,
    })
    return
  }
  if (kind === 'double') {
    langInk(ctx, cx, cy, rx * 1.04, ry * 1.04, ink, {
      seed,
      width: inkW(r, nightmare),
      alpha: nightmare ? 0.92 : 0.86,
      n: extra?.n ?? 10,
      wobble: 0.08,
      rotation: extra?.rotation,
    })
    langInk(ctx, cx, cy, rx * 0.9, ry * 0.88, mixColor(ink, pal.body, 0.35), {
      seed: seed + 2,
      width: Math.max(1.1, r * 0.045),
      alpha: 0.45,
      n: 9,
      wobble: 0.06,
      close: 0.85,
    })
    return
  }
  if (kind === 'layers') {
    for (let i = 0; i < 3; i++) {
      const s = 1 - i * 0.16
      langInk(ctx, cx, cy + ry * 0.02 * i, rx * s, ry * s, ink, {
        seed: seed + i,
        width: Math.max(1.05, r * (0.045 - i * 0.008)),
        alpha: 0.38 - i * 0.06,
        n: 9,
        wobble: 0.08,
        close: 0.52 + i * 0.08,
        rotation: extra?.rotation,
      })
    }
    return
  }
  if (kind === 'clove') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.3, r * 0.07),
      alpha: 0.55,
      n: 13,
      wobble: 0.22,
      close: 0.78,
    })
    return
  }
  if (kind === 'scallop') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.6, r * 0.08),
      alpha: nightmare ? 0.82 : 0.7,
      n: 16,
      wobble: 0.24,
      rotation: extra?.rotation,
      close: 0.92,
    })
    return
  }
  if (kind === 'hairy') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: inkW(r, nightmare) * 0.9,
      alpha: nightmare ? 0.9 : 0.82,
      n: 11,
      wobble: 0.12,
    })
    ctx.save()
    ctx.strokeStyle = ink
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.55
    for (let i = 0; i < 7; i++) {
      const a = 0.45 + i * 0.28
      const x0 = cx + Math.cos(a) * rx * 0.92
      const y0 = cy + Math.sin(a) * ry * 0.92
      ctx.lineWidth = 1 + (i % 2)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 + Math.cos(a) * r * 0.16, y0 + Math.sin(a) * r * 0.28)
      ctx.stroke()
    }
    ctx.restore()
    return
  }
  if (kind === 'stripe') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.8, r * 0.08),
      alpha: 0.8,
      n: extra?.n ?? 11,
      wobble: 0.1,
      rotation: extra?.rotation,
      close: 0.88,
    })
    return
  }
  if (kind === 'husk') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.5, r * 0.07),
      alpha: 0.78,
      n: 10,
      wobble: 0.18,
      close: 0.8,
    })
    return
  }
  if (kind === 'fine' || kind === 'crease') {
    langInk(ctx, cx, cy, rx, ry, ink, {
      seed,
      width: Math.max(1.15, r * (kind === 'fine' ? 0.055 : 0.07)),
      alpha: kind === 'fine' ? 0.7 : 0.62,
      n: extra?.n ?? 10,
      wobble: extra?.wobble ?? 0.1,
      rotation: extra?.rotation,
      close: kind === 'fine' ? 0.88 : 0.74,
    })
    return
  }
  langInk(ctx, cx, cy, rx, ry, ink, {
    seed,
    width: inkW(r, nightmare) * (nightmare ? 1 : 1.08),
    alpha: nightmare ? 0.94 : 0.9,
    n: extra?.n ?? 12,
    wobble: extra?.wobble ?? 0.14,
    rotation: extra?.rotation,
    close: 0.94,
  })
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  pal: Palette,
  r: number,
  nightmare: boolean,
  species: Species,
): void {
  const kind = OUTLINE_KIND[species]
  const ink = outlineInk(pal, species)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = ink
  if (kind === 'broken') {
    ctx.setLineDash([r * 0.38, r * 0.09, r * 0.2, r * 0.07])
    ctx.lineWidth = inkW(r, nightmare) * 0.72
    ctx.globalAlpha = nightmare ? 0.88 : 0.78
    ctx.stroke(path)
    ctx.setLineDash([])
    ctx.globalAlpha = 0.32
    ctx.lineWidth = Math.max(1.1, r * 0.05)
    ctx.stroke(path)
  } else if (kind === 'crease') {
    ctx.lineWidth = Math.max(1.35, r * 0.065)
    ctx.globalAlpha = 0.72
    ctx.stroke(path)
  } else if (kind === 'soft') {
    ctx.lineWidth = Math.max(1.2, r * 0.05)
    ctx.globalAlpha = 0.4
    ctx.stroke(path)
  } else if (kind === 'fine') {
    ctx.lineWidth = Math.max(1.15, r * 0.055)
    ctx.globalAlpha = 0.78
    ctx.stroke(path)
  } else if (kind === 'layers') {
    ctx.lineWidth = Math.max(1.3, r * 0.06)
    ctx.globalAlpha = 0.5
    ctx.stroke(path)
  } else {
    ctx.lineWidth = inkW(r, nightmare)
    ctx.globalAlpha = nightmare ? 0.92 : 0.86
    ctx.stroke(path)
  }
  ctx.restore()
}

function fillSilhouette(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  pal: Palette,
  r: number,
  seed: number,
): void {
  langFillPath(ctx, path, pal, r, seed)
}

function nightmarePal(pal: Palette): Palette {
  return nightmareBodyPal(pal)
}

/** Direction B enemy blight: splash at the feet, glow cracks, no full-body coat. */
function paintNightmareB(
  ctx: CanvasRenderingContext2D,
  r: number,
  pal: Palette,
  seed: number,
  species: Species,
): void {
  langMudSplash(ctx, r, mudOf(pal), seed)
  langCracks(ctx, r, glowOf(pal), seed, species)
  if (getPaintStyle() === 'a') langWorms(ctx, r, seed)
}

function carrotPath(r: number): Path2D {
  const path = new Path2D()
  path.moveTo(0, r * 1.12)
  path.quadraticCurveTo(-r * 0.48, r * 0.18, -r * 0.4, -r * 0.52)
  path.quadraticCurveTo(0, -r * 0.78, r * 0.4, -r * 0.52)
  path.quadraticCurveTo(r * 0.48, r * 0.18, 0, r * 1.12)
  path.closePath()
  return path
}

function chiliPath(r: number): Path2D {
  const p = new Path2D()
  p.moveTo(-r * 0.12, -r * 0.78)
  p.bezierCurveTo(-r * 0.62, -r * 0.22, -r * 0.58, r * 0.42, -r * 0.1, r * 0.98)
  p.quadraticCurveTo(r * 0.22, r * 1.16, r * 0.58, r * 0.7)
  p.bezierCurveTo(r * 0.98, r * 0.18, r * 0.52, -r * 0.28, r * 0.1, -r * 0.82)
  p.quadraticCurveTo(-r * 0.02, -r * 0.96, -r * 0.12, -r * 0.78)
  p.closePath()
  return p
}

function onionPath(r: number): Path2D {
  const p = new Path2D()
  p.moveTo(0, -r * 1.08)
  p.quadraticCurveTo(r * 0.22, -r * 0.62, r * 0.88, r * 0.12)
  p.quadraticCurveTo(r * 0.72, r * 1.08, 0, r * 1.08)
  p.quadraticCurveTo(-r * 0.72, r * 1.08, -r * 0.88, r * 0.12)
  p.quadraticCurveTo(-r * 0.22, -r * 0.62, 0, -r * 1.08)
  p.closePath()
  return p
}

function turnipPath(r: number): Path2D {
  const p = new Path2D()
  p.moveTo(-r * 0.18, -r * 0.88)
  p.quadraticCurveTo(-r * 1.12, -r * 0.05, -r * 1.0, r * 0.52)
  p.quadraticCurveTo(-r * 0.42, r * 1.08, 0, r * 1.02)
  p.quadraticCurveTo(r * 0.42, r * 1.08, r * 1.0, r * 0.52)
  p.quadraticCurveTo(r * 1.12, -r * 0.05, r * 0.18, -r * 0.88)
  p.quadraticCurveTo(0, -r * 1.0, -r * 0.18, -r * 0.88)
  p.closePath()
  return p
}

function radishPath(r: number): Path2D {
  const p = new Path2D()
  p.moveTo(-r * 0.62, -r * 0.15)
  p.quadraticCurveTo(-r * 0.7, -r * 0.72, 0, -r * 0.78)
  p.quadraticCurveTo(r * 0.7, -r * 0.72, r * 0.62, -r * 0.15)
  p.quadraticCurveTo(r * 0.55, r * 0.42, r * 0.2, r * 0.7)
  p.lineTo(0, r * 1.18)
  p.lineTo(-r * 0.2, r * 0.7)
  p.quadraticCurveTo(-r * 0.55, r * 0.42, -r * 0.62, -r * 0.15)
  p.closePath()
  return p
}

function paintPotato(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: number,
  seed: number,
  nm: boolean,
  model: ModelDir = 'a',
): void {
  if (model === 'b') {
    const rx = r * 0.76
    const ry = r * 1.16
    ctx.save()
    ctx.fillStyle = nm ? pal.body : mixColor(pal.body, '#f2e6c8', 0.42)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    if (!nm) {
      ctx.globalAlpha = 0.08
      ctx.fillStyle = pal.shade
      ctx.beginPath()
      ctx.ellipse(r * 0.08, r * 0.2, r * 0.28, r * 0.36, 0.12, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 0.92
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = Math.max(1.05, r * 0.038)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (model === 'c') {
    const rx = r * 0.98
    const ry = r * 1.02
    ctx.save()
    ctx.fillStyle = nm ? pal.body : mixColor(pal.body, '#fff4dc', 0.22)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.16
    ctx.fillStyle = mixColor(pal.body, '#fff8e8', 0.55)
    ctx.beginPath()
    ctx.ellipse(-r * 0.22, -r * 0.28, r * 0.34, r * 0.22, -0.4, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.94
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = Math.max(1.35, r * 0.05)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
    return
  }
  langWash(ctx, 0, 0.02 * r, r * 1.08, r * 0.86, pal.body, { seed, shade: pal.shade, n: 11, wobble: 0.22 })
  langWash(ctx, -r * 0.52, r * 0.18, r * 0.48, r * 0.52, pal.body, { seed: seed + 2, shade: pal.shade, n: 8, wobble: 0.2, passes: 3 })
  langWash(ctx, r * 0.5, -r * 0.12, r * 0.42, r * 0.48, pal.body, { seed: seed + 4, shade: pal.shade, n: 8, wobble: 0.2, passes: 3 })
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
  applyOutline(ctx, 0, 0, r * 1.12, r * 0.96, pal, seed, nm, 'potato', { n: 13, wobble: 0.16 })
}

function paintCarrot(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: number,
  seed: number,
  nm: boolean,
  model: ModelDir = 'a',
): void {
  const path = carrotPath(model === 'b' ? r * 0.92 : r)
  fillSilhouette(ctx, path, pal, r, seed)
  ctx.save()
  ctx.clip(path)
  ctx.strokeStyle = rgba(pal.ink, model === 'c' ? 0.1 : 0.18)
  ctx.lineWidth = model === 'b' ? 1.6 : 1.2
  for (const x of [-0.18, 0.12]) {
    ctx.beginPath()
    ctx.moveTo(r * x, -r * 0.4)
    ctx.quadraticCurveTo(r * x * 0.4, r * 0.2, r * x * 0.5, r * 0.85)
    ctx.stroke()
  }
  ctx.restore()
  strokePath(ctx, path, pal, r, nm, 'carrot')
}

function paintChili(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const path = chiliPath(r)
  fillSilhouette(ctx, path, pal, r, seed)
  ctx.save()
  ctx.strokeStyle = darken(pal.shade, 0.12)
  ctx.globalAlpha = 0.4
  ctx.lineWidth = r * 0.09
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.04, -r * 0.48)
  ctx.quadraticCurveTo(-r * 0.18, r * 0.12, r * 0.1, r * 0.72)
  ctx.stroke()
  ctx.restore()
  strokePath(ctx, path, pal, r, nm, 'chili')
}

function paintTurnip(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const path = turnipPath(r)
  fillSilhouette(ctx, path, pal, r, seed)
  ctx.save()
  ctx.clip(path)
  langWash(ctx, 0, r * 0.48, r * 0.95, r * 0.52, pal.shade, { seed: seed + 3, n: 8, wobble: 0.16, passes: 3 })
  ctx.restore()
  strokePath(ctx, path, pal, r, nm, 'turnip')
}

function paintPumpkin(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const lobes: readonly [number, number][] = [
    [-0.72, 0.52],
    [-0.38, 0.68],
    [0, 0.78],
    [0.38, 0.68],
    [0.72, 0.52],
  ]
  for (let i = 0; i < lobes.length; i++) {
    const lobe = lobes[i]
    if (!lobe) continue
    langWash(ctx, r * lobe[0], r * 0.08, r * lobe[1], r * 0.92, pal.body, {
      seed: seed + i,
      shade: pal.shade,
      n: 7,
      wobble: 0.08,
      passes: 3,
    })
  }
  ctx.strokeStyle = rgba(pal.ink, 0.32)
  ctx.lineWidth = 1.5
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
    ctx.beginPath()
    ctx.moveTo(r * x, -r * 0.5)
    ctx.quadraticCurveTo(r * x * 0.65, r * 0.12, r * x * 0.82, r * 0.86)
    ctx.stroke()
  }
  applyOutline(ctx, 0, r * 0.08, r * 1.4, r * 0.98, pal, seed, nm, 'pumpkin', { n: 10 })
}

function paintRadish(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const path = radishPath(r)
  fillSilhouette(ctx, path, pal, r, seed)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-r * 0.22, r * 0.42)
  ctx.lineTo(0, r * 1.18)
  ctx.lineTo(r * 0.22, r * 0.42)
  ctx.closePath()
  ctx.clip()
  langWash(ctx, 0, r * 0.72, r * 0.3, r * 0.42, '#f2ead8', { seed: seed + 3, shade: '#d8c8b0', n: 6, wobble: 0.16, passes: 2 })
  ctx.restore()
  strokePath(ctx, path, pal, r, nm, 'radish')
}

function paintEggplant(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, r * 0.22, r * 0.78, r * 1.12, pal.body, { seed, shade: pal.shade, n: 9, wobble: 0.1 })
  langWash(ctx, 0, -r * 0.35, r * 0.52, r * 0.55, pal.body, { seed: seed + 2, shade: pal.shade, n: 7, wobble: 0.1, passes: 3 })
  ctx.globalAlpha = 0.5
  ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.42)
  ctx.fill(wobbleBlob(-r * 0.24, -r * 0.12, r * 0.2, r * 0.42, seed + 4, { n: 6, wobble: 0.18 }))
  ctx.globalAlpha = 1
  applyOutline(ctx, 0, r * 0.14, r * 0.82, r * 1.2, pal, seed, nm, 'eggplant')
}

function paintOnion(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const path = onionPath(r)
  fillSilhouette(ctx, path, pal, r, seed)
  ctx.save()
  ctx.clip(path)
  ctx.strokeStyle = rgba(pal.ink, 0.22)
  ctx.lineWidth = 1.5
  for (const s of [0.5, 0.7, 0.9]) {
    ctx.beginPath()
    ctx.ellipse(0, r * 0.12, r * s, r * s * 0.92, 0, 0.2, Math.PI - 0.2)
    ctx.stroke()
  }
  ctx.restore()
  strokePath(ctx, path, pal, r, nm, 'onion')
}

function paintPea(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, 0, r * 0.78, r * 0.78, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.1 })
  ctx.globalAlpha = 0.5
  ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.45)
  ctx.beginPath()
  ctx.ellipse(-r * 0.18, -r * 0.22, r * 0.2, r * 0.15, -0.4, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  applyOutline(ctx, 0, 0, r * 0.82, r * 0.82, pal, seed, nm, 'pea', { n: 9 })
}

function paintSprout(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, r * 0.48, r * 0.34, r * 0.42, mixColor(pal.body, '#e8f0c8', 0.3), { seed, shade: pal.shade, n: 7, wobble: 0.16 })
  langWash(ctx, 0, r * 0.62, r * 0.4, r * 0.32, pal.body, { seed: seed + 6, shade: pal.shade, n: 8, wobble: 0.16 })
  applyOutline(ctx, 0, r * 0.52, r * 0.42, r * 0.48, pal, seed, nm, 'sprout')
  langInk(ctx, 0, r * 0.52, r * 0.42, r * 0.48, outlineInk(pal, 'sprout'), {
    seed,
    width: Math.max(1.05, r * 0.05),
    alpha: 0.55,
    n: 8,
    close: 0.8,
  })
}

function paintGarlic(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  const cloves: readonly [number, number, number, number][] = [
    [0, 0.08, 0.62, 0.78],
    [-0.48, 0.14, 0.4, 0.52],
    [0.5, 0.12, 0.38, 0.5],
    [-0.22, -0.28, 0.36, 0.42],
    [0.22, -0.26, 0.34, 0.4],
  ]
  for (let i = 0; i < cloves.length; i++) {
    const c = cloves[i]
    if (!c) continue
    langWash(ctx, r * c[0], r * c[1], r * c[2], r * c[3], pal.body, {
      seed: seed + i,
      shade: pal.shade,
      n: 7,
      wobble: 0.14,
      passes: 3,
    })
  }
  ctx.strokeStyle = rgba(pal.accent, 0.55)
  ctx.lineWidth = 1.3
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.45)
    ctx.quadraticCurveTo(Math.sin(a) * r * 0.65, r * 0.12, Math.sin(a) * r * 0.5, r * 0.82)
    ctx.stroke()
  }
  applyOutline(ctx, 0, r * 0.08, r * 1.02, r * 0.95, pal, seed, nm, 'garlic')
}

function paintCabbage(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 0.85 + 0.2
    langWash(
      ctx,
      Math.cos(a) * r * 0.12,
      Math.sin(a) * r * 0.08,
      r * (0.92 - i * 0.1),
      r * (0.78 - i * 0.08),
      i % 2 ? pal.accent : pal.body,
      { seed: seed + i, shade: pal.shade, n: 9, wobble: 0.22, rotation: a * 0.3 },
    )
  }
  applyOutline(ctx, 0, 0, r * 1.08, r * 0.92, pal, seed, nm, 'cabbage')
}

function paintBeet(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, 0, r * 0.95, r * 0.88, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12 })
  langWash(ctx, 0, r * 0.72, r * 0.28, r * 0.32, pal.shade, { seed: seed + 2, n: 6, wobble: 0.18, passes: 2 })
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
  ctx.quadraticCurveTo(r * 0.12, r * 1.1, 0, r * 1.38)
  ctx.stroke()
  applyOutline(ctx, 0, 0.04 * r, r * 0.98, r * 0.94, pal, seed, nm, 'beet')
}

function paintMarrow(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, r * 0.1, 0, r * 1.55, r * 0.62, pal.body, { seed, shade: pal.shade, n: 8, wobble: 0.12, rotation: -0.12 })
  ctx.strokeStyle = rgba(pal.accent, 0.7)
  ctx.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    const x = -r * 0.9 + i * r * 0.55
    ctx.beginPath()
    ctx.moveTo(x, -r * 0.35)
    ctx.quadraticCurveTo(x + r * 0.1, 0, x, r * 0.4)
    ctx.stroke()
  }
  applyOutline(ctx, r * 0.1, 0, r * 1.58, r * 0.65, pal, seed, nm, 'marrow', { n: 11, rotation: -0.12 })
}

function paintCorn(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, 0, r * 0.48, r * 1.08, pal.body, { seed: seed + 4, shade: pal.shade, n: 7, wobble: 0.07 })
  ctx.fillStyle = rgba(pal.shade, 0.38)
  for (let y = -4; y <= 4; y++) {
    for (let x = -1; x <= 1; x++) {
      ctx.beginPath()
      ctx.arc(x * r * 0.16, y * r * 0.16, r * 0.055, 0, TAU)
      ctx.fill()
    }
  }
  applyOutline(ctx, 0, 0, r * 0.52, r * 1.1, pal, seed, nm, 'corn', { n: 9 })
}

function paintBroccoli(ctx: CanvasRenderingContext2D, pal: Palette, r: number, seed: number, nm: boolean): void {
  langWash(ctx, 0, r * 0.5, r * 0.26, r * 0.52, '#c4a06a', { seed, shade: '#8a6a38', n: 6, wobble: 0.12, passes: 3 })
  applyOutline(ctx, 0, r * 0.5, r * 0.28, r * 0.54, pal, seed, nm, 'broccoli')
}

function paintSpeciesSilhouette(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  r: number,
  seed: number,
  nm: boolean,
  model: ModelDir = 'a',
): void {
  switch (species) {
    case 'potato':
      paintPotato(ctx, pal, r, seed, nm, model)
      break
    case 'carrot':
      paintCarrot(ctx, pal, r, seed, nm, model)
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
      paintPotato(ctx, pal, r, seed, nm, model)
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
    case 'pumpkin':
      ctx.strokeStyle = rgba(pal.ink, 0.5)
      ctx.lineWidth = 1.8
      for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
        ctx.beginPath()
        ctx.moveTo(r * x, -r * 0.55)
        ctx.quadraticCurveTo(r * x * 0.7, r * 0.1, r * x * 0.85, r * 0.85)
        ctx.stroke()
      }
      break
    case 'eggplant':
      ctx.globalAlpha = 0.45
      ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.35)
      ctx.fill(wobbleBlob(-r * 0.22, -r * 0.15, r * 0.22, r * 0.4, seed + 4, { n: 6, wobble: 0.2 }))
      ctx.globalAlpha = 1
      break
    case 'onion':
      ctx.strokeStyle = rgba(pal.ink, 0.35)
      ctx.lineWidth = 1.3
      for (const s of [0.55, 0.75, 0.95]) {
        ctx.beginPath()
        ctx.ellipse(0, r * 0.08, r * s, r * s * 0.92, 0, 0.15, Math.PI - 0.15)
        ctx.stroke()
      }
      break
    case 'pea':
      ctx.fillStyle = mixColor(pal.body, '#fff6e8', 0.4)
      ctx.beginPath()
      ctx.ellipse(-r * 0.2, -r * 0.22, r * 0.18, r * 0.14, -0.4, 0, TAU)
      ctx.fill()
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
    case 'beet':
      ctx.strokeStyle = rgba('#3d0f1f', 0.65)
      ctx.lineWidth = 1.3
      for (let i = 0; i < 4; i++) {
        const a = -0.6 + i * 0.4
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.3)
        ctx.quadraticCurveTo(Math.sin(a) * r * 0.5, r * 0.1, Math.sin(a) * r * 0.4, r * 0.55)
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
      ctx.fillStyle = rgba(pal.shade, 0.45)
      for (let y = -4; y <= 4; y++) {
        for (let x = -1; x <= 1; x++) {
          ctx.beginPath()
          ctx.arc(x * r * 0.16, y * r * 0.16, r * 0.055, 0, TAU)
          ctx.fill()
        }
      }
      break
    case 'radish':
      langWash(ctx, 0, r * 0.72, r * 0.22, r * 0.28, '#f2ead8', { seed: seed + 3, shade: '#d8c8b0', n: 6, wobble: 0.16, passes: 2 })
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
  model: ModelDir = 'a',
  stain = false,
): void {
  const nm = form === 'nightmare'
  const used = nm ? nightmarePal(pal) : pal
  const seed = seedOf(species + paletteKey(pal) + form + model + lookKey())
  // Language C stain columns are corruption — enemies only. Players stay clean.
  if (!nm && stain) langBloom(ctx, r, pal.body, seed)
  paintSpeciesSilhouette(ctx, species, used, r, seed, nm, nm ? 'b' : model)
  if (nm) {
    paintNightmareB(ctx, r, pal, seed, species)
    ctx.save()
    ctx.globalAlpha = 0.45
    paintSpeciesMarks(ctx, species, used, r, seed)
    ctx.restore()
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
  model?: ModelDir
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

function scleraOf(species: Species): string {
  switch (species) {
    case 'eggplant':
      return '#efe6dc'
    case 'pea':
      return '#eef6d0'
    case 'beet':
      return '#f3d4dc'
    case 'chili':
      return '#f6d2c4'
    case 'onion':
      return '#fff8ee'
    case 'corn':
      return '#fff4d0'
    default:
      return '#f4efe4'
  }
}

function teeter(t: number, gait: number, i: number, uid: number): number {
  return (
    Math.sin(t * 3.4 + i * 1.61 + uid * 0.07) * 0.2 +
    Math.sin(t * 5.1 + i * 0.9) * 0.07 +
    Math.sin(gait * TAU + i * 0.8) * 0.14
  )
}

function paintLeaf(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  pal: Palette,
  nightmare: boolean,
  vein = true,
): void {
  const col = accentLive(pal, nightmare)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.ellipse(0, -ry * 0.42, rx, ry, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = nightmare ? mixColor(pal.ink, mudOf(pal), 0.25) : pal.ink
  ctx.lineWidth = Math.max(0.8, rx * 0.12)
  ctx.globalAlpha = 0.7
  ctx.stroke()
  if (vein) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(rx * 0.12, -ry * 0.4, 0, -ry * 0.88)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function paintFrond(ctx: CanvasRenderingContext2D, pal: Palette, r: number, nightmare: boolean): void {
  paintLeaf(ctx, r * 0.16, r * 0.42, pal, nightmare)
  ctx.save()
  ctx.rotate(-0.55)
  paintLeaf(ctx, r * 0.1, r * 0.22, pal, nightmare, false)
  ctx.restore()
  ctx.save()
  ctx.rotate(0.55)
  paintLeaf(ctx, r * 0.1, r * 0.22, pal, nightmare, false)
  ctx.restore()
}

function paintTeeth(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, style: 'tri' | 'jag'): void {
  ctx.fillStyle = '#f2ead8'
  for (let i = 0; i < n; i++) {
    const tx = lerp(-w * 0.34, w * 0.34, n <= 1 ? 0.5 : i / (n - 1))
    ctx.beginPath()
    if (style === 'jag') {
      ctx.moveTo(tx - 2.4, -h * 0.2)
      ctx.lineTo(tx, h * 0.42)
      ctx.lineTo(tx + 2.4, -h * 0.2)
    } else {
      ctx.moveTo(tx - 2, -h * 0.15)
      ctx.lineTo(tx, h * 0.32)
      ctx.lineTo(tx + 2, -h * 0.15)
    }
    ctx.closePath()
    ctx.fill()
  }
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
  species: Species,
  model: ModelDir = 'a',
): void {
  const kind = lookMouthKind(species, form, model)
  const nm = form === 'nightmare'
  ctx.save()
  ctx.translate(x * facing, y)
  ctx.strokeStyle = pal.ink
  ctx.fillStyle = '#1a100c'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const showTeeth = nm || open > 0.82 || kind === 'carved' || kind === 'jagged'

  if (kind === 'carved') {
    const h = w * (0.1 + open * 0.5)
    ctx.beginPath()
    ctx.moveTo(-w * 0.55, 0)
    const z = 6
    for (let i = 1; i <= z; i++) {
      const u = i / z
      const zig = i % 2 === 0 ? 0 : h * 0.45
      ctx.lineTo(lerp(-w * 0.55, w * 0.55, u), zig)
    }
    if (open >= 0.22) {
      for (let i = z; i >= 0; i--) {
        const u = i / z
        const zig = i % 2 === 0 ? h : h * 0.55
        ctx.lineTo(lerp(-w * 0.55, w * 0.55, u), zig)
      }
      ctx.closePath()
      ctx.fill()
      ctx.lineWidth = 1.6
      ctx.stroke()
      if (showTeeth) paintTeeth(ctx, w, h, 5, 'jag')
    } else {
      ctx.lineWidth = 1.7
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (kind === 'wail') {
    const h = w * (0.08 + open * 0.42)
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(-w * 0.52, 0)
    ctx.quadraticCurveTo(-w * 0.28, h, -w * 0.08, h * 0.15)
    ctx.quadraticCurveTo(0, h * 0.55, w * 0.08, h * 0.15)
    ctx.quadraticCurveTo(w * 0.28, h, w * 0.52, 0)
    if (open >= 0.25) {
      ctx.quadraticCurveTo(w * 0.2, h * 1.15, 0, h * 1.05)
      ctx.quadraticCurveTo(-w * 0.2, h * 1.15, -w * 0.52, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      if (showTeeth) paintTeeth(ctx, w * 0.8, h, 4, 'tri')
    } else {
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (kind === 'jagged') {
    const h = w * (0.06 + open * 0.4)
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    const n = 7
    for (let i = 1; i <= n; i++) {
      ctx.lineTo(lerp(-w * 0.5, w * 0.5, i / n), i % 2 ? h : 0)
    }
    if (open >= 0.28) {
      ctx.lineTo(w * 0.5, h * 1.1)
      ctx.lineTo(-w * 0.5, h * 1.1)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      if (showTeeth) paintTeeth(ctx, w, h, 5, 'jag')
    } else {
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (kind === 'dash' || kind === 'line' || kind === 'hidden') {
    const ww = kind === 'hidden' ? w * 0.45 : kind === 'line' ? w * 0.7 : w
    if (open < 0.2) {
      ctx.lineWidth = kind === 'line' ? 2.1 : 1.7
      ctx.beginPath()
      ctx.moveTo(-ww * 0.5, kind === 'dash' ? w * 0.04 : 0)
      ctx.lineTo(ww * 0.5, kind === 'dash' ? w * 0.02 : 0)
      ctx.stroke()
    } else {
      const h = w * (0.14 + open * 0.32) * (kind === 'hidden' ? 0.7 : 1)
      ctx.beginPath()
      ctx.ellipse(0, h * 0.12, ww * 0.42, h, 0, 0, TAU)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (nm && open > 0.7) paintTeeth(ctx, ww, h, 3, 'tri')
    }
    ctx.restore()
    return
  }

  if (kind === 'o' || kind === 'tiny' || kind === 'nub' || kind === 'pout') {
    const scale = kind === 'tiny' || kind === 'nub' ? 0.55 : kind === 'pout' ? 0.7 : 0.85
    const wide = nm && species === 'sprout'
    const peaO = nm && species === 'pea'
    const h = w * scale * (0.16 + open * 0.4) * (wide ? 0.82 : peaO ? 0.78 : 1)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (kind === 'pout' && open < 0.2) {
      ctx.moveTo(-w * 0.22, 0)
      ctx.quadraticCurveTo(0, -w * 0.16, w * 0.22, 0)
      ctx.stroke()
    } else if (open < 0.16 && kind === 'nub') {
      ctx.arc(0, 0, w * 0.08, 0, TAU)
      ctx.stroke()
    } else {
      const rw = wide ? w * 0.55 : w * 0.28 * scale + open * w * (peaO ? 0.06 : 0.12)
      ctx.ellipse(0, h * 0.1, rw, h, 0, 0, TAU)
      if (open >= 0.22) ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (kind === 'smirk' || kind === 'sideSmile' || kind === 'smug' || kind === 'smile' || kind === 'grin') {
    const bias = kind === 'smirk' || kind === 'sideSmile' ? 0.18 : 0
    const ww = kind === 'smug' || kind === 'grin' ? w * 1.1 : w
    if (open < 0.2) {
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(-ww * 0.5, kind === 'smug' ? -w * 0.04 : 0)
      ctx.quadraticCurveTo(bias * ww, w * (kind === 'smile' ? 0.28 : 0.18) + open * 4, ww * 0.5, kind === 'smirk' ? -w * 0.06 : 0)
      ctx.stroke()
    } else {
      const h = ww * (0.16 + open * 0.36)
      ctx.beginPath()
      ctx.ellipse(bias * ww * 0.2, h * 0.12, ww * 0.44, h, 0, 0, TAU)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (showTeeth) paintTeeth(ctx, ww, h, kind === 'grin' ? 5 : 3, 'tri')
    }
    ctx.restore()
    return
  }

  if (kind === 'grimace') {
    ctx.lineWidth = 1.6
    if (open < 0.22) {
      ctx.beginPath()
      ctx.moveTo(-w * 0.42, w * 0.04)
      ctx.quadraticCurveTo(-w * 0.15, -w * 0.1, 0, w * 0.02)
      ctx.quadraticCurveTo(w * 0.15, w * 0.12, w * 0.42, 0)
      ctx.stroke()
    } else {
      const h = w * (0.18 + open * 0.32)
      ctx.beginPath()
      ctx.ellipse(0, h * 0.1, w * 0.4, h, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
      paintTeeth(ctx, w, h, 4, 'jag')
    }
    ctx.restore()
    return
  }

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
    if (showTeeth) paintTeeth(ctx, w, h, 4, 'tri')
  }
  ctx.restore()
}

function paintOneEye(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  species: Species,
  kind: EyeKind,
  rs: number,
  lookX: number,
  lookY: number,
  open: number,
  form: Form,
  t: number,
  index: 0 | 1,
): void {
  const nm = form === 'nightmare'
  const glow = glowOf(pal)
  const flare = nm ? 1 + 0.12 * Math.sin(t * 5) : 1
  const lid = clamp(open, 0.06, 1.35)
  ctx.save()
  ctx.scale(1, lid)

  if (nm && kind === 'carved') {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.38 * flare
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.moveTo(-rs * 0.95, -rs * 0.7)
    ctx.lineTo(rs * 0.95, -rs * 0.7)
    ctx.lineTo(index === 0 ? rs * 0.2 : -rs * 0.2, rs * 0.95)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  if (kind === 'carved') {
    ctx.fillStyle = nm ? glow : pal.ink
    ctx.beginPath()
    ctx.moveTo(-rs * 0.72, -rs * 0.5)
    ctx.lineTo(rs * 0.72, -rs * 0.5)
    ctx.lineTo(index === 0 ? rs * 0.12 : -rs * 0.12, rs * 0.72)
    ctx.closePath()
    ctx.fill()
    if (nm) {
      ctx.fillStyle = '#fffde8'
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.arc(-rs * 0.12, -rs * 0.18, rs * 0.14, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    return
  }

  if (kind === 'slit') {
    ctx.rotate(index === 0 ? 0.42 : -0.42)
    if (nm) {
      ctx.fillStyle = scleraOf(species)
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.7, rs * 0.28, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = pal.eye
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.18, rs * 0.16, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = rgba(glow, 0.45)
      ctx.lineWidth = Math.max(0.6, rs * 0.08)
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.7, rs * 0.28, 0, 0, TAU)
      ctx.stroke()
    } else {
      ctx.fillStyle = pal.ink
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.78, rs * 0.2, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = pal.eye
      ctx.beginPath()
      ctx.ellipse(0, 0, rs * 0.22, rs * 0.14, 0, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    return
  }

  if (kind === 'crescent') {
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = rs * 0.28
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, rs * 0.12, rs * 0.58, Math.PI * 1.12, Math.PI * 1.88)
    ctx.stroke()
    if (nm) {
      ctx.strokeStyle = rgba(glow, 0.4)
      ctx.lineWidth = rs * 0.1
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (kind === 'dot' || kind === 'beady' || kind === 'close') {
    const s = kind === 'beady' ? rs * 0.55 : kind === 'close' ? rs * 0.45 : rs * 0.42
    if (nm) {
      ctx.fillStyle = scleraOf(species)
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.35, 0, TAU)
      ctx.fill()
      ctx.fillStyle = pal.eye
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.42, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = rgba(glow, 0.4)
      ctx.lineWidth = Math.max(0.55, rs * 0.07)
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.35, 0, TAU)
      ctx.stroke()
    } else {
      ctx.fillStyle = pal.ink
      ctx.beginPath()
      ctx.arc(0, 0, s, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.arc(-s * 0.28, -s * 0.28, s * 0.22, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    return
  }

  const rx =
    kind === 'saucer'
      ? rs * (nm ? 0.92 : 0.7)
      : kind === 'almond'
        ? rs * (nm ? 0.5 : 0.52)
        : kind === 'kernel'
          ? rs * 0.4
          : kind === 'lopsided'
            ? rs * (index === 0 ? 0.4 : 0.55)
            : rs * (nm && kind === 'round' ? 0.5 : 0.48)
  const ry =
    kind === 'saucer'
      ? rs * (nm ? 0.94 : 0.72)
      : kind === 'almond'
        ? rs * (nm ? 0.28 : 0.38)
        : kind === 'kernel'
          ? rs * 0.48
          : kind === 'hooded'
            ? rs * 0.5
            : rs * 0.55
  const rot = kind === 'almond' ? (index === 0 ? (nm ? 0.34 : 0.18) : nm ? -0.34 : -0.18) : kind === 'kernel' ? 0.1 : 0

  ctx.fillStyle = scleraOf(species)
  ctx.beginPath()
  if (kind === 'kernel') {
    ctx.roundRect(-rx, -ry, rx * 2, ry * 2, rs * 0.18)
  } else {
    ctx.ellipse(0, 0, rx, ry, rot, 0, TAU)
  }
  ctx.fill()

  const px = clamp(lookX, -1, 1) * rx * (nm ? 0.18 : 0.35)
  const py = clamp(lookY, -1, 1) * ry * (nm ? 0.14 : 0.28)
  const pr = nm ? (kind === 'saucer' ? 0.2 : 0.26) : kind === 'stare' ? 0.55 : 0.42
  ctx.fillStyle = pal.eye
  ctx.beginPath()
  ctx.ellipse(px, py, rx * pr, ry * pr, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(px - rx * 0.18, py - ry * 0.2, rs * (nm ? 0.055 : 0.08), 0, TAU)
  ctx.fill()
  if (nm) {
    ctx.strokeStyle = rgba(glow, 0.42)
    ctx.lineWidth = Math.max(0.65, rs * 0.07)
    ctx.beginPath()
    if (kind === 'kernel') ctx.roundRect(-rx, -ry, rx * 2, ry * 2, rs * 0.18)
    else ctx.ellipse(0, 0, rx, ry, rot, 0, TAU)
    ctx.stroke()
    ctx.restore()
    return
  }
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = Math.max(0.7, rs * (kind === 'saucer' ? 0.08 : 0.1))
  ctx.beginPath()
  if (kind === 'kernel') ctx.roundRect(-rx, -ry, rx * 2, ry * 2, rs * 0.18)
  else ctx.ellipse(0, 0, rx, ry, rot, 0, TAU)
  ctx.stroke()

  if (kind === 'hooded' || kind === 'lopsided' || kind === 'peek') {
    ctx.fillStyle = pal.body
    ctx.globalAlpha = kind === 'hooded' ? 0.92 : 0.7
    ctx.beginPath()
    ctx.ellipse(0, -ry * (kind === 'hooded' ? 0.72 : 0.9), rx * 1.05, ry * 0.55, 0, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-rx, -ry * 0.15)
    ctx.quadraticCurveTo(0, -ry * (kind === 'hooded' ? 0.2 : 0.45), rx, -ry * 0.15)
    ctx.stroke()
  }
  ctx.restore()
}

function paintEyePair(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  species: Species,
  rig: Rig,
  facing: 1 | -1,
  lookX: number,
  lookY: number,
  blink: number,
  scream: number,
  form: Form,
  t: number,
  model: ModelDir = 'a',
): void {
  const kind = lookEyeKind(species, form, model)
  const lid = blinkLid(blink)
  let open = lid
  if (scream >= 0 && scream < 0.4) open *= kind === 'hooded' ? 0.5 : 0.35
  else if (scream >= 0.4) open = Math.max(open, kind === 'crescent' ? 1 : 1.15)
  const eyes = [rig.eyeL, rig.eyeR]
  for (let i = 0; i < eyes.length; i++) {
    const eye = eyes[i]
    if (!eye) continue
    ctx.save()
    ctx.translate(eye.x * facing, eye.y)
    let rs = rig.eyeS * (scream >= 0.4 && kind !== 'dot' ? 1.12 : 1)
    if (form === 'nightmare' && species === 'pea') rs *= 1.32
    if (form === 'nightmare' && species === 'sprout') rs *= 1.12
    paintOneEye(ctx, pal, species, kind, rs, lookX * facing, lookY, open, form, t, i === 0 ? 0 : 1)
    ctx.restore()
  }
}

function paintBrows(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  rig: Rig,
  facing: 1 | -1,
  form: Form = 'normal',
): void {
  ctx.save()
  ctx.strokeStyle = pal.ink
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.8
  if (species === 'chili') {
    ctx.lineWidth = Math.max(1.6, rig.eyeS * 0.22)
    ctx.beginPath()
    ctx.moveTo(rig.eyeL.x * facing - rig.eyeS * 0.5, rig.eyeL.y - rig.eyeS * 0.85)
    ctx.lineTo(rig.eyeL.x * facing + rig.eyeS * 0.2, rig.eyeL.y - rig.eyeS * 0.35)
    ctx.moveTo(rig.eyeR.x * facing + rig.eyeS * 0.5, rig.eyeR.y - rig.eyeS * 0.85)
    ctx.lineTo(rig.eyeR.x * facing - rig.eyeS * 0.2, rig.eyeR.y - rig.eyeS * 0.35)
    ctx.stroke()
  } else if (species === 'carrot' && form === 'nightmare') {
    ctx.lineWidth = Math.max(1.7, rig.eyeS * 0.28)
    ctx.beginPath()
    ctx.moveTo(rig.eyeL.x * facing - rig.eyeS * 0.58, rig.eyeL.y - rig.eyeS * 0.92)
    ctx.lineTo(rig.eyeL.x * facing + rig.eyeS * 0.22, rig.eyeL.y - rig.eyeS * 0.22)
    ctx.moveTo(rig.eyeR.x * facing + rig.eyeS * 0.58, rig.eyeR.y - rig.eyeS * 0.92)
    ctx.lineTo(rig.eyeR.x * facing - rig.eyeS * 0.22, rig.eyeR.y - rig.eyeS * 0.22)
    ctx.stroke()
  } else if (species === 'potato') {
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(rig.eyeL.x * facing - rig.eyeS * 0.4, rig.eyeL.y - rig.eyeS * 0.7)
    ctx.quadraticCurveTo(rig.eyeL.x * facing, rig.eyeL.y - rig.eyeS * 0.95, rig.eyeL.x * facing + rig.eyeS * 0.35, rig.eyeL.y - rig.eyeS * 0.6)
    ctx.moveTo(rig.eyeR.x * facing - rig.eyeS * 0.25, rig.eyeR.y - rig.eyeS * 0.85)
    ctx.quadraticCurveTo(rig.eyeR.x * facing, rig.eyeR.y - rig.eyeS * 0.7, rig.eyeR.x * facing + rig.eyeS * 0.4, rig.eyeR.y - rig.eyeS * 0.55)
    ctx.stroke()
  } else if (species === 'beet') {
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(rig.eyeL.x * facing - rig.eyeS * 0.55, rig.eyeL.y - rig.eyeS * 0.55)
    ctx.quadraticCurveTo(rig.eyeL.x * facing, rig.eyeL.y - rig.eyeS * 1.05, rig.eyeL.x * facing + rig.eyeS * 0.45, rig.eyeL.y - rig.eyeS * 0.45)
    ctx.moveTo(rig.eyeR.x * facing - rig.eyeS * 0.45, rig.eyeR.y - rig.eyeS * 0.45)
    ctx.quadraticCurveTo(rig.eyeR.x * facing, rig.eyeR.y - rig.eyeS * 1.05, rig.eyeR.x * facing + rig.eyeS * 0.55, rig.eyeR.y - rig.eyeS * 0.55)
    ctx.stroke()
  }
  ctx.restore()
}

function paintSpeciesMotion(ctx: CanvasRenderingContext2D, o: LiveOpts, pal: Palette): void {
  const { species, r, t, gait, facing: f, form } = o
  const uid = o.uid ?? 1
  const nm = form === 'nightmare'
  const wilt = nm ? 0.32 : 0
  const ink = outlineInk(pal, species)
  const acc = accentLive(pal, nm)

  if (species === 'carrot' || species === 'turnip' || species === 'radish' || species === 'beet' || species === 'potato') {
    if (species === 'potato' && (o.model === 'b' || o.form === 'nightmare')) return
    const n = species === 'carrot' ? (o.model === 'c' ? 3 : 5) : species === 'beet' ? 4 : species === 'potato' ? 2 : 3
    const y = species === 'carrot' ? -r * 0.7 : species === 'radish' ? -r * 0.72 : species === 'potato' ? -r * 0.82 : -r * 0.88
    const span = species === 'potato' ? 0.7 : 2.2
    const start = species === 'potato' ? -0.35 : -1.1
    for (let i = 0; i < n; i++) {
      const base = start + i * (span / Math.max(1, n - 1))
      const a = base * f + teeter(t, gait, i, uid) + wilt * (i - (n - 1) / 2) * 0.08
      ctx.save()
      ctx.translate(0, y)
      ctx.rotate(a)
      if (species === 'carrot') paintFrond(ctx, pal, r, nm)
      else if (species === 'radish') paintLeaf(ctx, r * 0.1, r * 0.38, pal, nm)
      else if (species === 'beet') {
        ctx.fillStyle = mixColor(acc, pal.body, 0.25)
        paintLeaf(ctx, r * 0.16, r * 0.4, pal, nm)
      } else if (species === 'potato') {
        ctx.strokeStyle = acc
        ctx.lineWidth = r * 0.06
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(f * r * 0.08, -r * 0.12, 0, -r * 0.22)
        ctx.stroke()
        ctx.fillStyle = acc
        ctx.beginPath()
        ctx.arc(0, -r * 0.24, r * 0.055, 0, TAU)
        ctx.fill()
      } else paintLeaf(ctx, r * 0.2, r * 0.4, pal, nm)
      ctx.restore()
    }
    return
  }

  if (species === 'chili') {
    const curl = 0.55 + Math.sin(t * 4.6 + gait * TAU) * 0.28
    ctx.save()
    ctx.fillStyle = acc
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.82, r * 0.16, r * 0.14, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(1.6, r * 0.08)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.9)
    ctx.bezierCurveTo(f * r * 0.25 * curl, -r * 1.08, f * r * 0.38 * curl, -r * (1.08 + curl * 0.12), f * r * 0.06, -r * (1.2 + curl * 0.22))
    ctx.stroke()
    ctx.restore()
    return
  }

  if (species === 'onion') {
    for (let i = 0; i < 3; i++) {
      const phase = t * (2.7 + i * 0.45) + i * 1.2 + gait * TAU * 0.4
      const bend = Math.sin(phase) * 0.38 + wilt * 0.2
      const h = r * (0.42 + i * 0.14)
      ctx.save()
      ctx.translate((i - 1) * r * 0.11 * f, -r * 0.92)
      ctx.rotate(bend * f)
      ctx.strokeStyle = acc
      ctx.lineWidth = r * 0.065
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(f * r * 0.14 * bend, -h * 0.5, f * r * 0.02, -h)
      ctx.stroke()
      ctx.fillStyle = acc
      ctx.beginPath()
      ctx.ellipse(f * r * 0.02, -h, r * 0.07, r * 0.11, bend, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    return
  }

  if (species === 'pumpkin') {
    const nod = Math.sin(t * 3.5) * 0.18 + Math.sin(gait * TAU) * 0.1
    ctx.save()
    ctx.translate(0, -r * 0.88)
    ctx.rotate(nod * f)
    ctx.fillStyle = acc
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.16, r * 0.13, r * 0.26, 0.1 * f, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.3
    ctx.stroke()
    ctx.restore()
    return
  }

  if (species === 'eggplant') {
    const nod = Math.sin(t * 2.7) * 0.12 + Math.sin(gait * TAU) * 0.06
    ctx.save()
    ctx.translate(0, -r * 0.95)
    ctx.rotate(nod * f)
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.9 + i * (Math.PI * 0.45)
      ctx.save()
      ctx.rotate(a)
      ctx.fillStyle = acc
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.22, r * 0.16, r * 0.28, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = darken(acc, 0.15)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.18, r * 0.1, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
    return
  }

  if (species === 'sprout') {
    const flap = Math.sin(t * 4.2) * 0.2 + Math.sin(gait * TAU) * 0.14
    const leaves: readonly [number, number, number][] = [
      [-r * 0.28, -r * 0.28, -0.52 - flap],
      [r * 0.3, -r * 0.22, 0.55 + flap],
    ]
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]
      if (!leaf) continue
      ctx.save()
      ctx.translate(leaf[0] * f, leaf[1])
      ctx.rotate(leaf[2] * f)
      langWash(ctx, 0, 0, r * (0.48 - i * 0.04), r * 0.2, i === 0 ? acc : pal.body, {
        seed: 20 + i,
        shade: pal.shade,
        n: 7,
        wobble: 0.25,
      })
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.65
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(-r * 0.3, 0)
      ctx.lineTo(r * 0.3, 0)
      ctx.stroke()
      ctx.restore()
    }
    return
  }

  if (species === 'garlic') {
    const shiver = Math.sin(t * 7.5) * 0.12
    ctx.save()
    ctx.translate(0, -r * 0.82)
    ctx.rotate(shiver * f)
    ctx.fillStyle = acc
    ctx.beginPath()
    ctx.moveTo(-r * 0.06, 0)
    ctx.quadraticCurveTo(-r * 0.12, -r * 0.22, 0, -r * 0.28)
    ctx.quadraticCurveTo(r * 0.12, -r * 0.22, r * 0.06, 0)
    ctx.fill()
    ctx.restore()
    return
  }

  if (species === 'pea') {
    const twitch = Math.sin(t * 5.2 + gait * TAU) * 0.25
    ctx.save()
    ctx.translate(0, -r * 0.72)
    ctx.rotate(twitch * f)
    ctx.strokeStyle = acc
    ctx.lineWidth = r * 0.055
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(f * r * 0.12, -r * 0.16, f * r * 0.04, -r * 0.28)
    ctx.stroke()
    ctx.restore()
    return
  }

  if (species === 'cabbage') {
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.9 + Math.sin(t * 2.2 + i) * 0.12
      ctx.save()
      ctx.translate(Math.sin(a) * r * 0.15 * f, Math.cos(a) * r * 0.02)
      ctx.rotate(a * 0.4 * f)
      ctx.globalAlpha = 0.85
      langWash(ctx, 0, 0, r * 0.55, r * 0.28, i % 2 ? acc : pal.body, {
        seed: 30 + i,
        shade: pal.shade,
        n: 7,
        wobble: 0.22,
        passes: 2,
      })
      ctx.restore()
    }
    return
  }

  if (species === 'corn') {
    const rustle = Math.sin(t * 3.8) * 0.14
    ctx.save()
    ctx.translate(-r * 0.22, r * 0.05)
    ctx.rotate(-0.28 + rustle)
    langWash(ctx, 0, 0, r * 0.32, r * 0.95, acc, { seed: 40, shade: darken(acc, 0.2), n: 7, wobble: 0.18, passes: 2 })
    ctx.restore()
    ctx.save()
    ctx.translate(r * 0.22, r * 0.05)
    ctx.rotate(0.3 - rustle)
    langWash(ctx, 0, 0, r * 0.3, r * 0.9, acc, { seed: 42, n: 7, wobble: 0.18, passes: 2 })
    ctx.restore()
    return
  }

  if (species === 'broccoli') {
    const bounce = Math.sin(t * 4.4) * r * 0.05
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      const bob = bounce * (0.55 + (i % 3) * 0.18)
      langWash(
        ctx,
        Math.cos(a) * r * 0.35 * f,
        -r * 0.22 + Math.sin(a) * r * 0.22 + bob,
        r * 0.36,
        r * 0.3,
        i % 2 ? acc : pal.body,
        { seed: 50 + i, shade: pal.shade, n: 7, wobble: 0.28, passes: 2 },
      )
    }
    return
  }

  if (species === 'marrow') {
    const bob = Math.sin(t * 3.1) * r * 0.04
    ctx.save()
    ctx.translate(-r * 1.42 * f, bob)
    ctx.fillStyle = mixColor(pal.body, '#f0d060', 0.35)
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.12, 0, TAU)
    ctx.fill()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t * 0.4
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.12, r * 0.08, r * 0.14, a, 0, TAU)
      ctx.fill()
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
  const model: ModelDir = o.form === 'nightmare' ? 'b' : (o.model ?? 'a')
  const rig = speciesRig(o.species, o.r, model)
  const f = o.facing
  const pal = o.form === 'nightmare' ? nightmarePal(o.pal) : o.pal
  paintSpeciesMotion(ctx, o, pal)
  if (!(o.species === 'potato' && model !== 'a' && o.form !== 'nightmare')) {
    paintBrows(ctx, o.species, pal, rig, f, o.form)
  }
  paintEyePair(ctx, pal, o.species, rig, f, o.lookX, o.lookY, o.blink, o.scream, o.form, o.t, model)
  let mouthW = rig.mouthW
  if (o.form === 'nightmare' && o.species === 'carrot') mouthW *= 1.45
  if (o.form === 'nightmare' && o.species === 'sprout') mouthW *= 2.15
  paintMouth(ctx, pal, rig.mouth.x, rig.mouth.y, mouthW, o.mouth, o.form, f, o.species, model)

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
  const stick = model === 'b' || o.form === 'nightmare'
  const armW = stick ? Math.max(1.35, o.r * 0.048) : Math.max(3.2, o.r * 0.145)
  ctx.lineWidth = armW
  ctx.beginPath()
  ctx.moveTo(rig.shL.x * f, rig.shL.y)
  ctx.lineTo(hl.x, hl.y)
  ctx.moveTo(rig.shR.x * f, rig.shR.y)
  ctx.lineTo(hr.x, hr.y)
  ctx.stroke()
  mitten(ctx, hl.x, hl.y, pal, o.r * (stick ? 0.095 : 0.12))
  mitten(ctx, hr.x, hr.y, pal, o.r * (stick ? 0.095 : 0.12))

  const swing = Math.sin(o.gait * TAU)
  ctx.lineWidth = stick ? Math.max(1.45, o.r * 0.052) : Math.max(3.4, o.r * 0.155)
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
    langSmoke(ctx, o.r, o.t, o.uid ?? 1)
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
    mouth: form === 'nightmare' ? 0.42 : 0.1,
    blink: -1,
    gait: 0.14,
    scream: -1,
    facing: 1,
    lookX: 0.25,
    lookY: 0.1,
    t: 0.55,
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
  model: ModelDir = 'a',
  stain = false,
): HTMLCanvasElement {
  const art = Math.max(64, Math.round(artR * 4.8))
  const key = `veg:${species}:${paletteKey(pal)}:${form}:${model}:${stain ? 'stain' : 'clean'}:${lookKey()}:${artR}`
  return scaledSprite(cache, key, art, q, (ctx) => {
    paintCreatureBody(ctx, species, pal, artR, form, model, stain)
  })
}

export function paintIdleCreature(
  ctx: CanvasRenderingContext2D,
  species: Species,
  pal: Palette,
  r: number,
  form: Form,
  model: ModelDir = 'a',
  stain = false,
): void {
  paintCreatureBody(ctx, species, pal, r, form, model, stain)
  paintLiveFeatures(ctx, { species, pal, r, form, model, uid: 1, ...idleLive(form) })
}
