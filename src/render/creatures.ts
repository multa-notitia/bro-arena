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
