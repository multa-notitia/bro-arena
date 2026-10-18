import type { Enemy } from '../core/types.ts'
import { CHAOS } from '../data/chaos.ts'
import { resolveEnemySheet } from './chaosSheets.ts'
import { clipDrawScale, drawNamedClip, resolveSheet, restartActorClip } from './sheets.ts'

const SPLAT_ID = 'vfx-splat'
const PUFF_ID = 'vfx-gas-puff'
const PUFF_LIFE = 0.605

interface SplatDecal {
  x: number
  y: number
  scale: number
  facing: 1 | -1
  clip: string
  key: string
  t: number
}

interface GasPuff {
  x: number
  y: number
  scale: number
  facing: 1 | -1
  clip: string
  key: string
  t: number
  life: number
}

const splats: SplatDecal[] = []
const puffs: GasPuff[] = []
let nextFx = 1

function splatSheet() {
  return resolveSheet([SPLAT_ID])
}

function puffSheet() {
  return resolveSheet([PUFF_ID])
}

export function resetSmashVfx(): void {
  splats.length = 0
  puffs.length = 0
}

export function tickSmashVfx(dt: number): void {
  const step = Math.max(0, dt)
  for (let i = splats.length - 1; i >= 0; i--) {
    const s = splats[i]
    if (!s) continue
    s.t += step
    if (s.t >= CHAOS.read.splatGone) splats.splice(i, 1)
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]
    if (!p) continue
    p.t += step
    if (p.t >= p.life) puffs.splice(i, 1)
  }
}

export function spawnSmashSplat(e: Enemy, pick: number): void {
  const sheet = splatSheet()
  if (!sheet) return
  const group = resolveEnemySheet(e.kind, e.form)?.manifest.splat ?? 'green'
  const n = ((pick % 3) + 3) % 3
  const clip = `${group}_${n}`
  if (!sheet.manifest.clips[clip]) return
  while (splats.length >= CHAOS.read.splatCap) splats.shift()
  const draw = clipDrawScale(sheet, clip)
  const key = `splat:${nextFx++}`
  restartActorClip(key, clip)
  splats.push({
    x: e.x,
    y: e.y + 0.62 * e.r,
    scale: (e.r / 18) * draw * CHAOS.read.splatScale,
    facing: pick & 1 ? 1 : -1,
    clip,
    key,
    t: 0,
  })
}

export function spawnOnionPuff(e: Enemy): void {
  if (!e.kind.includes('onion') || e.kind.endsWith('-mud')) return
  const sheet = puffSheet()
  if (!sheet?.manifest.clips.puff_light) return
  const body = resolveEnemySheet(e.kind, e.form)
  const mouth = body?.manifest.mouth ?? { x: 0, y: 0 }
  const face: 1 | -1 = e.anim.facing < 0 ? -1 : 1
  const draw = clipDrawScale(sheet, 'puff_light')
  const key = `puff:${nextFx++}`
  restartActorClip(key, 'puff_light')
  puffs.push({
    x: e.x + mouth.x * face,
    y: e.y + mouth.y,
    scale: (e.r / 18) * draw,
    facing: face,
    clip: 'puff_light',
    key,
    t: 0,
    life: PUFF_LIFE,
  })
}

function splatFade(t: number): number {
  const hold = CHAOS.read.splatHold
  const gone = CHAOS.read.splatGone
  if (t <= hold) return 1
  return Math.max(0, 1 - (t - hold) / Math.max(0.01, gone - hold))
}

export function drawSmashSplats(ctx: CanvasRenderingContext2D, dt: number): void {
  const sheet = splatSheet()
  if (!sheet) return
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  if (CHAOS.read.splatDarken < 0.999) ctx.filter = `brightness(${CHAOS.read.splatDarken})`
  for (const s of splats) {
    const alpha = CHAOS.read.splatAlpha * splatFade(s.t)
    if (alpha <= 0.01) continue
    ctx.save()
    ctx.translate(s.x, s.y)
    drawNamedClip(ctx, sheet, s.key, s.clip, dt, { scale: s.scale, facing: s.facing, alpha })
    ctx.restore()
  }
  ctx.filter = 'none'
  ctx.restore()
}

export function drawGasPuffs(ctx: CanvasRenderingContext2D, dt: number): void {
  const sheet = puffSheet()
  if (!sheet) return
  for (const p of puffs) {
    ctx.save()
    ctx.translate(p.x, p.y)
    drawNamedClip(ctx, sheet, p.key, p.clip, dt, { scale: p.scale, facing: p.facing, alpha: 1 })
    ctx.restore()
  }
}
