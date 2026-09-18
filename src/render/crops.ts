import { TAU } from '../core/math.ts'
import type { CropId, Plot } from '../core/types.ts'
import { CROPS, GARDEN_ROW_COUNT, GARDEN_ROWS } from '../data/crops.ts'
import { inkStroke, makeCanvas, wash } from './watercolor.ts'

function furrow(ctx: CanvasRenderingContext2D, plots: readonly Plot[], row: number): void {
  const inRow = plots.filter((p) => p.row === row)
  if (inRow.length === 0) return
  let minX = Infinity
  let maxX = -Infinity
  let y = 0
  for (const p of inRow) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    y += p.y
  }
  y /= inRow.length
  const midX = (minX + maxX) / 2
  const halfW = (maxX - minX) / 2 + 70
  ctx.save()
  ctx.translate(midX, y + 8)
  ctx.fillStyle = 'rgba(48, 32, 16, 0.22)'
  ctx.beginPath()
  ctx.ellipse(0, 0, halfW, 22, 0, 0, TAU)
  ctx.fill()
  wash(ctx, 0, 0, halfW * 0.92, 18, '#6a4a28', {
    seed: 40 + row * 9,
    shade: '#3a2814',
    n: 10,
    wobble: 0.12,
    passes: 2,
  })
  ctx.strokeStyle = 'rgba(32, 20, 10, 0.35)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.ellipse(0, 0, halfW * 0.96, 19, 0, 0, TAU)
  ctx.stroke()
  const label = GARDEN_ROWS[row] ?? ''
  ctx.font = '700 15px Palatino, Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(243, 234, 216, 0.78)'
  ctx.beginPath()
  ctx.roundRect(-tw / 2 - 8, -36, tw + 16, 18, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(42, 33, 24, 0.82)'
  ctx.fillText(label, 0, -27)
  ctx.restore()
}

export function drawFarmRows(ctx: CanvasRenderingContext2D, plots: readonly Plot[]): void {
  for (let r = 0; r < GARDEN_ROW_COUNT; r++) furrow(ctx, plots, r)
}

function bed(ctx: CanvasRenderingContext2D, plot: Plot): void {
  ctx.save()
  ctx.translate(plot.x, plot.y)
  ctx.fillStyle = 'rgba(42, 28, 16, 0.28)'
  ctx.beginPath()
  ctx.ellipse(0, 6, 34, 14, 0, 0, TAU)
  ctx.fill()
  wash(ctx, 0, 4, 30, 12, '#6a4a28', { seed: plot.uid, shade: '#3a2814', n: 7, wobble: 0.16, passes: 2 })
  ctx.strokeStyle = 'rgba(32, 20, 10, 0.45)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(0, 4, 31, 12, 0, 0, TAU)
  ctx.stroke()
  if (!plot.crop) {
    ctx.strokeStyle = 'rgba(40, 26, 12, 0.35)'
    ctx.lineWidth = 1
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(-18, 2 + i * 4)
      ctx.lineTo(18, 3 + i * 4)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function peaPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.pea
  const h = 10 + g * 16
  ctx.save()
  ctx.rotate(Math.sin(sway * 1.4) * 0.08)
  ctx.strokeStyle = crop.shade
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.quadraticCurveTo(4, -h * 0.3, 0, -h)
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const u = (i + 1) / 3
    wash(ctx, Math.sin(i + uid) * 4, 4 - h * u, 5 + g * 2, 4.5 + g * 2, crop.body, {
      seed: uid + i,
      shade: crop.shade,
      n: 5,
      wobble: 0.2,
      passes: 2,
    })
  }
  ctx.restore()
}

function sproutPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.sprout
  const h = 14 + g * 18
  ctx.save()
  ctx.rotate(Math.sin(sway * 1.7) * 0.1)
  ctx.strokeStyle = crop.shade
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.lineTo(0, -h)
  ctx.stroke()
  wash(ctx, -8, -h * 0.55, 9 + g * 3, 5, crop.leaf, { seed: uid, shade: crop.shade, n: 5, wobble: 0.25, rotation: -0.6 })
  wash(ctx, 8, -h * 0.7, 9 + g * 3, 5, crop.body, { seed: uid + 2, shade: crop.shade, n: 5, wobble: 0.25, rotation: 0.55 })
  ctx.restore()
}

function carrotPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.carrot
  ctx.save()
  ctx.rotate(Math.sin(sway * 1.2) * 0.06)
  wash(ctx, 0, 2, 7 + g * 3, 6 + g * 4, crop.body, { seed: uid, shade: crop.shade, n: 6, wobble: 0.12, passes: 2 })
  ctx.strokeStyle = crop.leaf
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  const h = 10 + g * 14
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(0, -2)
    ctx.quadraticCurveTo(i * 8, -h * 0.45, i * 5, -h)
    ctx.stroke()
  }
  ctx.restore()
}

function garlicPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.garlic
  ctx.save()
  ctx.rotate(Math.sin(sway * 1.3) * 0.07)
  wash(ctx, 0, 3, 8 + g * 2, 7 + g * 3, crop.body, { seed: uid, shade: crop.shade, n: 6, wobble: 0.14, passes: 2 })
  ctx.strokeStyle = crop.leaf
  ctx.lineWidth = 1.7
  const h = 12 + g * 16
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(0, -2)
    ctx.quadraticCurveTo(i * 6, -h * 0.5, i * 3, -h)
    ctx.stroke()
  }
  ctx.restore()
}

function pumpkinPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.pumpkin
  ctx.save()
  ctx.rotate(Math.sin(sway * 0.9) * 0.05)
  wash(ctx, 0, 2, 10 + g * 5, 8 + g * 4, crop.body, { seed: uid, shade: crop.shade, n: 7, wobble: 0.12, passes: 2 })
  ctx.strokeStyle = crop.leaf
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(6, 0)
  ctx.quadraticCurveTo(14, -8 - g * 6, 18, -2)
  ctx.stroke()
  wash(ctx, 12, -6 - g * 4, 7, 4, crop.leaf, { seed: uid + 3, shade: crop.shade, n: 5, wobble: 0.2, rotation: 0.4 })
  ctx.restore()
}

function chiliPlant(ctx: CanvasRenderingContext2D, g: number, sway: number, uid: number): void {
  const crop = CROPS.chili
  ctx.save()
  ctx.rotate(Math.sin(sway * 1.5) * 0.08)
  const h = 8 + g * 14
  wash(ctx, 0, -h * 0.15, 5 + g * 2, 9 + g * 5, crop.body, {
    seed: uid,
    shade: crop.shade,
    n: 6,
    wobble: 0.16,
    rotation: 0.35,
    passes: 2,
  })
  ctx.strokeStyle = crop.leaf
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(-1, -h)
  ctx.quadraticCurveTo(6, -h - 6, 8, -h + 2)
  ctx.stroke()
  ctx.restore()
}

function foliage(ctx: CanvasRenderingContext2D, plot: Plot): void {
  if (!plot.crop) return
  ctx.save()
  ctx.translate(plot.x, plot.y)
  const g = plot.growth
  if (plot.crop === 'pea') peaPlant(ctx, g, plot.sway, plot.uid)
  else if (plot.crop === 'sprout') sproutPlant(ctx, g, plot.sway, plot.uid)
  else if (plot.crop === 'carrot') carrotPlant(ctx, g, plot.sway, plot.uid)
  else if (plot.crop === 'garlic') garlicPlant(ctx, g, plot.sway, plot.uid)
  else if (plot.crop === 'pumpkin') pumpkinPlant(ctx, g, plot.sway, plot.uid)
  else chiliPlant(ctx, g, plot.sway, plot.uid)
  inkStroke(ctx, 0, 2, 8, 6, '#2a1810', { seed: plot.uid, width: 0.8, n: 5, alpha: 0.35 })
  ctx.restore()
}

export function drawFarmBeds(ctx: CanvasRenderingContext2D, plots: readonly Plot[]): void {
  for (const p of plots) bed(ctx, p)
}

export function drawFarmPlant(ctx: CanvasRenderingContext2D, plot: Plot): void {
  foliage(ctx, plot)
}

export function paintSeedIcon(ctx: CanvasRenderingContext2D, crop: CropId): void {
  const c = CROPS[crop]
  wash(ctx, 0, 2, 7, 8, c.body, { seed: 21, shade: c.shade, n: 6, wobble: 0.18 })
  ctx.strokeStyle = c.leaf
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(1, -6)
  ctx.quadraticCurveTo(7, -12, 8, -5)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,245,0.55)'
  ctx.beginPath()
  ctx.ellipse(-2, -1, 2.2, 1.4, -0.5, 0, TAU)
  ctx.fill()
  inkStroke(ctx, 0, 2, 7.4, 8.6, '#1c140c', { seed: 21, width: 1.2, n: 6 })
}

const seedUrlCache = new Map<string, string>()

export function seedIconDataUrl(crop: CropId, size = 48): string {
  const key = `${crop}:${size}`
  const hit = seedUrlCache.get(key)
  if (hit) return hit
  const { canvas, ctx } = makeCanvas(size, size)
  if (ctx) {
    ctx.translate(size / 2, size / 2)
    const sc = size / 48
    ctx.scale(sc, sc)
    paintSeedIcon(ctx, crop)
  }
  const url = canvas.toDataURL('image/png')
  seedUrlCache.set(key, url)
  return url
}
