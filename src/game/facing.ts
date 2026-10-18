import { clamp } from '../core/math.ts'
import { CHAOS } from '../data/chaos.ts'
import { enemyFamily } from '../data/enemies.ts'
import type { Enemy } from '../core/types.ts'
import { familyPeeled } from './families.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { actorClipDone, restartActorClip } from '../render/sheets.ts'

interface FaceLive {
  hold: number
  pending: 1 | -1
  turning: boolean
  /** Clip actually playing (`turn` or `turn_peeled`). */
  clip: string
}

const faces = new WeakMap<Enemy, FaceLive>()

function live(e: Enemy): FaceLive {
  let row = faces.get(e)
  if (!row) {
    row = { hold: 0, pending: e.anim.facing < 0 ? -1 : 1, turning: false, clip: 'turn' }
    faces.set(e, row)
  }
  return row
}

function playKey(e: Enemy): string {
  return `e:${e.uid}`
}

/** Legacy front sheets with no `meta.facing`. Painted side views are not in here. */
const LEGACY_FRONT_SHEETS = new Set(['enemy-blob', 'enemy-charger', 'enemy-eliteBlob'])

/** Front-painted bodies lean. Side-view sheets mirror and play `turn`. */
export function sheetIsFront(e: Enemy): boolean {
  const sheet = resolveEnemySheet(e.kind, e.form)
  const authored = sheet?.manifest.facing
  if (authored === 'front') return true
  if (authored === 'right') return false
  if (sheet && LEGACY_FRONT_SHEETS.has(sheet.id)) return true
  return (CHAOS.pace.frontFamilies as readonly string[]).includes(enemyFamily(e.kind))
}

/** `turn_peeled` while an onion-light has shed its skin. Otherwise `turn`. */
function turnName(e: Enemy): string | null {
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (familyPeeled(e) && hasClip(sheet, 'turn_peeled')) return 'turn_peeled'
  if (hasClip(sheet, 'turn')) return 'turn'
  return null
}

/**
 * The turn sheet is painted for the destination side. Frames before `turn_done`
 * are already the old side, so the mirror is the new facing for the whole clip
 * and is not changed again until that clip ends.
 */
function beginTurn(e: Enemy, want: 1 | -1): void {
  const row = live(e)
  const name = turnName(e)
  e.anim.facing = want
  row.pending = want
  row.hold = 0
  if (!name || e.state === 'dying' || e.state === 'spawning') {
    row.turning = false
    return
  }
  row.turning = true
  row.clip = name
  restartActorClip(playKey(e), name)
}

/**
 * Flip to the horizontal travel sign after a short dead-zone and hold.
 * A windup or shot that changes side plays the same turn. The mirror stays
 * put until the clip finishes, which is the `turn_done` frame.
 */
export function tickFacing(e: Enemy, dt: number, attackAim: boolean): void {
  const row = live(e)
  if (row.turning) {
    if (actorClipDone(playKey(e), row.clip)) row.turning = false
    else return
  }
  let want: 1 | -1 | null = null
  if (attackAim && Math.abs(e.aim.x) + Math.abs(e.aim.y) > 0.01) {
    want = e.aim.x >= 0 ? 1 : -1
  } else if (Math.abs(e.vx) >= CHAOS.pace.faceDead) {
    want = e.vx > 0 ? 1 : -1
  } else {
    row.hold = 0
    return
  }
  if (want === e.anim.facing) {
    row.hold = 0
    row.pending = want
    return
  }
  if (!attackAim) {
    if (want !== row.pending) {
      row.pending = want
      row.hold = 0
    }
    row.hold += dt
    if (row.hold < CHAOS.pace.faceHold) return
  }
  beginTurn(e, want)
}

export function turnClip(e: Enemy): string | null {
  const row = faces.get(e)
  if (!row?.turning) return null
  if (actorClipDone(playKey(e), row.clip)) {
    row.turning = false
    return null
  }
  return row.clip
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
