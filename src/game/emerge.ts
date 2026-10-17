import { CHAOS, chaosOn } from '../data/chaos.ts'
import type { Enemy } from '../core/types.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { actorClipDone, clipHasEvent, restartActorClip } from '../render/sheets.ts'
import type { SimCtx } from './world.ts'

const ready = new WeakSet<Enemy>()
const erupted = new WeakSet<Enemy>()
const vines = new WeakMap<Enemy, { x: number; y: number; alpha: number }>()

export function resetEmerge(): void {
  /* WeakSets drop with the enemies; kept as a wave-reset hook. */
}

export function collisionOn(e: Enemy): boolean {
  if (e.state === 'dying') return false
  if (e.state !== 'spawning') return true
  return ready.has(e)
}

export function vineOf(e: Enemy): { x: number; y: number; alpha: number } | null {
  return vines.get(e) ?? null
}

export function beginEmerge(e: Enemy): void {
  if (!chaosOn() || !CHAOS.emerge.enabled) {
    ready.add(e)
    return
  }
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (hasClip(sheet, 'emerge')) restartActorClip(`e:${e.uid}`, 'emerge')
  if (e.kind === 'tomato' && e.form !== 'nightmare' && hasClip(sheet, 'prop_vine')) {
    vines.set(e, { x: e.x, y: e.y, alpha: 1 })
  }
}

export function emergeEvents(e: Enemy, events: readonly string[], ctx: SimCtx): void {
  if (events.includes('emerge_fx') && !erupted.has(e)) {
    erupted.add(e)
    const plant = e.kind === 'tomato' || e.kind === 'bean'
    if (e.form === 'nightmare' || !plant) {
      spawnFunnyClip(CHAOS.sheets.mudErupt, e.x, e.y + 6, { scale: CHAOS.sheets.drawScale })
      if (e.form === 'nightmare') spawnFunnyClip('mud_hole', e.x, e.y + 4, { scale: CHAOS.sheets.drawScale })
    } else {
      spawnFunnyClip('dust', e.x, e.y + 6, { scale: CHAOS.sheets.drawScale })
    }
    ctx.audio.play('mudRise', { gain: 0.55, pitch: plant ? 1.25 : 1.1 })
  }
  if (events.includes('emerged')) ready.add(e)
}

export function tickVineFade(e: Enemy, dt: number): void {
  const v = vines.get(e)
  if (!v) return
  if (e.state === 'spawning') {
    v.alpha = 1
    return
  }
  v.alpha = Math.max(0, v.alpha - dt / CHAOS.sheets.vineFade)
  if (v.alpha <= 0) vines.delete(e)
}

export function tickEmerge(e: Enemy, dt: number, ctx: SimCtx): boolean {
  if (e.state !== 'spawning') {
    tickVineFade(e, dt)
    return false
  }
  e.stateT += dt
  const sheet = resolveEnemySheet(e.kind, e.form)
  const authored = hasClip(sheet, 'emerge')
  if (authored) {
    e.anim.spawnT = Math.min(1, 0.55 + e.stateT)
    if (sheet && !clipHasEvent(sheet, 'emerge', 'emerged') && actorClipDone(`e:${e.uid}`, 'emerge')) {
      ready.add(e)
    }
    if (!erupted.has(e) && sheet && !clipHasEvent(sheet, 'emerge', 'emerge_fx') && e.stateT > 0.12) {
      emergeEvents(e, ['emerge_fx'], ctx)
    }
  } else {
    const dur = chaosOn() ? CHAOS.emerge.fallbackSeconds : 0.35
    e.anim.spawnT = Math.min(1, e.stateT / dur)
    if (e.stateT >= dur * 0.45 && !erupted.has(e)) emergeEvents(e, ['emerge_fx'], ctx)
    if (e.stateT >= dur) ready.add(e)
  }
  if (ready.has(e)) {
    e.state = 'idle'
    e.anim.spawnT = 1
    if (!erupted.has(e)) emergeEvents(e, ['emerge_fx'], ctx)
    return false
  }
  return true
}
