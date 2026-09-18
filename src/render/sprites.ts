import { TAU, clamp } from '../core/math.ts'
import type {
  CharacterDef,
  Form,
  ItemPaint,
  Palette,
  PickupType,
  ProjectilePaint,
  Species,
  WeaponPaint,
} from '../core/types.ts'
import {
  BODY_R,
  creatureSprite,
  isSpecies,
  paintIdleCreature,
  paletteKey as creaturePaletteKey,
  resolveSpecies,
  SPECIES_PALETTES,
} from './creatures.ts'
import {
  granulate,
  inkStroke,
  makeCanvas,
  rgba,
  splat,
  wash,
} from './watercolor.ts'

const BODY_ART = 112
const WEAPON_ART = 88
const PROJ_ART = 40
const PICK_ART = 48
const TREE_ART = 110
const MARK_ART = 64

export interface SpriteCache {
  canvas(
    key: string,
    w: number,
    h: number,
    paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): HTMLCanvasElement
}

export function createSpriteCache(): SpriteCache {
  const map = new Map<string, HTMLCanvasElement>()
  return {
    canvas(key, w, h, paint) {
      const hit = map.get(key)
      if (hit) return hit
      const { canvas, ctx } = makeCanvas(w, h)
      if (ctx) paint(ctx, canvas.width, canvas.height)
      map.set(key, canvas)
      return canvas
    },
  }
}

export function paletteKey(p: Palette): string {
  return creaturePaletteKey(p)
}

export const POTATO_PALETTE: Palette = SPECIES_PALETTES.potato
export const ENEMY_PALETTES: Record<Species, Palette> = SPECIES_PALETTES

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function qualityBucket(zoom: number, dpr: number): number {
  const b = Math.ceil(Math.max(0.5, zoom) * Math.max(1, dpr) * 2) / 2
  return clamp(Math.max(2, b), 2, 3)
}

function wood(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, seed: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  wash(ctx, 0, 0, rx, ry, '#b08958', { seed, shade: '#7a5630', n: 6, wobble: 0.1, passes: 3 })
  inkStroke(ctx, 0, 0, rx * 1.02, ry * 1.04, '#2c1c10', { seed, width: 1.1, n: 7 })
  ctx.restore()
}

function steel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  seed: number,
  color = '#c5c8ce',
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  wash(ctx, 0, 0, rx, ry, color, { seed, shade: '#5c6168', n: 6, wobble: 0.08, passes: 3 })
  inkStroke(ctx, 0, 0, rx * 1.02, ry * 1.04, '#1e1c1a', { seed, width: 1.15, n: 7 })
  ctx.restore()
}

