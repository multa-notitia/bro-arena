import { clamp, dist, ease } from '../core/math.ts'
import { CHAOS } from '../data/chaos.ts'
import { BITE_HIT_PAD, LEAP_HIT_PAD, MAX_LEAPING, specialsFor, type SpecialRow } from '../data/specials.ts'
import type { Enemy, World } from '../core/types.ts'
import { addTrauma } from '../feel.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { actorClipDone, clipPlayhead, restartActorClip, type LoadedSheet } from '../render/sheets.ts'
import { damagePlayer } from './combat.ts'
import { familyHidden } from './families.ts'
import type { SimCtx } from './world.ts'

type Phase = 'crouch' | 'intro' | 'leap' | 'bite'

interface Live {
  row: SpecialRow
  phase: Phase
  introClip: string | null
  introT: number
  crouchT: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  flightT: number
  flightDur: number
  airborne: boolean
  tookOff: boolean
  landed: boolean
  hit: boolean
  dashT: number
  dashDur: number
  dashing: boolean
  dashFromX: number
  dashFromY: number
  dashToX: number
  dashToY: number
  counted: boolean
}

const lives = new WeakMap<Enemy, Live>()
const cooldown = new WeakMap<Enemy, number>()
let leaping = 0

function playKey(e: Enemy): string {
  return `e:${e.uid}`
}

function sheetOf(e: Enemy): LoadedSheet | null {
  return resolveEnemySheet(e.kind, e.form)
}

export function isAirborne(e: Enemy): boolean {
  return lives.get(e)?.airborne === true
}

/** True while the leap clip should own the body (not during the scream/taunt). */
export function isLeaping(e: Enemy): boolean {
  const row = lives.get(e)
  return !!row && row.row.id === 'leap' && row.phase === 'leap'
}

export function specialOwns(e: Enemy): boolean {
  return lives.has(e)
}

/** Clip the sheet player should show, if a special is performing one. */
export function specialClip(e: Enemy): string | null {
  const row = lives.get(e)
  if (!row) return null
  if (row.phase === 'intro' && row.introClip) return row.introClip
  if (row.phase === 'leap') return 'leap'
  if (row.phase === 'bite') return 'bite'
  return null
}

/** Scream that is only the leap tell. Skip the bright shockwave. */
export function screamIsLeapTell(e: Enemy): boolean {
  const row = lives.get(e)
  return !!row && row.phase === 'intro' && row.introClip === 'scream'
}

/** Painted leap already squashes. Keep the procedural scale at 1. */
export function pinLeapSquash(e: Enemy): boolean {
  const row = lives.get(e)
  if (!row || row.row.id !== 'leap' || row.phase !== 'leap') return false
  const specs = sheetOf(e)?.manifest.specials
  return !specs || specs.includes('leap')
}

/** Soft mark on the soil where the leap was aimed. Gone after the landing. */
export function landingShadow(e: Enemy): { x: number; y: number } | null {
  const row = lives.get(e)
  if (!row || row.row.id !== 'leap' || row.phase !== 'leap' || row.landed) return null
  return { x: row.toX, y: row.toY }
}

/** Visual lift from authored `meta.airOffsetY`. Frame `oy` is painted separately. */
export function hopHeight(e: Enemy): number {
  if (!isLeaping(e)) return 0
  const sheet = sheetOf(e)
  const list = sheet?.manifest.airOffsetY?.leap
  if (!list?.length || !sheet) return 0
  const at = clipPlayhead(playKey(e), sheet, 'leap')
  const i = at ? at.index : 0
  const a = list[i] ?? 0
  const b = list[Math.min(i + 1, list.length - 1)] ?? a
  return -(a + (b - a) * (at?.frac ?? 0))
}

function flightSeconds(sheet: LoadedSheet | null): number {
  const frames = sheet?.manifest.clips.leap?.frames
  if (!frames?.length) return 0.32
  let ms = 0
  let on = false
  for (const frame of frames) {
    const ev = frame.events
    const takeoff = ev.includes('leap_takeoff') || ev.includes('takeoff')
    const land = ev.includes('leap_land') || ev.includes('land')
    if (takeoff) on = true
    if (on && land) break
    if (on) ms += frame.ms
  }
  return Math.max(0.18, ms / 1000)
}

function faceX(e: Enemy, dx: number): void {
  if (Math.abs(dx) > 4) e.anim.facing = dx > 0 ? 1 : -1
}

function lockLanding(world: World, e: Enemy, row: Live): void {
  row.fromX = e.x
  row.fromY = e.y
  row.toX = world.player.x
  row.toY = world.player.y
  faceX(e, row.toX - e.x)
}

