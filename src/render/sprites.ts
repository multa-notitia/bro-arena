import { TAU, clamp, lerp } from '../core/math.ts'
import type {
  CharacterDef,
  EnemyPaint,
  ItemPaint,
  Palette,
  PickupType,
  ProjectilePaint,
  WeaponPaint,
} from '../core/types.ts'
import {
  darken,
  granulate,
  inkStroke,
  makeCanvas,
  mixColor,
  n01,
  rgba,
  splat,
  wash,
  wobbleBlob,
} from './watercolor.ts'

const BODY_ART = 112
const BODY_R = 30
const WEAPON_ART = 88
const PROJ_ART = 40
const PICK_ART = 48
const TREE_ART = 110
const MARK_ART = 64