function paintWeapon(ctx: CanvasRenderingContext2D, paint: WeaponPaint, frame: number): void {
  const seed = seedOf(paint) + frame * 3
  switch (paint) {
    case 'fist':
      wash(ctx, 8, 0, 14, 12, '#e0c49a', { seed, shade: '#b08958', n: 7, wobble: 0.16 })
      for (let i = 0; i < 4; i++) {
        wash(ctx, 16, -9 + i * 6, 6, 4.2, '#d4b07e', { seed: seed + i, n: 5, wobble: 0.2, passes: 2 })
      }
      inkStroke(ctx, 8, 0, 15, 13, '#2c2014', { seed, width: 1.4, n: 8 })
      break
    case 'knife':
      wood(ctx, -6, 2, 8, 3.2, 0.1, seed)
      steel(ctx, 12, -1, 16, 4.2, -0.08, seed, '#d8dde4')
      break
    case 'stick':
      wood(ctx, 6, 0, 22, 3.4, -0.12, seed)
      wash(ctx, 24, -4, 6, 5, '#6a8a48', { seed, n: 5, wobble: 0.3, passes: 2 })
      break
    case 'sword':
      wood(ctx, -8, 2, 9, 3.5, 0.05, seed)
      steel(ctx, 14, -1, 22, 5, -0.05, seed, '#d0d4dc')
      wood(ctx, 2, 0, 3, 8, 0, seed + 1)
      break
    case 'spear':
      wood(ctx, 0, 1, 26, 2.6, 0, seed)
      steel(ctx, 26, 0, 10, 4, 0, seed, '#dce0e6')
      break
    case 'hammer':
      wood(ctx, -2, 2, 16, 3.2, 0.05, seed)
      wash(ctx, 18, 0, 12, 10, '#8a9098', { seed, shade: '#4a5058', n: 6, wobble: 0.1 })
      inkStroke(ctx, 18, 0, 12.5, 10.5, '#1e1c1a', { seed, width: 1.3, n: 7 })
      break
    case 'scythe':
      wood(ctx, -4, 4, 18, 3, 0.7, seed)
      ctx.save()
      ctx.translate(10, -8)
      ctx.rotate(-0.9)
      wash(ctx, 8, 0, 18, 5, '#c8ccd4', { seed, shade: '#4a5058', n: 8, wobble: 0.12 })
      inkStroke(ctx, 8, 0, 18.5, 5.4, '#1e1c1a', { seed, width: 1.2, n: 8 })
      ctx.restore()
      break
    case 'pistol':
      wash(ctx, 6, 0, 14, 6, '#4a4038', { seed, shade: '#2a2420', n: 6, wobble: 0.08 })
      wood(ctx, -4, 6, 7, 5, 0.4, seed)
      steel(ctx, 16, -2, 8, 3, 0, seed)
      inkStroke(ctx, 6, 0, 14.5, 6.5, '#1a1410', { seed, width: 1.2, n: 7 })
      break
    case 'smg':
      wash(ctx, 8, 0, 18, 6, '#3a3c40', { seed, shade: '#1c1e20', n: 6, wobble: 0.08 })
      wash(ctx, 4, 8, 4, 8, '#2a2c30', { seed, n: 5, wobble: 0.1, passes: 2 })
      steel(ctx, 22, -2, 10, 3, 0, seed)
      inkStroke(ctx, 8, 0, 18.5, 6.5, '#101012', { seed, width: 1.2, n: 7 })
      break
    case 'shotgun':
      wood(ctx, -6, 4, 12, 4, 0.15, seed)
      steel(ctx, 14, -2, 20, 3.2, 0, seed)
      steel(ctx, 14, 3, 18, 2.6, 0, seed + 1)
      break
    case 'slingshot':
      wood(ctx, 4, 4, 5, 12, 0.1, seed)
      ctx.strokeStyle = '#2c2014'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(-2, -8)
      ctx.quadraticCurveTo(10, -14, 14, -4)
      ctx.stroke()
      wash(ctx, -4, -8, 5, 4, '#b08958', { seed, n: 5, passes: 2 })
      wash(ctx, 14, -4, 5, 4, '#b08958', { seed: seed + 1, n: 5, passes: 2 })
      break
    case 'crossbow':
      wood(ctx, 4, 2, 16, 3.5, 0, seed)
      wood(ctx, 10, 0, 4, 14, 0, seed + 1)
      steel(ctx, 22, 0, 10, 2.2, 0, seed)
      ctx.strokeStyle = '#2c2014'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(10, -14)
      ctx.lineTo(22, 0)
      ctx.lineTo(10, 14)
      ctx.stroke()
      break
    case 'wand':
      wood(ctx, 0, 2, 18, 2.4, -0.15, seed)
      wash(ctx, 18, -6, 8, 8, '#7a6ab0', { seed: seed + frame, shade: '#3a2a70', n: 7, wobble: 0.3 })
      splat(ctx, 18, -6, '#c8b8f0', 10, { seed: seed + frame, count: 3 })
      inkStroke(ctx, 18, -6, 8.5, 8.5, '#1c1428', { seed, width: 1.1, n: 7 })
      break
    case 'torch': {
      wood(ctx, -4, 6, 14, 3.2, 0.5, seed)
      const flick = 1 + (frame % 4) * 0.08
      wash(ctx, 10, -8, 8 * flick, 12 * flick, '#e07038', { seed: seed + frame, shade: '#a83818', n: 7, wobble: 0.35 })
      wash(ctx, 10, -12, 4 * flick, 7 * flick, '#f0d060', { seed: seed + frame + 2, n: 6, wobble: 0.4, passes: 2 })
      break
    }
    case 'flint':
      wash(ctx, 4, 2, 12, 9, '#6a6e72', { seed, shade: '#3a3e42', n: 6, wobble: 0.18 })
      wash(ctx, 14, -6, 7, 5, '#e8a048', { seed: seed + frame, n: 6, wobble: 0.4, passes: 2 })
      inkStroke(ctx, 4, 2, 12.5, 9.5, '#1c1c1c', { seed, width: 1.2, n: 7 })
      break
    case 'lightning':
      ctx.save()
      ctx.strokeStyle = '#c8e8ff'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(-12, 10)
      ctx.lineTo(0, -2)
      ctx.lineTo(-4, 0)
      ctx.lineTo(16, -14)
      ctx.stroke()
      ctx.strokeStyle = rgba('#88ddff', 0.45)
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.restore()
      wood(ctx, -10, 10, 8, 3, 0.4, seed)
      break
    default: {
      const _never: never = paint
      void _never
    }
  }
}

