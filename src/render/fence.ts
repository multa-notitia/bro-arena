/**
 * Outer fence around the full unlockable plot (every bed, shut or open).
 * Placeholder posts and rails until `PERIMETER_FENCE.sheet` points at painted
 * art with the hedge clip names. No collision: the arena clamp is the wall.
 */
import { plotBounds } from '../data/beds.ts'
import { TAU } from '../core/math.ts'
import { h } from './groundHash.ts'
import { BARRIER_CLIPS, PERIMETER_FENCE } from './barrierArt.ts'
import type { BedDepth } from './beds.ts'
import { clipDrawScale, clipTileWorldPx, drawNamedClip, resolveSheet } from './sheets.ts'

const STEP = 64

function artSheet(): ReturnType<typeof resolveSheet> {
  if (!PERIMETER_FENCE.sheet) return null
  const sheet = resolveSheet([PERIMETER_FENCE.sheet])
  if (!sheet?.manifest.clips[BARRIER_CLIPS.h] || !sheet.manifest.clips[BARRIER_CLIPS.v]) return null
  return sheet
}

function pushArtRun(
  out: BedDepth[],
  sheet: NonNullable<ReturnType<typeof resolveSheet>>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  horizontal: boolean,
): void {
  const clip = horizontal ? BARRIER_CLIPS.h : BARRIER_CLIPS.v
  const step = Math.max(32, clipTileWorldPx(sheet, clip))
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const n = Math.max(1, Math.ceil(len / step))
  for (let i = 0; i < n; i++) {
    const t = i / n
    const x = x0 + dx * t
    const y = y0 + dy * t
    const sortY = horizontal ? y : y + len / n
    out.push({
      x,
      y: sortY,
      sortY,
      draw: (ctx) => {
        ctx.save()
        ctx.translate(x, y)
        drawNamedClip(ctx, sheet, `perimeter:${clip}:${i}:${horizontal ? y : x}`, clip, 0, {
          scale: clipDrawScale(sheet, clip),
        })
        ctx.restore()
      },
    })
  }
}

function rail(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#5c4030'
  ctx.lineWidth = 4.4
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.strokeStyle = '#a8845c'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x0, y0 - 0.7)
  ctx.lineTo(x1, y1 - 0.7)
  ctx.stroke()
  ctx.restore()
}

function post(ctx: CanvasRenderingContext2D, x: number, y: number, inwardX: number, inwardY: number): void {
  const jx = (h(Math.round(x), Math.round(y), 4) - 0.5) * 1.6
  const jy = (h(Math.round(x), Math.round(y), 5) - 0.5) * 1.2
  const tall = 16 + h(Math.round(x * 0.5), Math.round(y * 0.5), 6) * 6
  ctx.save()
  ctx.translate(x + jx + inwardX * 2, y + jy + inwardY * 2)
  ctx.fillStyle = 'rgba(36, 24, 14, 0.35)'
  ctx.beginPath()
  ctx.ellipse(0, 5, 5.2, 2.1, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#6b4a2e'
  ctx.fillRect(-3.4, -tall, 6.8, tall + 7)
  ctx.fillStyle = '#8f6844'
  ctx.fillRect(-3.4, -tall, 2.3, tall + 7)
  ctx.fillStyle = '#3a2818'
  ctx.fillRect(-3.6, -tall - 1.5, 7.2, 3)
  ctx.restore()
}

function pushPlaceholderRun(
  out: BedDepth[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inwardX: number,
  inwardY: number,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const n = Math.max(1, Math.round(len / STEP))
  const ux = dx / len
  const uy = dy / len
  for (let i = 0; i < n; i++) {
    const a = i / n
    const b = (i + 1) / n
    const ax = x0 + dx * a
    const ay = y0 + dy * a
    const bx = x0 + dx * b
    const by = y0 + dy * b
    const mx = (ax + bx) * 0.5
    const my = (ay + by) * 0.5
    const sortY = Math.max(ay, by)
    out.push({
      x: mx,
      y: my,
      sortY,
      draw: (ctx) => {
        const gap = h(i, Math.round(mx), Math.round(my), 8)
        const off = 7
        const ox = inwardX * off
        const oy = inwardY * off
        const px = -uy
        const py = ux
        rail(ctx, ax + ox + px * 5, ay + oy + py * 5, bx + ox + px * 5, by + oy + py * 5)
        if (gap > 0.18) rail(ctx, ax + ox - px * 4, ay + oy - py * 4, bx + ox - px * 4, by + oy - py * 4)
        post(ctx, ax, ay, inwardX, inwardY)
        if (i === n - 1) post(ctx, bx, by, inwardX, inwardY)
      },
    })
  }
}

/** Y-sorted with hedges and actors. One piece per bay, so a south run paints in front. */
export function perimeterFenceDepth(): BedDepth[] {
  const plot = plotBounds()
  const out: BedDepth[] = []
  const sheet = artSheet()
  const runs: [number, number, number, number, number, number, boolean][] = [
    [plot.minX, plot.minY, plot.maxX, plot.minY, 0, 1, true],
    [plot.maxX, plot.minY, plot.maxX, plot.maxY, -1, 0, false],
    [plot.maxX, plot.maxY, plot.minX, plot.maxY, 0, -1, true],
    [plot.minX, plot.maxY, plot.minX, plot.minY, 1, 0, false],
  ]
  for (const [x0, y0, x1, y1, ix, iy, horizontal] of runs) {
    if (sheet) pushArtRun(out, sheet, x0, y0, x1, y1, horizontal)
    else pushPlaceholderRun(out, x0, y0, x1, y1, ix, iy)
  }
  return out
}