function release(e: Enemy): void {
  const row = lives.get(e)
  if (!row) return
  if (row.counted) leaping = Math.max(0, leaping - 1)
  const span = row.row.cooldown
  cooldown.set(e, span[0] + Math.random() * (span[1] - span[0]))
  lives.delete(e)
}

function cancel(e: Enemy): void {
  const row = lives.get(e)
  if (!row) return
  if (row.counted) leaping = Math.max(0, leaping - 1)
  lives.delete(e)
}

function startAction(world: World, e: Enemy, row: Live): void {
  if (row.row.id === 'leap') {
    row.phase = 'leap'
    lockLanding(world, e, row)
    if (hasClip(sheetOf(e), 'leap')) restartActorClip(playKey(e), 'leap')
    return
  }
  row.phase = 'bite'
  const p = world.player
  const dx = p.x - e.x
  const dy = p.y - e.y
  const d = Math.hypot(dx, dy) || 1
  const step = clamp(d - (e.r + p.r + 6), 0, 52)
  row.dashing = step > 2
  row.dashT = 0
  row.dashDur = 0.12
  row.dashFromX = e.x
  row.dashFromY = e.y
  row.dashToX = e.x + (dx / d) * step
  row.dashToY = e.y + (dy / d) * step
  faceX(e, dx)
  if (hasClip(sheetOf(e), 'bite')) restartActorClip(playKey(e), 'bite')
}

function begin(world: World, e: Enemy, spec: SpecialRow): boolean {
  const sheet = sheetOf(e)
  if (spec.id === 'leap') {
    if (leaping >= MAX_LEAPING) return false
    if (!hasClip(sheet, 'leap')) return false
  } else if (!hasClip(sheet, 'bite')) return false
  const introName = spec.clips.find((name) => name !== 'leap' && name !== 'bite' && hasClip(sheet, name)) ?? null
  const crouch = spec.id === 'bite' ? Math.max(0, spec.telegraph / 1000 - 0.12) : 0
  const row: Live = {
    row: spec,
    phase: introName ? 'intro' : crouch > 0 ? 'crouch' : spec.id,
    introClip: introName,
    introT: 0,
    crouchT: 0,
    fromX: e.x,
    fromY: e.y,
    toX: e.x,
    toY: e.y,
    flightT: 0,
    flightDur: 0.32,
    airborne: false,
    tookOff: false,
    landed: false,
    hit: false,
    dashT: 0,
    dashDur: 0.12,
    dashing: false,
    dashFromX: e.x,
    dashFromY: e.y,
    dashToX: e.x,
    dashToY: e.y,
    counted: spec.id === 'leap',
  }
  if (spec.id === 'leap') leaping += 1
  lives.set(e, row)
  e.vx = 0
  e.vy = 0
  if (introName) {
    restartActorClip(playKey(e), introName)
    if (introName === 'scream') {
      addTrauma(world, 0.05, e.x - world.player.x, e.y - world.player.y)
    }
    return true
  }
  if (crouch > 0) {
    faceX(e, world.player.x - e.x)
    return true
  }
  startAction(world, e, row)
  return true
}

function blocked(e: Enemy): boolean {
  if (e.state === 'spawning' || e.state === 'dying' || e.hp <= 0) return true
  if (e.state === 'burrowing' || e.state === 'resurfacing' || e.state === 'peeling') return true
  if (e.state === 'windup' || e.state === 'charging' || e.state === 'shooting') return true
  if (familyHidden(e)) return true
  return false
}

function pickRow(e: Enemy, d: number): SpecialRow | null {
  const rows = specialsFor(e.kind)
  const bite = rows.find((row) => row.id === 'bite' && d >= row.range[0] && d <= row.range[1])
  const leap = rows.find((row) => row.id === 'leap' && d >= row.range[0] && d <= row.range[1])
  if (bite && leap) {
    const under = bite.preferUnder ?? bite.range[1]
    return d <= under ? bite : leap
  }
  return bite ?? leap ?? null
}

