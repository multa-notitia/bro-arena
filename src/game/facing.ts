import { clamp } from '../core/math.ts'
import { CHAOS } from '../data/chaos.ts'
import { enemyFamily, variantTone } from '../data/enemies.ts'
import type { Enemy } from '../core/types.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { actorClipDone, restartActorClip } from '../render/sheets.ts'

interface FaceLive {
  hold: number
  pending: 1 | -1
  turning: boolean
}

const faces = new WeakMap<Enemy, FaceLive>()

function live(e: Enemy): FaceLive {
  let row = faces.get(e)
  if (!row) {
    row = { hold: 0, pending: e.anim.facing < 0 ? -1 : 1, turning: false }
    faces.set(e, row)
  }
  return row
}

function playKey(e: Enemy): string {
  return `e:${e.uid}`
}

/** Front-painted bodies lean. Side-view sheets (beetle included) mirror. */
export function sheetIsFront(e: Enemy): boolean {
  const sheet = resolveEnemySheet(e.kind, e.form)
  const authored = sheet?.manifest.facing
  if (authored === 'front') return true
  if (authored === 'right') return false
  const fam = enemyFamily(e.kind)
  if (fam === 'pea') return variantTone(e.kind) === 'mud'
  return (CHAOS.pace.frontFamilies as readonly string[]).includes(fam)
}

/**
 * Flip to the horizontal travel sign after a short dead-zone and hold.
 * `attackAim` keeps windup / shots pointed at the hero.
 */
export function tickFacing(e: Enemy, dt: number, attackAim: boolean): void {
  const row = live(e)
  if (row.turning) {
    if (!hasClip(resolveEnemySheet(e.kind, e.form), 'turn') || actorClipDone(playKey(e), 'turn')) {
      row.turning = false
    }
  }
  if (attackAim) {
    if (Math.abs(e.aim.x) + Math.abs(e.aim.y) > 0.01) e.anim.facing = e.aim.x >= 0 ? 1 : -1
    row.hold = 0
    return
  }
  if (Math.abs(e.vx) < CHAOS.pace.faceDead) {
    row.hold = 0
    return
  }
  const want: 1 | -1 = e.vx > 0 ? 1 : -1
  if (want === e.anim.facing) {
    row.hold = 0
    row.pending = want
    return
  }
  if (want !== row.pending) {
    row.pending = want
    row.hold = 0
  }
  row.hold += dt
  if (row.hold < CHAOS.pace.faceHold) return
  e.anim.facing = want
  row.hold = 0
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (hasClip(sheet, 'turn') && e.state !== 'dying' && e.state !== 'spawning') {
    row.turning = true
    restartActorClip(playKey(e), 'turn')
  }
}

export function turnClip(e: Enemy): 'turn' | null {
  const row = faces.get(e)
  if (!row?.turning) return null
  if (actorClipDone(playKey(e), 'turn')) {
    row.turning = false
    return null
  }
  return 'turn'
}

/** Radians, leaning into horizontal travel. Zero while a turn plays. */
export function motionTilt(e: Enemy): number {
  if (faces.get(e)?.turning) return 0
  if (e.state === 'dying' || e.state === 'spawning') return 0
  const speed = Math.hypot(e.vx, e.vy)
  if (speed < CHAOS.pace.faceDead) return 0
  const mag = clamp(e.vx / Math.max(40, e.speed), -1, 1)
  const gain = sheetIsFront(e) ? CHAOS.pace.tiltFront : CHAOS.pace.tiltSide
  return mag * gain
}

/** Side-to-side step on front-facing sheets. Side crawls stay on the mirror. */
export function frontWaddle(e: Enemy): number {
  if (!sheetIsFront(e) || faces.get(e)?.turning) return 0
  const speed = Math.hypot(e.vx, e.vy)
  if (speed < CHAOS.pace.faceDead) return 0
  const amp = clamp(speed / Math.max(40, e.speed), 0, 1)
  return Math.sin(e.anim.t * 9) * CHAOS.pace.waddleFront * amp
}
