import { clamp } from '../core/math.ts'
import type { World } from '../core/types.ts'
import { BEDS, BED_OPEN_AT, BED_SHEET, bedMouth, type BedDef, type BedId } from '../data/beds.ts'
import { cameraShakeOffset } from '../feel.ts'
import { bedPhase, bedRevealAge } from '../game/beds.ts'
import { clipDrawScale, clipTileWorldPx, drawNamedClip, resolveSheet, seekActorClip } from './sheets.ts'
import { BARRIER_CLIPS, BED_BARRIER } from './barrierArt.ts'

/** Used only until the locked sheet has loaded. The live step comes from meta.tileWorldPx. */
const HEDGE_H_FALLBACK = 256
const HEDGE_V_FALLBACK = 174
const GATE_GAP = 136
const GATE_SIDE_FALLBACK = 162
const SIGN_DX = 92
const SHADE_SEC = 0.4
const HEDGE_STAGGER = 0.035
const HEDGE_MS = 600
const GATE_MS = 700
const FLUFF_MS = 500
const FLUFF_GAP = 0.06
const BAND = 110

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface BedDepth {
  x: number
  y: number
  sortY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

const depth: BedDepth[] = []

export function takeBedDepth(): BedDepth[] {
  const out = depth.slice()
  depth.length = 0
  return out
}

type Side = 'left' | 'right' | 'top' | 'bottom'

function neighbor(bed: BedDef, side: Side): BedDef | null {
  for (const other of BEDS) {
    if (other.id === bed.id) continue
    if (side === 'left' && Math.abs(other.x + other.w - bed.x) < 1.5 && overlapY(bed, other)) return other
    if (side === 'right' && Math.abs(other.x - (bed.x + bed.w)) < 1.5 && overlapY(bed, other)) return other
    if (side === 'top' && Math.abs(other.y + other.h - bed.y) < 1.5 && overlapX(bed, other)) return other
    if (side === 'bottom' && Math.abs(other.y - (bed.y + bed.h)) < 1.5 && overlapX(bed, other)) return other
  }
  return null
}

function overlapX(a: BedDef, b: BedDef): boolean {
  return a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1
}

function overlapY(a: BedDef, b: BedDef): boolean {
  return a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1
}

/**
 * One hedge per seam. The westward or northward bed owns it, until that bed
 * is open. Then the bed that is still shut picks the seam up.
 */
function ownsSeam(bed: BedDef, side: Side): boolean {
  if (bedPhase(bed.id) === 'open') return false
  const other = neighbor(bed, side)
  if (!other || other.cost <= 0) return true
  const usual = side === 'left' || side === 'right' ? bed.x < other.x : bed.y < other.y
  if (usual) return true
  return bedPhase(other.id) === 'open'
}

function shadeOf(id: BedId): number {
  if (bedPhase(id) === 'open') return 0
  const age = bedRevealAge()
  if (!age || age.id !== id || age.t < BED_OPEN_AT) return 1
  return clamp(1 - (age.t - BED_OPEN_AT) / SHADE_SEC, 0, 1)
}

function u01(n: number): number {
  let x = Math.imul(n | 0, 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

function tileStep(sheetId: string, clip: string, fallback: number): number {
  const sheet = resolveSheet([sheetId])
  if (!sheet) return fallback
  return clipTileWorldPx(sheet, clip)
}

function queue(x: number, y: number, sortY: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
  depth.push({ x, y, sortY, draw })
}

function paint(
  sheetId: string,
  clip: string,
  x: number,
  y: number,
  key: string,
  elapsedMs: number | null,
  alpha: number,
  rect: Rect | null,
  sortY: number,
  facing: 1 | -1 = 1,
): void {
  if (alpha <= 0.01) return
  if (rect && (rect.w < 0.5 || rect.h < 0.5)) return
  const sheet = resolveSheet([sheetId])
  if (!sheet?.manifest.clips[clip]) return
  queue(x, y, sortY, (g) => {
    if (elapsedMs != null) seekActorClip(key, clip, elapsedMs)
    const run = () => {
      g.save()
      g.translate(x, y)
      g.globalAlpha *= alpha
      drawNamedClip(g, sheet, key, clip, 0, { scale: clipDrawScale(sheet, clip), facing })
      g.restore()
    }
    if (!rect) {
      run()
      return
    }
    g.save()
    g.beginPath()
    g.rect(rect.x, rect.y, rect.w, rect.h)
    g.clip()
    run()
    g.restore()
  })
}

function hSpans(x0: number, x1: number, step: number, gap: [number, number] | null, fn: (tileX: number, a: number, b: number) => void): void {
  for (let x = x0; x < x1 - 0.5; x += step) {
    const a = x
    const b = Math.min(x + step, x1)
    if (!gap || b <= gap[0] || a >= gap[1]) {
      fn(x, a, b)
      continue
    }
    if (a < gap[0]) fn(x, a, Math.min(b, gap[0]))
    if (b > gap[1]) fn(x, Math.max(a, gap[1]), b)
  }
}

function vSpans(y0: number, y1: number, step: number, gap: [number, number] | null, fn: (tileY: number, a: number, b: number) => void): void {
  for (let y = y0; y < y1 - 0.5; y += step) {
    const a = y
    const b = Math.min(y + step, y1)
    if (!gap || b <= gap[0] || a >= gap[1]) {
      fn(y, a, b)
      continue
    }
    if (a < gap[0]) fn(y, a, Math.min(b, gap[0]))
    if (b > gap[1]) fn(y, Math.max(a, gap[1]), b)
  }
}

interface Seg {
  clip: 'hedge_h' | 'hedge_v'
  collapse: 'hedge_h_collapse' | 'hedge_v_collapse'
  x: number
  y: number
  rect: Rect | null
  dist: number
  sortY: number
}

function hedgeSegs(bed: BedDef): Seg[] {
  const out: Seg[] = []
  if (bed.cost <= 0 || bedPhase(bed.id) === 'open') return out
  const mouth = bedMouth(bed)
  const hedgeH = tileStep(BED_BARRIER.locked, BARRIER_CLIPS.h, HEDGE_H_FALLBACK)
  const hedgeV = tileStep(BED_BARRIER.locked, BARRIER_CLIPS.v, HEDGE_V_FALLBACK)
  const sideGap = tileStep(BED_BARRIER.locked, BARRIER_CLIPS.gateSide, GATE_SIDE_FALLBACK)
  const gap = (side: Side): [number, number] | null => {
    if (!bed.gate || bed.gate !== side) return null
    if (side === 'left' || side === 'right') {
      const gy = bed.y + bed.h * 0.5
      return [gy - sideGap * 0.5, gy + sideGap * 0.5]
    }
    const gx = bed.x + bed.w * 0.5
    return [gx - GATE_GAP * 0.5, gx + GATE_GAP * 0.5]
  }
  const sides: Side[] = ['top', 'bottom', 'left', 'right']
  for (const side of sides) {
    if (!ownsSeam(bed, side)) continue
    if (side === 'top' || side === 'bottom') {
      const y = side === 'top' ? bed.y : bed.y + bed.h
      hSpans(bed.x, bed.x + bed.w, hedgeH, gap(side), (tileX, a, b) => {
        const mid = (a + b) * 0.5
        out.push({
          clip: BARRIER_CLIPS.h,
          collapse: BARRIER_CLIPS.hCollapse,
          x: tileX,
          y,
          rect: { x: a, y: y - 170, w: b - a, h: 240 },
          dist: Math.hypot(mid - mouth.x, y - mouth.y),
          sortY: y + 0.2,
        })
      })
      continue
    }
    const x = side === 'left' ? bed.x : bed.x + bed.w
    const y1 = bed.y + bed.h
    vSpans(bed.y, y1, hedgeV, gap(side), (tileY, a, b) => {
      const partial = b - a < hedgeV - 0.5
      out.push({
        clip: BARRIER_CLIPS.v,
        collapse: BARRIER_CLIPS.vCollapse,
        x,
        y: tileY,
        rect: partial ? { x: x - 80, y: a - 48, w: 160, h: Math.max(1, b - a) + 48 } : null,
        dist: Math.hypot(x - mouth.x, b - mouth.y),
        sortY: b,
      })
    })
  }
  return out
}

function drawHedges(bed: BedDef): void {
  const segs = hedgeSegs(bed)
  const age = bedRevealAge()
  const opening = age?.id === bed.id ? age.t : null
  const bands = [...new Set(segs.map((s) => Math.round(s.dist / BAND)))].sort((a, b) => a - b)
  const rank = new Map(bands.map((b, i) => [b, i]))
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    const delay = (rank.get(Math.round(seg.dist / BAND)) ?? 0) * HEDGE_STAGGER
    let clip: string = seg.clip
    let elapsed: number | null = null
    if (opening != null) {
      const start = BED_OPEN_AT + delay
      if (opening >= start + HEDGE_MS / 1000) continue
      if (opening >= start) {
        clip = seg.collapse
        elapsed = (opening - start) * 1000
      }
    }
    paint(
      clip === seg.clip ? BED_BARRIER.locked : BED_BARRIER.reveal,
      clip,
      seg.x,
      seg.y,
      `hedge:${bed.id}:${i}`,
      elapsed,
      1,
      seg.rect,
      seg.sortY,
    )
  }
}

function drawGate(bed: BedDef): void {
  if (!bed.gate || bedPhase(bed.id) === 'open') return
  const mouth = bedMouth(bed)
  const side = bed.gate === 'left' || bed.gate === 'right'
  const gateLen = side ? tileStep(BED_BARRIER.locked, BARRIER_CLIPS.gateSide, GATE_SIDE_FALLBACK) : 0
  const x = mouth.x
  const y = side ? mouth.y - gateLen * 0.5 : mouth.y
  const face: 1 | -1 = bed.gate === 'left' ? -1 : 1
  const lockedClip = side ? BARRIER_CLIPS.gateSide : BARRIER_CLIPS.gate
  const openClip = side ? BARRIER_CLIPS.gateSideOpen : BARRIER_CLIPS.gateOpen
  const sortY = side ? y + gateLen : mouth.y + 0.45
  const age = bedRevealAge()
  const opening = age?.id === bed.id ? age.t : null
  if (opening != null) {
    if (opening < GATE_MS / 1000) {
      paint(BED_BARRIER.reveal, openClip, x, y, `gate:${bed.id}`, opening * 1000, 1, null, sortY, face)
    }
  } else {
    paint(BED_BARRIER.locked, lockedClip, x, y, `gate:${bed.id}`, null, 1, null, sortY, face)
  }
  const signA = opening == null ? 1 : shadeOf(bed.id)
  const signX = side ? x + (bed.gate === 'left' ? -SIGN_DX : SIGN_DX) : mouth.x + SIGN_DX
  const signY = side ? mouth.y : mouth.y
  paint(BED_BARRIER.locked, BARRIER_CLIPS.sign, signX, signY, `sign:${bed.id}`, null, signA, null, (side ? mouth.y : mouth.y) + 0.55, 1)
}

function drawFluff(bed: BedDef): void {
  const age = bedRevealAge()
  if (!age || age.id !== bed.id) return
  const seed = bed.id.charCodeAt(0) + bed.rows.length
  const n = 3 + (seed % 3)
  for (let i = 0; i < n; i++) {
    const start = BED_OPEN_AT + i * FLUFF_GAP
    if (age.t < start || age.t > start + FLUFF_MS / 1000) continue
    const x = bed.x + 56 + u01(seed * 19 + i) * (bed.w - 112)
    const y = bed.y + 48 + u01(seed * 23 + i * 7) * (bed.h - 96)
    paint(BED_SHEET.unlock, 'soil_fluff', x, y, `fluff:${bed.id}:${i}`, (age.t - start) * 1000, 1, null, y + 0.3)
  }
}

/** Wooden fence around any bed that is still shut. Raised soil is drawn with the floor. */
export function drawGardenBeds(ctx: CanvasRenderingContext2D): void {
  depth.length = 0
  void ctx
  for (const bed of BEDS) {
    if (bed.cost <= 0) continue
    drawHedges(bed)
    drawGate(bed)
    drawFluff(bed)
  }
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#f4e4bc'
  ctx.fillStyle = '#f4e4bc'
  ctx.lineWidth = 1.75
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.arc(0, -1, 4.2, Math.PI, 0)
  ctx.stroke()
  plate(ctx, -6.5, -1.5, 13, 10, 2)
  ctx.fill()
  ctx.restore()
}

/** Screen-space padlock and price, so a locked bed stays readable when zoomed out. */
export function drawBedBadges(ctx: CanvasRenderingContext2D, world: World, cssW: number, cssH: number): void {
  const cam = world.camera
  const zoom = cam.zoom > 0 ? cam.zoom : 1
  const shake = cameraShakeOffset(world)
  const left = cam.x - shake.x - cssW / (2 * zoom)
  const top = cam.y - shake.y - cssH / (2 * zoom)
  const right = left + cssW / zoom
  const bottom = top + cssH / zoom
  ctx.save()
  ctx.font = '700 15px Palatino, Georgia, serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const bed of BEDS) {
    if (bed.cost <= 0 || bedPhase(bed.id) === 'open') continue
    const alpha = bedPhase(bed.id) === 'opening' ? shadeOf(bed.id) : 1
    if (alpha < 0.04) continue
    const x0 = Math.max(bed.x, left)
    const y0 = Math.max(bed.y, top)
    const x1 = Math.min(bed.x + bed.w, right)
    const y1 = Math.min(bed.y + bed.h, bottom)
    if (x1 - x0 < 12 || y1 - y0 < 12) continue
    const wx = (x0 + x1) * 0.5
    const wy = (y0 + y1) * 0.5
    const sx = cssW * 0.5 + (wx - cam.x + shake.x) * zoom
    const sy = cssH * 0.5 + (wy - cam.y + shake.y) * zoom
    const label = String(bed.cost)
    const tw = ctx.measureText(label).width
    const w = 36 + tw
    const h = 26
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(Math.round(sx - w * 0.5), Math.round(sy - h * 0.5))
    ctx.fillStyle = 'rgba(18, 22, 16, 0.88)'
    ctx.strokeStyle = 'rgba(243, 226, 176, 0.85)'
    ctx.lineWidth = 1.5
    plate(ctx, 0, 0, w, h, 8)
    ctx.fill()
    ctx.stroke()
    drawLock(ctx, 14, 13)
    ctx.fillStyle = '#f6edd4'
    ctx.fillText(label, 26, 13)
    ctx.restore()
  }
  ctx.restore()
}