function paintProjectile(ctx: CanvasRenderingContext2D, paint: ProjectilePaint): void {
  const seed = seedOf(paint)
  switch (paint) {
    case 'bullet':
      wash(ctx, 0, 0, 8, 3.2, '#3a342c', { seed, shade: '#1a1612', n: 5, wobble: 0.08, passes: 2 })
      break
    case 'pellet':
      wash(ctx, 0, 0, 4.5, 4.2, '#5a5248', { seed, n: 6, wobble: 0.2, passes: 2 })
      break
    case 'arrow':
      wood(ctx, -2, 0, 12, 2, 0, seed)
      steel(ctx, 10, 0, 6, 3, 0, seed)
      ctx.fillStyle = '#6a8a48'
      ctx.beginPath()
      ctx.moveTo(-12, 0)
      ctx.lineTo(-16, -4)
      ctx.lineTo(-14, 0)
      ctx.lineTo(-16, 4)
      ctx.closePath()
      ctx.fill()
      break
    case 'stone':
      wash(ctx, 0, 0, 7, 6, '#8a8478', { seed, shade: '#4a463e', n: 6, wobble: 0.22 })
      inkStroke(ctx, 0, 0, 7.4, 6.4, '#2a2620', { seed, width: 1, n: 6 })
      break
    case 'bolt':
      steel(ctx, 0, 0, 12, 2.4, 0, seed, '#c8ccd0')
      wash(ctx, 10, 0, 5, 3, '#8a9098', { seed, n: 5, passes: 2 })
      break
    case 'flame':
      wash(ctx, 0, 0, 8, 11, '#e07038', { seed, shade: '#a83818', n: 7, wobble: 0.35 })
      wash(ctx, -1, -4, 4, 6, '#f0d060', { seed: seed + 1, n: 6, wobble: 0.4, passes: 2 })
      break
    case 'spit':
      wash(ctx, 0, 0, 7, 6, '#8aaa4a', { seed, shade: '#4a6a20', n: 7, wobble: 0.3 })
      splat(ctx, 4, 2, '#c8dd70', 8, { seed, count: 3 })
      break
    case 'spore':
      wash(ctx, 0, 0, 8, 8, '#c8c070', { seed, shade: '#8a8040', n: 8, wobble: 0.28 })
      granulate(ctx, -10, -10, 20, 20, '#6a6028', { seed, density: 20, alpha: 0.2 })
      break
    case 'orb':
      wash(ctx, 0, 0, 8, 8, '#7a6ab0', { seed, shade: '#3a2a70', n: 8, wobble: 0.18 })
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#e0d8ff'
      ctx.beginPath()
      ctx.arc(-2, -2, 3, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
      inkStroke(ctx, 0, 0, 8.4, 8.4, '#1c1428', { seed, width: 1, n: 8, close: 0.8 })
      break
    default: {
      const _never: never = paint
      void _never
    }
  }
}

function paintPickup(ctx: CanvasRenderingContext2D, type: PickupType): void {
  if (type === 'material' || type === 'materialBig') {
    const s = type === 'materialBig' ? 1.45 : 1
    wash(ctx, 0, 2, 9 * s, 12 * s, '#3d8a40', { seed: 3, shade: '#1e4a22', n: 8, wobble: 0.2 })
    ctx.globalAlpha = 0.95
    ctx.fillStyle = '#f4fff0'
    ctx.beginPath()
    ctx.ellipse(-3.2 * s, -4.4 * s, 3.2 * s, 2.3 * s, -0.4, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
    inkStroke(ctx, 0, 2, 9.8 * s, 12.8 * s, '#0c1c10', { seed: 3, width: 2.8 * s, n: 8, alpha: 0.94 })
    return
  }
  if (type === 'fruit') {
    wash(ctx, 0, 2, 10, 9, '#c4453c', { seed: 4, shade: '#8a2420', n: 8, wobble: 0.18 })
    ctx.strokeStyle = '#3a6028'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.quadraticCurveTo(6, -12, 8, -6)
    ctx.stroke()
    ctx.fillStyle = rgba('#fff6e8', 0.55)
    ctx.beginPath()
    ctx.ellipse(-3, -2, 2.4, 1.6, -0.4, 0, TAU)
    ctx.fill()
    inkStroke(ctx, 0, 2, 10.5, 9.5, '#2c1010', { seed: 4, width: 1.2, n: 8 })
    return
  }
  wash(ctx, 0, 2, 14, 10, '#b08958', { seed: 5, shade: '#6a4a28', n: 6, wobble: 0.08 })
  ctx.strokeStyle = '#2c1c10'
  ctx.lineWidth = 1.2
  ctx.strokeRect(-10, -5, 20, 14)
  ctx.beginPath()
  ctx.moveTo(-10, 1)
  ctx.lineTo(10, 1)
  ctx.stroke()
  wash(ctx, 0, -6, 5, 3, '#c4a060', { seed: 6, n: 5, passes: 2 })
  inkStroke(ctx, 0, 2, 14.5, 10.5, '#2c1c10', { seed: 5, width: 1.4, n: 7 })
}

function paintTree(ctx: CanvasRenderingContext2D): void {
  wash(ctx, 0, 28, 8, 22, '#8a6238', { seed: 11, shade: '#5a3c20', n: 6, wobble: 0.1 })
  inkStroke(ctx, 0, 28, 8.4, 22.5, '#2c1c10', { seed: 11, width: 1.4, n: 7 })
  wash(ctx, -6, -8, 28, 24, '#5a8a48', { seed: 12, shade: '#3a5e2c', n: 9, wobble: 0.22, passes: 4 })
  wash(ctx, 10, -4, 20, 18, '#6a9a52', { seed: 13, shade: '#3a5e2c', n: 8, wobble: 0.24, passes: 3 })
  wash(ctx, 0, -22, 16, 14, '#8aaa5a', { seed: 14, shade: '#4a6a30', n: 7, wobble: 0.2, passes: 3 })
  granulate(ctx, -36, -40, 72, 70, '#2a4018', { seed: 15, density: 80, alpha: 0.1 })
  inkStroke(ctx, 2, -10, 32, 28, '#1c2a14', { seed: 12, width: 1.8, n: 11, wobble: 0.16, close: 0.86 })
  splat(ctx, 8, 4, '#4a6a30', 16, { seed: 16, count: 5 })
}


function paintItem(ctx: CanvasRenderingContext2D, paint: ItemPaint, size: number): void {
  const s = size / 48
  const seed = seedOf(paint)
  ctx.save()
  ctx.scale(s, s)
  switch (paint) {
    case 'heart':
      wash(ctx, 0, 2, 14, 12, '#c4453c', { seed, shade: '#8a2420', n: 7, wobble: 0.16 })
      inkStroke(ctx, 0, 2, 14.5, 12.5, '#2c1010', { seed, width: 1.4, n: 8 })
      break
    case 'leaf':
      wash(ctx, 2, 0, 13, 8, '#5a9a48', { seed, shade: '#2e6a28', n: 7, wobble: 0.22, rotation: 0.5 })
      ctx.strokeStyle = '#2a4018'
      ctx.beginPath()
      ctx.moveTo(-10, 6)
      ctx.quadraticCurveTo(0, 0, 12, -8)
      ctx.stroke()
      break
    case 'boot':
      wash(ctx, 0, 4, 12, 10, '#6a4a32', { seed, shade: '#3a2818', n: 6, wobble: 0.1 })
      inkStroke(ctx, 0, 4, 12.5, 10.5, '#1c140c', { seed, width: 1.3, n: 7 })
      break
    case 'shield':
      wash(ctx, 0, 0, 12, 14, '#6a8aaa', { seed, shade: '#3a5068', n: 6, wobble: 0.08 })
      inkStroke(ctx, 0, 0, 12.5, 14.5, '#1c2430', { seed, width: 1.4, n: 7 })
      break
    case 'clover':
      for (const [x, y] of [
        [-6, -4],
        [6, -4],
        [-6, 6],
        [6, 6],
      ] as const) {
        wash(ctx, x, y, 7, 6, '#3d7a48', { seed, n: 6, wobble: 0.2, passes: 2 })
      }
      break
    case 'skull':
      wash(ctx, 0, -2, 12, 11, '#e8dcc4', { seed, shade: '#b0a488', n: 7, wobble: 0.12 })
      ctx.fillStyle = '#1a1410'
      ctx.beginPath()
      ctx.arc(-4, -2, 2.2, 0, TAU)
      ctx.arc(4, -2, 2.2, 0, TAU)
      ctx.fill()
      inkStroke(ctx, 0, -2, 12.5, 11.5, '#2c2418', { seed, width: 1.2, n: 8 })
      break
    case 'gem':
      wash(ctx, 0, 0, 10, 12, '#5a8ad0', { seed, shade: '#284a88', n: 5, wobble: 0.08 })
      ctx.fillStyle = rgba('#d0e8ff', 0.55)
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.lineTo(8, 0)
      ctx.lineTo(0, 10)
      ctx.lineTo(-8, 0)
      ctx.closePath()
      ctx.fill()
      inkStroke(ctx, 0, 0, 10.5, 12.5, '#102038', { seed, width: 1.2, n: 6 })
      break
    case 'flask':
      wash(ctx, 0, 6, 8, 10, '#7a6ab0', { seed, shade: '#3a2a70', n: 6, wobble: 0.1 })
      wood(ctx, 0, -8, 5, 4, 0, seed)
      inkStroke(ctx, 0, 6, 8.5, 10.5, '#1c1428', { seed, width: 1.2, n: 7 })
      break
    case 'book':
      wash(ctx, 0, 0, 12, 10, '#8a4038', { seed, shade: '#5a2018', n: 5, wobble: 0.06 })
      ctx.fillStyle = '#f0e6d0'
      ctx.fillRect(-8, -8, 16, 14)
      ctx.strokeStyle = '#2c1810'
      ctx.strokeRect(-8, -8, 16, 14)
      break
    case 'coin':
      wash(ctx, 0, 0, 11, 11, '#d4b060', { seed, shade: '#8a6a28', n: 8, wobble: 0.08 })
      inkStroke(ctx, 0, 0, 11.5, 11.5, '#4a380c', { seed, width: 1.3, n: 8 })
      break
    case 'eye':
      wash(ctx, 0, 0, 14, 8, '#f0e8d8', { seed, shade: '#c0b8a0', n: 8, wobble: 0.1 })
      ctx.fillStyle = '#3a6a8a'
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, TAU)
      ctx.fill()
      inkStroke(ctx, 0, 0, 14.5, 8.5, '#2c2418', { seed, width: 1.2, n: 8 })
      break
    case 'feather':
      wash(ctx, 2, 0, 6, 14, '#e8dcc4', { seed, shade: '#b0a488', n: 7, wobble: 0.2, rotation: 0.4 })
      inkStroke(ctx, 2, 0, 6.5, 14.5, '#2c2418', { seed, width: 1, n: 8, rotation: 0.4 })
      break
    case 'anvil':
      wash(ctx, 0, 2, 14, 8, '#6a6e74', { seed, shade: '#3a3e44', n: 5, wobble: 0.06 })
      wash(ctx, 0, -8, 16, 5, '#8a8e94', { seed, n: 5, passes: 2 })
      inkStroke(ctx, 0, 0, 16, 12, '#1c1c1c', { seed, width: 1.3, n: 6 })
      break
    case 'bomb':
      wash(ctx, 0, 4, 11, 11, '#3a3c40', { seed, shade: '#1c1e20', n: 8, wobble: 0.1 })
      ctx.strokeStyle = '#2c2014'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(4, -6)
      ctx.quadraticCurveTo(10, -14, 14, -8)
      ctx.stroke()
      wash(ctx, 14, -8, 3, 3, '#e07038', { seed, n: 5, passes: 2 })
      inkStroke(ctx, 0, 4, 11.5, 11.5, '#101012', { seed, width: 1.3, n: 8 })
      break
    case 'glove':
      wash(ctx, 0, 2, 11, 12, '#c47a4a', { seed, shade: '#8a4c2c', n: 7, wobble: 0.12 })
      inkStroke(ctx, 0, 2, 11.5, 12.5, '#2e1c14', { seed, width: 1.2, n: 8 })
      break
    case 'lantern':
      wash(ctx, 0, 4, 9, 11, '#d4b060', { seed, shade: '#8a6a28', n: 6, wobble: 0.1 })
      wood(ctx, 0, -10, 8, 3, 0, seed)
      inkStroke(ctx, 0, 4, 9.5, 11.5, '#3a2c0c', { seed, width: 1.2, n: 7 })
      break
    case 'root':
      wash(ctx, 0, 0, 7, 14, '#8a6238', { seed, shade: '#5a3c20', n: 7, wobble: 0.25, rotation: 0.2 })
      inkStroke(ctx, 0, 0, 7.5, 14.5, '#2c1c10', { seed, width: 1.1, n: 8, rotation: 0.2 })
      break
    case 'bag':
      wash(ctx, 0, 4, 12, 11, '#6a8a48', { seed, shade: '#3a5e2c', n: 7, wobble: 0.12 })
      ctx.strokeStyle = '#2c1c10'
      ctx.beginPath()
      ctx.moveTo(-6, -4)
      ctx.lineTo(0, -10)
      ctx.lineTo(6, -4)
      ctx.stroke()
      inkStroke(ctx, 0, 4, 12.5, 11.5, '#1c2a14', { seed, width: 1.2, n: 8 })
      break
    case 'bell':
      wash(ctx, 0, 2, 10, 12, '#d4b060', { seed, shade: '#8a6a28', n: 7, wobble: 0.1 })
      ctx.fillStyle = '#8a6a28'
      ctx.beginPath()
      ctx.arc(0, 10, 2, 0, TAU)
      ctx.fill()
      inkStroke(ctx, 0, 2, 10.5, 12.5, '#3a2c0c', { seed, width: 1.2, n: 8 })
      break
    case 'fang':
      wash(ctx, 0, 0, 5, 14, '#f0e8d8', { seed, shade: '#c0b8a0', n: 6, wobble: 0.1, rotation: 0.15 })
      inkStroke(ctx, 0, 0, 5.5, 14.5, '#2c2418', { seed, width: 1, n: 7, rotation: 0.15 })
      break
    case 'magnet':
      wash(ctx, -6, 2, 6, 12, '#c4453c', { seed, shade: '#8a2420', n: 5, wobble: 0.08 })
      wash(ctx, 6, 2, 6, 12, '#4a6aaa', { seed, shade: '#243a68', n: 5, wobble: 0.08 })
      ctx.strokeStyle = '#1c1410'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(0, -2, 10, Math.PI, 0)
      ctx.stroke()
      break
    case 'mushroom':
      wash(ctx, 0, 8, 5, 8, '#e8dcc4', { seed, shade: '#b0a488', n: 6, wobble: 0.1 })
      wash(ctx, 0, -2, 14, 8, '#c4453c', { seed, shade: '#8a2420', n: 8, wobble: 0.16 })
      ctx.fillStyle = '#f0e8d8'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(-4, -2, 2, 0, TAU)
      ctx.arc(5, 0, 1.6, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
      break
    case 'ring':
      ctx.strokeStyle = '#d4b060'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, TAU)
      ctx.stroke()
      wash(ctx, 0, -10, 4, 4, '#7a6ab0', { seed, n: 5, passes: 2 })
      inkStroke(ctx, 0, 0, 12, 12, '#4a380c', { seed, width: 1, n: 10, close: 0.92 })
      break
    case 'scroll':
      wash(ctx, 0, 0, 14, 8, '#e8dcc4', { seed, shade: '#c0b8a0', n: 6, wobble: 0.08 })
      ctx.strokeStyle = '#6a5340'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-8, -2)
      ctx.lineTo(8, -2)
      ctx.moveTo(-6, 2)
      ctx.lineTo(6, 2)
      ctx.stroke()
      inkStroke(ctx, 0, 0, 14.5, 8.5, '#2c2418', { seed, width: 1.1, n: 7 })
      break
    default: {
      const _never: never = paint
      void _never
    }
  }
  ctx.restore()
}

