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
