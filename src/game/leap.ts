import { dist, ease } from '../core/math.ts'
import { CHAOS, chaosOn } from '../data/chaos.ts'
import type { Enemy, World } from '../core/types.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { actorClipDone, clipHasEvent, clipPlayhead, restartActorClip } from '../render/sheets.ts'
import type { SimCtx } from './world.ts'

export interface LeapLive {
  airborne: boolean
  playing: boolean
  t: number
  dur: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  landed: boolean
  tookOff: boolean
}

const leaps = new WeakMap<Enemy, LeapLive>()

/** Visual lift from authored `meta.airOffsetY` (already negative-up). No extra arc. */
export function hopHeight(e: Enemy): number {
  const live = leaps.get(e)
  if (!live?.playing) return 0
  const sheet = resolveEnemySheet(e.kind, e.form)
  const list = sheet?.manifest.airOffsetY?.leap
  if (!list?.length) return 0
  const at = clipPlayhead(`e:${e.uid}`, sheet!, 'leap')
  const i = at ? at.index : 0
  const a = list[i] ?? 0
  const b = list[Math.min(i + 1, list.length - 1)] ?? a
  const oy = a + (b - a) * (at?.frac ?? 0)
  return -oy
}

export function isAirborne(e: Enemy): boolean {
  return leaps.get(e)?.airborne === true
}

export function isLeaping(e: Enemy): boolean {
  return leaps.get(e)?.playing === true
}

function playKey(e: Enemy): string {
  return `e:${e.uid}`
}

function leapDef(e: Enemy): { range: number; cooldown: number; duration: number; dist: number } | null {
  if (!chaosOn() || !CHAOS.leap.enabled) return null
  if (!e.def.leap && e.kind !== 'bean') return null
  const mud = e.form === 'nightmare'
  return {
    range: e.def.leap?.range ?? 190,
    cooldown: e.def.leap?.cooldown ?? CHAOS.leap.cooldown[0],
    duration: e.def.leap?.duration ?? CHAOS.leap.flight,
    dist: mud ? CHAOS.leap.mudDist : CHAOS.leap.lightDist,
  }
}

export function beginLeap(world: World, e: Enemy, ctx: SimCtx): boolean {
  const def = leapDef(e)
  if (!def) return false
  const p = world.player
  const d = dist(e.x, e.y, p.x, p.y)
  if (d < 36 || d > def.range) return false
  const ang = Math.atan2(p.y - e.y, p.x - e.x)
  const reach = Math.min(def.dist, d * 0.92)
  const live: LeapLive = {
    airborne: false,
    playing: true,
    t: 0,
    dur: Math.max(0.18, def.duration),
    fromX: e.x,
    fromY: e.y,
    toX: e.x + Math.cos(ang) * reach,
    toY: e.y + Math.sin(ang) * reach,
    landed: false,
    tookOff: false,
  }
  leaps.set(e, live)
  e.state = 'idle'
  e.vx = 0
  e.vy = 0
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (hasClip(sheet, 'leap')) restartActorClip(playKey(e), 'leap')
  else {
    live.tookOff = true
    live.airborne = true
  }
  ctx.audio.play('charge', { gain: 0.4, pitch: 1.4 })
  return true
}

export function tickLeap(e: Enemy, dt: number, ctx: SimCtx): boolean {
  const live = leaps.get(e)
  if (!live?.playing) return false
  if (!live.airborne) {
    if (hasClip(resolveEnemySheet(e.kind, e.form), 'leap') && actorClipDone(playKey(e), 'leap')) live.playing = false
    e.vx = 0
    e.vy = 0
    return live.playing
  }
  const sheet = resolveEnemySheet(e.kind, e.form)
  const keyed = playKey(e)
  const authored = hasClip(sheet, 'leap')

  if (authored && !live.tookOff) {
    e.vx = 0
    e.vy = 0
    if (sheet && !clipHasEvent(sheet, 'leap', 'takeoff')) live.tookOff = true
    if (sheet && actorClipDone(keyed, 'leap') && !live.landed) land(e, live, ctx)
    return true
  }

  live.t += dt
  const u = ease.inOutCubic(Math.min(1, live.t / live.dur))
  e.x = live.fromX + (live.toX - live.fromX) * u
  e.y = live.fromY + (live.toY - live.fromY) * u
  e.vx = 0
  e.vy = 0
  if (u >= 1) land(e, live, ctx)
  return true
}

export function leapEvents(e: Enemy, events: readonly string[], ctx: SimCtx): void {
  const live = leaps.get(e)
  if (!live) return
  if (events.includes('takeoff')) {
    live.tookOff = true
    live.airborne = true
    live.t = 0
    spawnFunnyClip('dust', e.x, e.y + 6, { scale: CHAOS.sheets.drawScale })
  }
  if (events.includes('land') && !live.landed) land(e, live, ctx)
}

function land(e: Enemy, live: LeapLive, ctx: SimCtx): void {
  if (live.landed) return
  live.landed = true
  live.airborne = false
  e.x = live.toX
  e.y = live.toY
  spawnFunnyClip('dust', e.x, e.y + 6, { scale: CHAOS.emerge.mudEruptScale })
  ctx.render.fx.shockwave(e.x, e.y, 22 + e.r * 0.25, e.def.palette.shade)
  ctx.audio.play('hit', { pitch: 0.55, gain: 0.45 })
  e.state = 'idle'
  const span = CHAOS.leap.cooldown
  e.cooldown = span[0] + Math.random() * (span[1] - span[0])
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (!hasClip(sheet, 'leap') || actorClipDone(playKey(e), 'leap')) live.playing = false
}

export function maybeLeap(world: World, e: Enemy, dt: number, ctx: SimCtx): boolean {
  if (tickLeap(e, dt, ctx)) return true
  const def = leapDef(e)
  if (!def) return false
  if (e.state === 'spawning' || e.state === 'dying' || e.state === 'screaming' || e.state === 'windup') return false
  if (e.def.behavior.type === 'kamikaze') return false
  e.cooldown -= dt
  if (e.cooldown > 0) return false
  const d = dist(e.x, e.y, world.player.x, world.player.y)
  if (d > def.range * 0.95 || d < 40) {
    e.cooldown = 0.15
    return false
  }
  return beginLeap(world, e, ctx)
}