function scaledSprite(
  cache: SpriteCache,
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


export function playerSprite(
  cache: SpriteCache,
  pal: Palette,
  species: Species,
  form: Form,
  q = 1,
): HTMLCanvasElement {
  return creatureSprite(cache, species, pal, form, BODY_R, q)
}

export function enemySprite(
  cache: SpriteCache,
  species: Species,
  pal: Palette,
  form: Form,
  artR: number,
  q = 1,
): HTMLCanvasElement {
  return creatureSprite(cache, species, pal, form, artR, q)
}

export function weaponSprite(cache: SpriteCache, paint: WeaponPaint, frame = 0, q = 1): HTMLCanvasElement {
  const f = frame % 4
  return scaledSprite(cache, `wpn:${paint}:${f}`, WEAPON_ART, q, (ctx) => {
    paintWeapon(ctx, paint, f)
  })
}

export function projectileSprite(cache: SpriteCache, paint: ProjectilePaint, q = 1): HTMLCanvasElement {
  return scaledSprite(cache, `prj:${paint}`, PROJ_ART, q, (ctx) => {
    paintProjectile(ctx, paint)
  })
}

export function pickupSprite(cache: SpriteCache, type: PickupType, q = 1): HTMLCanvasElement {
  return scaledSprite(cache, `pick:${type}`, PICK_ART, q, (ctx) => {
    paintPickup(ctx, type)
  })
}

export function treeSprite(cache: SpriteCache, q = 1): HTMLCanvasElement {
  return scaledSprite(cache, 'tree', TREE_ART, q, (ctx) => {
    paintTree(ctx)
  })
}

function paintMarkerNormal(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = rgba('#c4453c', 0.85)
  ctx.lineWidth = 3
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.ellipse(0, 0, 22, 14, 0, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
  wash(ctx, 0, 0, 16, 10, '#c4453c', { seed: 21, shade: '#8a2420', n: 8, wobble: 0.25, passes: 3, alpha: 0.7 })
  inkStroke(ctx, 0, 0, 22, 14, '#6a1810', { seed: 21, width: 1.6, n: 9, wobble: 0.18 })
}

function paintMarkerNightmare(ctx: CanvasRenderingContext2D): void {
  wash(ctx, 0, 0, 20, 14, '#33241a', { seed: 22, shade: '#1a120c', n: 8, wobble: 0.22, passes: 3, alpha: 0.85 })
  ctx.strokeStyle = rgba('#1a120c', 0.9)
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.ellipse(0, 0, 24, 16, 0, 0, TAU)
  ctx.stroke()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.75
  ctx.fillStyle = '#d9ff5c'
  ctx.beginPath()
  ctx.ellipse(0, 0, 8, 5, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function markerSprite(cache: SpriteCache, form: Form = 'normal', q = 1): HTMLCanvasElement {
  return scaledSprite(cache, `marker:${form}`, MARK_ART, q, (ctx) => {
    if (form === 'nightmare') paintMarkerNightmare(ctx)
    else paintMarkerNormal(ctx)
  })
}

export function itemSprite(cache: SpriteCache, paint: ItemPaint, size: number): HTMLCanvasElement {
  const s = Math.max(24, Math.round(size))
  const key = `item:${paint}:${s}`
  return cache.canvas(key, s, s, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2)
    paintItem(ctx, paint, s)
  })
}

const urlCache = new Map<string, string>()

const WEAPON_PAINTS: readonly WeaponPaint[] = [
  'fist',
  'knife',
  'stick',
  'sword',
  'spear',
  'hammer',
  'scythe',
  'pistol',
  'smg',
  'shotgun',
  'slingshot',
  'crossbow',
  'wand',
  'torch',
  'flint',
  'lightning',
]

const ITEM_PAINTS: readonly ItemPaint[] = [
  'heart',
  'leaf',
  'boot',
  'shield',
  'clover',
  'skull',
  'gem',
  'flask',
  'book',
  'coin',
  'eye',
  'feather',
  'anvil',
  'bomb',
  'glove',
  'lantern',
  'root',
  'bag',
  'bell',
  'fang',
  'magnet',
  'mushroom',
  'ring',
  'scroll',
]

function isWeaponPaint(s: string): s is WeaponPaint {
  return (WEAPON_PAINTS as readonly string[]).includes(s)
}
function isItemPaint(s: string): s is ItemPaint {
  return (ITEM_PAINTS as readonly string[]).includes(s)
}

export function iconDataUrl(
  cache: SpriteCache,
  kind: 'weapon' | 'item' | 'enemy' | 'character',
  paint: string,
  palette: Palette | undefined,
  size: number,
  dpr: number,
  form: Form = 'normal',
): string {
  const px = Math.max(16, Math.round(size * clamp(dpr, 1, 2)))
  const species = resolveSpecies(paint, isSpecies(paint) ? paint : undefined, paint)
  const pal = palette ?? (kind === 'enemy' || kind === 'character' ? SPECIES_PALETTES[species] : POTATO_PALETTE)
  const key = `icon:${kind}:${paint}:${paletteKey(pal)}:${form}:${px}`
  const hit = urlCache.get(key)
  if (hit) return hit
  const canvas = cache.canvas(`raw:${key}`, px, px, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2)
    const sc = w / 64
    ctx.scale(sc, sc)
    if (kind === 'weapon' && isWeaponPaint(paint)) paintWeapon(ctx, paint, 0)
    else if (kind === 'item' && isItemPaint(paint)) paintItem(ctx, paint, 48)
    else paintIdleCreature(ctx, species, pal, 20, form)
  })
  const url = canvas.toDataURL('image/png')
  urlCache.set(key, url)
  return url
}

export function portraitDataUrl(
  cache: SpriteCache,
  character: CharacterDef,
  size: number,
  dpr: number,
  form: Form = 'normal',
): string {
  const px = Math.max(32, Math.round(size * clamp(dpr, 1, 2)))
  const species = resolveSpecies(character.species ?? 'potato', character.species, character.id)
  const key = `port:${character.id}:${form}:${paletteKey(character.palette)}:${px}`
  const hit = urlCache.get(key)
  if (hit) return hit
  const canvas = cache.canvas(`raw:${key}`, px, px, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2)
    ctx.fillStyle = rgba('#efe6d0', 0.95)
    ctx.beginPath()
    ctx.arc(0, 0, w * 0.46, 0, TAU)
    ctx.fill()
    paintIdleCreature(ctx, species, character.palette, w * 0.28, form)
  })
  const url = canvas.toDataURL('image/png')
  urlCache.set(key, url)
  return url
}

export const ART = {
  body: BODY_ART,
  bodyR: BODY_R,
  weapon: WEAPON_ART,
  proj: PROJ_ART,
  pick: PICK_ART,
  tree: TREE_ART,
  mark: MARK_ART,
}
