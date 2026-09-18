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