/** Advance or start a special. True while it owns locomotion. */
export function tickSpecial(world: World, e: Enemy, dt: number): boolean {
  if (e.state === 'dying' || e.hp <= 0) {
    cancel(e)
    return false
  }
  const row = lives.get(e)
  if (!row) {
    if (blocked(e) || world.player.hp <= 0) return false
    const left = (cooldown.get(e) ?? 0.8 + (e.uid % 7) * 0.12) - dt
    cooldown.set(e, left)
    if (left > 0) return false
    const spec = pickRow(e, dist(e.x, e.y, world.player.x, world.player.y))
    if (!spec) {
      cooldown.set(e, 0.2)
      return false
    }
    if (!begin(world, e, spec)) {
      cooldown.set(e, 0.35)
      return false
    }
    return true
  }

  if (row.phase === 'crouch') {
    e.vx = 0
    e.vy = 0
    faceX(e, world.player.x - e.x)
    row.crouchT += dt
    const need = Math.max(0, row.row.telegraph / 1000 - 0.12)
    if (row.crouchT >= need) startAction(world, e, row)
    return true
  }

  if (row.phase === 'intro') {
    e.vx = 0
    e.vy = 0
    row.introT += dt
    const clip = row.introClip
    const capped = row.row.introSec > 0 && row.introT >= row.row.introSec
    const done = !clip || capped || actorClipDone(playKey(e), clip)
    if (done) startAction(world, e, row)
    return true
  }

  if (row.phase === 'leap') {
    if (!row.airborne) {
      e.vx = 0
      e.vy = 0
      if (hasClip(sheetOf(e), 'leap') && actorClipDone(playKey(e), 'leap')) release(e)
      return lives.has(e)
    }
    row.flightT += dt
    const u = ease.inOutCubic(Math.min(1, row.flightT / Math.max(0.05, row.flightDur)))
    e.x = row.fromX + (row.toX - row.fromX) * u
    e.y = row.fromY + (row.toY - row.fromY) * u
    e.vx = 0
    e.vy = 0
    e.knock.x = 0
    e.knock.y = 0
    faceX(e, row.toX - row.fromX)
    return true
  }

  if (row.dashing) {
    row.dashT += dt
    const u = ease.outCubic(Math.min(1, row.dashT / Math.max(0.05, row.dashDur)))
    e.x = row.dashFromX + (row.dashToX - row.dashFromX) * u
    e.y = row.dashFromY + (row.dashToY - row.dashFromY) * u
    e.vx = 0
    e.vy = 0
    faceX(e, row.dashToX - row.dashFromX)
    if (u >= 1) row.dashing = false
  } else {
    e.vx = 0
    e.vy = 0
  }
  if (actorClipDone(playKey(e), 'bite')) release(e)
  return lives.has(e)
}

export function onSpecialEvents(world: World, e: Enemy, events: readonly string[], ctx: SimCtx): void {
  const row = lives.get(e)
  if (!row) return
  if ((events.includes('takeoff') || events.includes('leap_takeoff')) && !row.tookOff) {
    row.tookOff = true
    row.airborne = true
    row.flightT = 0
    row.fromX = e.x
    row.fromY = e.y
    row.flightDur = flightSeconds(sheetOf(e))
    spawnFunnyClip('dust', e.x, e.y + 6, { scale: CHAOS.sheets.drawScale * 0.7 })
  }
  if ((events.includes('land') || events.includes('leap_land')) && !row.landed) land(world, e, row, ctx)
  if (events.includes('leap_done')) release(e)
  if ((events.includes('bite_hit') || events.includes('attack_hit') || events.includes('hit')) && row.phase === 'bite' && !row.hit) {
    row.hit = true
    biteHit(world, e, ctx)
  }
  if (events.includes('bite_done')) release(e)
}

function land(world: World, e: Enemy, row: Live, ctx: SimCtx): void {
  row.landed = true
  const left = Math.hypot(row.toX - e.x, row.toY - e.y)
  if (left <= 14) {
    e.x = row.toX
    e.y = row.toY
    row.airborne = false
    row.flightT = row.flightDur
  }
  e.vx = 0
  e.vy = 0
  spawnFunnyClip('dust', e.x, e.y + 4, { scale: CHAOS.sheets.drawScale * 0.65 })
  ctx.render.fx.dust(e.x, e.y + e.r * 0.4, 0, 0)
  addTrauma(world, 0.07, e.x - world.player.x, e.y - world.player.y)
  const p = world.player
  if (dist(e.x, e.y, p.x, p.y) <= p.r + LEAP_HIT_PAD) {
    damagePlayer(world, e.damage, ctx, e.def.name, e)
  }
  ctx.audio.play('hit', { pitch: 0.62, gain: 0.35 })
}

function biteHit(world: World, e: Enemy, ctx: SimCtx): void {
  const p = world.player
  const reach = e.r + p.r + BITE_HIT_PAD
  if (dist(e.x, e.y, p.x, p.y) <= reach) {
    damagePlayer(world, e.damage, ctx, e.def.name, e)
  }
  ctx.render.fx.hitSpark(e.x + e.anim.facing * e.r * 0.7, e.y, e.anim.facing > 0 ? 0 : Math.PI, e.def.palette.accent)
}

/** @deprecated The old bean/pea hop. Kept so call sites read as one entry. */
export function maybeLeap(world: World, e: Enemy, dt: number, _ctx: SimCtx): boolean {
  return tickSpecial(world, e, dt)
}

export function leapEvents(e: Enemy, events: readonly string[], ctx: SimCtx, world?: World): void {
  if (!world) return
  onSpecialEvents(world, e, events, ctx)
}
