import { clamp } from '../core/math.ts'
import { BEDS, BED_SHEET, plotBounds, type BedDef, type BedId } from '../data/beds.ts'
import { bedOpenAmount, revealBedId } from '../game/beds.ts'
import { frameCell, resolveSheet } from './sheets.ts'

function sheetCell(id: string): HTMLCanvasElement | null {
  const sheet = resolveSheet([id])
  if (!sheet) return null
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  if (fw < 1 || fh < 1) return null
  return frameCell(sheet.img, `${sheet.id}:0`, 0, 0, fw, fh)
}

function fillTiled(
  ctx: CanvasRenderingContext2D,
  cell: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const tw = cell.width
  const th = cell.height
  if (tw < 1 || th < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  for (let ty = y; ty < y + h; ty += th) {
    for (let tx = x; tx < x + w; tx += tw) {
      ctx.drawImage(cell, tx, ty, tw, th)
    }
  }
  ctx.restore()
}

function paintSoil(ctx: CanvasRenderingContext2D, bed: BedDef, open: number): void {
  const soil = sheetCell(BED_SHEET.soil)
  if (soil) {
    fillTiled(ctx, soil, bed.x, bed.y, bed.w, bed.h)
  } else {
    ctx.fillStyle = open > 0.85 ? '#8d643c' : '#6a5344'
    ctx.fillRect(bed.x, bed.y, bed.w, bed.h)
    ctx.save()
    ctx.beginPath()
    ctx.rect(bed.x, bed.y, bed.w, bed.h)
    ctx.clip()
    ctx.strokeStyle = open > 0.85 ? '#6e4a2c' : '#514438'
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.55
    for (let y = bed.y + 18; y < bed.y + bed.h; y += 22) {
      ctx.beginPath()
      ctx.moveTo(bed.x + 10, y)
      ctx.lineTo(bed.x + bed.w - 10, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (open >= 1) return
  const locked = sheetCell(BED_SHEET.locked)
  ctx.save()
  ctx.globalAlpha = 1 - open
  if (locked) fillTiled(ctx, locked, bed.x, bed.y, bed.w, bed.h)
  else {
    ctx.fillStyle = 'rgba(28, 32, 26, 0.42)'
    ctx.fillRect(bed.x, bed.y, bed.w, bed.h)
  }
  ctx.restore()
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

function edgeKind(bed: BedDef, other: BedDef | null): 'fence' | 'hedge' | 'open' {
  if (!other) return 'fence'
  const a = bedOpenAmount(bed.id)
  const b = bedOpenAmount(other.id)
  if (a >= 1 && b >= 1) return 'open'
  if ((a > 0 && a < 1 && b >= 1) || (b > 0 && b < 1 && a >= 1)) return 'hedge'
  return 'hedge'
}

function hedgeScale(bed: BedDef, other: BedDef | null): number {
  if (!other) return 1
  const a = bedOpenAmount(bed.id)
  const b = bedOpenAmount(other.id)
  const opening = a > 0 && a < 1 ? a : b > 0 && b < 1 ? b : 0
  if (opening <= 0) return 1
  return 1 - opening
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  bed: BedDef,
  side: Side,
  kind: 'fence' | 'hedge',
  scale: number,
): void {
  if (scale <= 0.02) return
  const thick = kind === 'hedge' ? 26 : 14
  let x = bed.x
  let y = bed.y
  let w = bed.w
  let h = bed.h
  if (side === 'left') {
    w = thick
    x = bed.x
  } else if (side === 'right') {
    w = thick
    x = bed.x + bed.w - thick
  } else if (side === 'top') {
    h = thick
    y = bed.y
  } else {
    h = thick
    y = bed.y + bed.h - thick
  }

  const edge = sheetCell(kind === 'hedge' ? BED_SHEET.locked : BED_SHEET.edge)
  ctx.save()
  ctx.globalAlpha = 0.35 + 0.65 * scale
  if (edge && kind === 'fence') {
    fillTiled(ctx, edge, x, y, w, h)
    ctx.restore()
    return
  }
  if (kind === 'hedge') {
    ctx.fillStyle = '#2c5530'
    const bumps = side === 'left' || side === 'right' ? Math.ceil(h / 28) : Math.ceil(w / 28)
    for (let i = 0; i < bumps; i++) {
      if (side === 'left' || side === 'right') {
        const by = y + i * 28
        const bh = 34 * scale
        ctx.beginPath()
        ctx.ellipse(x + w * 0.5, by + 16, w * 0.55, Math.max(6, bh * 0.5), 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const bx = x + i * 28
        ctx.beginPath()
        ctx.ellipse(bx + 14, y + h * 0.55, 16, Math.max(6, thick * 0.45 * scale), 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = '#1d3a22'
    ctx.fillRect(x, y, w, Math.max(4, h * (side === 'top' || side === 'bottom' ? scale : 1)))
  } else {
    ctx.fillStyle = '#6a4528'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#3a2616'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  }
  ctx.restore()
}

function drawUnlock(ctx: CanvasRenderingContext2D, bed: BedDef, open: number): void {
  if (open <= 0 || open >= 1) return
  const cell = sheetCell(BED_SHEET.unlock)
  const seamX = clamp(0, bed.x, bed.x + bed.w)
  const into = bed.x + bed.w * 0.5 >= 0 ? 1 : -1
  const sweep = seamX + into * open * bed.w
  ctx.save()
  ctx.beginPath()
  ctx.rect(bed.x, bed.y, bed.w, bed.h)
  ctx.clip()
  ctx.globalAlpha = Math.sin(open * Math.PI) * 0.85
  if (cell) {
    const band = Math.max(72, cell.width)
    ctx.drawImage(cell, sweep - band * 0.5, bed.y, band, bed.h)
  } else {
    const grad = ctx.createLinearGradient(sweep - 70, 0, sweep + 70, 0)
    grad.addColorStop(0, 'rgba(243, 226, 176, 0)')
    grad.addColorStop(0.5, 'rgba(243, 226, 176, 0.9)')
    grad.addColorStop(1, 'rgba(243, 226, 176, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(sweep - 70, bed.y, 140, bed.h)
  }
  ctx.restore()
}

/** Placeholder beds. Painted sheets replace the rects when those ids load. */
export function drawGardenBeds(ctx: CanvasRenderingContext2D): void {
  const plot = plotBounds()
  ctx.save()
  ctx.fillStyle = 'rgba(12, 14, 10, 0.55)'
  ctx.beginPath()
  ctx.rect(plot.minX - 800, plot.minY - 800, plot.maxX - plot.minX + 1600, plot.maxY - plot.minY + 1600)
  ctx.rect(plot.minX, plot.minY, plot.maxX - plot.minX, plot.maxY - plot.minY)
  ctx.fill('evenodd')
  ctx.restore()

  const opening = revealBedId()
  for (const bed of BEDS) {
    const open = bedOpenAmount(bed.id as BedId)
    paintSoil(ctx, bed, open)
    if (bed.id === opening) drawUnlock(ctx, bed, open)
  }

  const drawn = new Set<string>()
  for (const bed of BEDS) {
    const sides: Side[] = ['left', 'right', 'top', 'bottom']
    for (const side of sides) {
      const other = neighbor(bed, side)
      const kind = edgeKind(bed, other)
      if (kind === 'open') continue
      const key = other
        ? [bed.id, other.id].sort().join(':') + ':' + (side === 'left' || side === 'right' ? 'v' : 'h')
        : `${bed.id}:${side}`
      if (drawn.has(key)) continue
      drawn.add(key)
      drawEdge(ctx, bed, side, kind === 'hedge' ? 'hedge' : 'fence', hedgeScale(bed, other))
    }
  }
}
