import { TAU, clamp, hashNoise, lerp } from '../core/math.ts'
import {
  granulate,
  inkStroke,
  makeCanvas,
  mixColor,
  n01,
  PAPER_CREAM,
  wash,
  wobbleBlob,
} from './watercolor.ts'

export const GROUND_TILE = 512
const BORDER_PAD = 96
const POST_SPACING = 120

const paddockTiles: HTMLCanvasElement[] = []
let sharedBase: HTMLCanvasElement | null = null
let outsideTile: HTMLCanvasElement | null = null
const borderCache = new Map<string, HTMLCanvasElement>()

function tilePx(q: number): number {
  return Math.round(GROUND_TILE * (q >= 2 ? 1.25 : 1))
}

function fibre(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  count: number,
  alpha: number,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x0 = n01(i, seed) * w
    const y0 = n01(i, seed + 1) * h
    const len = 16 + n01(i, seed + 2) * 64
    const ang = (n01(i, seed + 3) - 0.5) * 0.55
    ctx.globalAlpha = alpha * (0.45 + n01(i, seed + 4) * 0.55)
    ctx.strokeStyle = n01(i, seed + 5) > 0.55 ? '#6b5340' : '#c4b090'
    ctx.lineWidth = 0.4 + n01(i, seed + 6) * 1.15
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(
      x0 + Math.cos(ang) * len * 0.5,
      y0 + Math.sin(ang) * len * 0.5 + (n01(i, seed + 7) - 0.5) * 10,
      x0 + Math.cos(ang) * len,
      y0 + Math.sin(ang) * len,
    )
    ctx.stroke()
  }
  ctx.restore()
}

function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amount: number): void {
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const n = n01(x + y * 17, seed) * 0.5 + n01(x * 2 + y * 5, seed + 3) * 0.5
      const d = (n - 0.5) * amount
      data[i] = clamp((data[i] ?? 230) + d + n01(x, seed + 5) * 5, 0, 255)
      data[i + 1] = clamp((data[i + 1] ?? 220) + d * 0.88, 0, 255)
      data[i + 2] = clamp((data[i + 2] ?? 200) + d * 0.5 - 4, 0, 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

function wrappedOffsets(x: number, y: number, w: number, h: number, pad: number): [number, number][] {
  const xs = [x]
  const ys = [y]
  if (x < pad) xs.push(x + w)
  if (x > w - pad) xs.push(x - w)
  if (y < pad) ys.push(y + h)
  if (y > h - pad) ys.push(y - h)
  const out: [number, number][] = []
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) {
      const ox = xs[i]
      const oy = ys[j]
      if (ox === undefined || oy === undefined) continue
      out.push([ox, oy])
    }
  }
  return out
}

function washColor(i: number, seed: number): string {
  if (i % 4 === 0) return n01(i, seed) > 0.5 ? '#9a9a68' : '#8e9460'
  const warm = ['#d2b484', '#c8a878', '#d8c49a', '#c4a06a', '#b89a72', '#cbb892'] as const
  return warm[Math.floor(n01(i, seed + 1) * warm.length) % warm.length] ?? '#c8a878'
}

/** Filled irregular pigment blot — no concentric ring. Soft wet edge at ~0.35 body alpha. */
function stainAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  seed: number,
  alpha: number,
): void {
  const edge = wobbleBlob(x, y, rx * 1.18, ry * 1.2, seed, { n: 14, wobble: 0.55 })
  const body = wobbleBlob(x, y, rx, ry, seed + 2, { n: 13, wobble: 0.5 })
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.globalAlpha = alpha * 0.35
  ctx.fill(edge)
  ctx.globalAlpha = alpha
  ctx.fill(body)
  ctx.restore()
  ctx.save()
  ctx.clip(body)
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = alpha * 0.22
  ctx.fillStyle = mixColor(color, '#5a4830', 0.28)
  ctx.fill(wobbleBlob(x + rx * 0.08, y + ry * 0.3, rx * 0.58, ry * 0.36, seed + 5, { n: 8, wobble: 0.42 }))
  ctx.restore()
}

function stainWrap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  seed: number,
  alpha: number,
): void {
  const pad = Math.max(rx, ry) + 8
  const pts = wrappedOffsets(x, y, w, h, pad)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p) continue
    stainAt(ctx, p[0], p[1], rx, ry, color, seed, alpha)
  }
}

function paintSharedBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = mixColor(PAPER_CREAM, '#d8c89a', 0.16)
  ctx.fillRect(0, 0, w, h)
  paintGrain(ctx, w, h, 20, 34)
  fibre(ctx, w, h, 28, 90, 0.07)
  granulate(ctx, 0, 0, w, h, '#6b5340', { seed: 30, density: 520, alpha: 0.11 })
  granulate(ctx, 0, 0, w, h, '#c8b48a', { seed: 31, density: 180, alpha: 0.12 })

  for (let i = 0; i < 8; i++) {
    stainWrap(
      ctx,
      w,
      h,
      n01(i, 40) * w,
      n01(i, 41) * h,
      38 + n01(i, 42) * 42,
      24 + n01(i, 43) * 32,
      washColor(i, 44),
      50 + i,
      0.055,
    )
  }
  for (let i = 0; i < 4; i++) {
    stainWrap(
      ctx,
      w,
      h,
      n01(i, 80) * w,
      n01(i, 81) * h,
      22 + n01(i, 82) * 26,
      14 + n01(i, 83) * 18,
      '#6a5a38',
      90 + i,
      0.05,
    )
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#2e3a18'
  for (let i = 0; i < 36; i++) {
    const x = n01(i, 100) * w
    const y = n01(i, 101) * h
    const nStrokes = 2 + (n01(i, 102) > 0.5 ? 1 : 0)
    for (let s = 0; s < nStrokes; s++) {
      const a = -0.45 + n01(i + s, 103) * 0.9
      const len = 5 + n01(i + s, 104) * 9
      ctx.globalAlpha = 0.32 + n01(i + s, 105) * 0.22
      ctx.lineWidth = 0.95 + n01(i + s, 106) * 0.75
      const pts = wrappedOffsets(x + s * 2.2, y, w, h, 12)
      for (let p = 0; p < pts.length; p++) {
        const pt = pts[p]
        if (!pt) continue
        ctx.beginPath()
        ctx.moveTo(pt[0], pt[1])
        ctx.lineTo(pt[0] + Math.sin(a) * 1.5, pt[1] - len)
        ctx.stroke()
      }
    }
  }
  ctx.restore()

  for (let i = 0; i < 16; i++) {
    const x = n01(i, 120) * w
    const y = n01(i, 121) * h
    const pr = 2.4 + n01(i, 122) * 3.6
    const pts = wrappedOffsets(x, y, w, h, 8)
    for (let p = 0; p < pts.length; p++) {
      const pt = pts[p]
      if (!pt) continue
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#7a7468'
      ctx.fill(wobbleBlob(pt[0], pt[1], pr, pr * 0.72, 130 + i, { n: 6, wobble: 0.32 }))
      ctx.globalAlpha = 0.78
      ctx.fillStyle = '#241e16'
      ctx.beginPath()
      ctx.arc(pt[0] + 0.4, pt[1] + 0.3, 0.85, 0, TAU)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function getSharedBase(px: number): HTMLCanvasElement {
  if (sharedBase && sharedBase.width === px) return sharedBase
  const { canvas, ctx } = makeCanvas(px, px)
  if (ctx) paintSharedBase(ctx, px, px)
  sharedBase = canvas
  return canvas
}

function paintPaddockTile(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number): void {
  ctx.drawImage(getSharedBase(w), 0, 0)
  const m = 64
  for (let i = 0; i < 2; i++) {
    stainAt(
      ctx,
      m + n01(i, 140 + variant) * (w - m * 2),
      m + n01(i, 141 + variant) * (h - m * 2),
      22 + n01(i, 142) * 28,
      14 + n01(i, 143) * 20,
      washColor(i + variant, 144),
      150 + variant * 5 + i,
      0.05,
    )
  }
}

function paintOutsideTile(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#b39e78'
  ctx.fillRect(0, 0, w, h)
  paintGrain(ctx, w, h, 8, 26)
  fibre(ctx, w, h, 10, 50, 0.08)
  granulate(ctx, 0, 0, w, h, '#4a3c2c', { seed: 9, density: 340, alpha: 0.14 })
  for (let i = 0; i < 6; i++) {
    stainWrap(
      ctx,
      w,
      h,
      n01(i, 11) * w,
      n01(i, 12) * h,
      80 + n01(i, 13) * 90,
      55 + n01(i, 14) * 70,
      '#6e5c40',
      15 + i,
      0.34,
    )
  }
}

function paddockTile(variant: number, q: number): HTMLCanvasElement {
  const px = tilePx(q)
  const key = variant
  const hit = paddockTiles[key]
  if (hit && hit.width === px) return hit
  const { canvas, ctx } = makeCanvas(px, px)
  if (ctx) paintPaddockTile(ctx, px, px, variant)
  paddockTiles[key] = canvas
  return canvas
}

function getOutside(q: number): HTMLCanvasElement {
  const px = tilePx(q)
  if (outsideTile && outsideTile.width === px) return outsideTile
  const { canvas, ctx } = makeCanvas(px, px)
  if (ctx) paintOutsideTile(ctx, px, px)
  outsideTile = canvas
  return canvas
}

function paintFencePost(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  ctx.save()
  ctx.translate(x, y)
  wash(ctx, 0, 0, 4.8, 12, '#7a542e', { seed, shade: '#3a2410', n: 5, wobble: 0.1, passes: 2 })
  inkStroke(ctx, 0, 0, 5.2, 12.6, '#14100a', { seed, width: 1.5, n: 6, alpha: 0.88 })
  ctx.restore()
}

function walkEdge(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spacing: number,
  fn: (x: number, y: number, nx: number, ny: number, i: number) => void,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const n = Math.max(1, Math.round(len / spacing))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    fn(x0 + dx * t, y0 + dy * t, nx, ny, i)
  }
}

function paintBorderOverlay(ctx: CanvasRenderingContext2D, aw: number, ah: number, pad: number): void {
  const ox = pad
  const oy = pad
  const x0 = ox
  const y0 = oy
  const x1 = ox + aw * 2
  const y1 = oy + ah * 2

  const edges: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ]

  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]
    if (!edge) continue
    walkEdge(edge[0], edge[1], edge[2], edge[3], 16, (x, y, nx, ny, i) => {
      const out = -6 + n01(i, 38 + e) * 14
      const inn = 10 + n01(i, 39 + e) * 22
      stainAt(
        ctx,
        x + nx * inn + (n01(i, 44 + e) - 0.5) * 18,
        y + ny * inn + (n01(i, 45 + e) - 0.5) * 18,
        14 + n01(i, 40 + e) * 22,
        10 + n01(i, 41 + e) * 16,
        n01(i, 46) > 0.5 ? '#2f4a28' : '#3d5a32',
        200 + e * 17 + i,
        0.62,
      )
      stainAt(
        ctx,
        x + nx * out + (n01(i, 47 + e) - 0.5) * 10,
        y + ny * out,
        12 + n01(i, 48 + e) * 16,
        8 + n01(i, 49 + e) * 12,
        '#243820',
        260 + e * 13 + i,
        0.5,
      )
    })
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const loops: { inset: number; width: number; alpha: number; seed: number }[] = [
    { inset: 0, width: 4.2, alpha: 0.9, seed: 70 },
    { inset: 6, width: 2.2, alpha: 0.72, seed: 74 },
  ]
  for (let pass = 0; pass < loops.length; pass++) {
    const spec = loops[pass]
    if (!spec) continue
    const rx0 = x0 + spec.inset
    const ry0 = y0 + spec.inset
    const rx1 = x1 - spec.inset
    const ry1 = y1 - spec.inset
    const loop: [number, number, number, number][] = [
      [rx0, ry0, rx1, ry0],
      [rx1, ry0, rx1, ry1],
      [rx1, ry1, rx0, ry1],
      [rx0, ry1, rx0, ry0],
    ]
    ctx.strokeStyle = '#14100a'
    ctx.globalAlpha = spec.alpha
    for (let e = 0; e < 4; e++) {
      const edge = loop[e]
      if (!edge) continue
      const steps = 14
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = lerp(edge[0], edge[2], t) + (n01(i, spec.seed + e) - 0.5) * 11
        const y = lerp(edge[1], edge[3], t) + (n01(i, spec.seed + 1 + e) - 0.5) * 11
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineWidth = spec.width * (0.75 + n01(e, spec.seed + 9) * 0.5)
      ctx.stroke()
    }
  }
  ctx.restore()

  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]
    if (!edge) continue
    walkEdge(edge[0], edge[1], edge[2], edge[3], POST_SPACING, (x, y, nx, ny, i) => {
      if (i === 0) return
      paintFencePost(ctx, x + nx * 11, y + ny * 11, 300 + e * 20 + i)
    })
  }
}

function borderOverlay(aw: number, ah: number): HTMLCanvasElement {
  const key = `${aw}x${ah}`
  const hit = borderCache.get(key)
  if (hit) return hit
  const w = aw * 2 + BORDER_PAD * 2
  const h = ah * 2 + BORDER_PAD * 2
  const { canvas, ctx } = makeCanvas(w, h)
  if (ctx) paintBorderOverlay(ctx, aw, ah, BORDER_PAD)
  borderCache.set(key, canvas)
  return canvas
}

function tileFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pick: (tx: number, ty: number) => HTMLCanvasElement,
): void {
  const t0x = Math.floor(x / GROUND_TILE)
  const t0y = Math.floor(y / GROUND_TILE)
  const t1x = Math.floor((x + w) / GROUND_TILE)
  const t1y = Math.floor((y + h) / GROUND_TILE)
  for (let ty = t0y; ty <= t1y; ty++) {
    for (let tx = t0x; tx <= t1x; tx++) {
      ctx.drawImage(pick(tx, ty), tx * GROUND_TILE, ty * GROUND_TILE, GROUND_TILE, GROUND_TILE)
    }
  }
}

/** World-space paddock + outside + cached hedge/ink/posts. No per-frame path gen. */
export function drawPaddock(
  ctx: CanvasRenderingContext2D,
  viewL: number,
  viewT: number,
  viewW: number,
  viewH: number,
  aw: number,
  ah: number,
  q: number,
): void {
  const outside = getOutside(q)
  tileFill(ctx, viewL, viewT, viewW, viewH, () => outside)

  ctx.save()
  ctx.beginPath()
  ctx.rect(-aw, -ah, aw * 2, ah * 2)
  ctx.clip()
  tileFill(ctx, viewL, viewT, viewW, viewH, (tx, ty) => {
    const v = Math.floor(hashNoise(tx + 3, (ty + 11) | 0) * 4) % 4
    return paddockTile(v, q)
  })
  ctx.restore()

  const overlay = borderOverlay(aw, ah)
  ctx.drawImage(overlay, -aw - BORDER_PAD, -ah - BORDER_PAD)
}
