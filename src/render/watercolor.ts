import { TAU, clamp, hashNoise, lerp } from '../core/math.ts'

export const PAPER_CREAM = '#efe6d0'
export const PAPER_INK = '#2a221c'
export const PAPER_WARM = '#e8d5b0'

export interface Pt {
  x: number
  y: number
}

export interface BlobOpts {
  n?: number
  wobble?: number
  rotation?: number
}

export interface WashOpts extends BlobOpts {
  seed?: number
  shade?: string
  passes?: number
  alpha?: number
}

export interface InkOpts extends BlobOpts {
  seed?: number
  width?: number
  alpha?: number
  close?: number
}

export interface SplatOpts {
  seed?: number
  count?: number
}

export interface GranulateOpts {
  seed?: number
  density?: number
  alpha?: number
}

const paperTiles = new Map<string, HTMLCanvasElement>()

export function parseRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim()
  if (c.charAt(0) === '#') {
    let h = c.slice(1)
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2)
    }
    const n = parseInt(h, 16)
    if (Number.isFinite(n)) {
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
  }
  const m = c.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/)
  if (m) {
    return { r: Number(m[1]) || 0, g: Number(m[2]) || 0, b: Number(m[3]) || 0 }
  }
  return { r: 42, g: 34, b: 28 }
}

export function rgba(color: string, a: number): string {
  const { r, g, b } = parseRgb(color)
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`
}

export function mixColor(a: string, b: string, t: number): string {
  const A = parseRgb(a)
  const B = parseRgb(b)
  const k = clamp(t, 0, 1)
  return `rgb(${Math.round(lerp(A.r, B.r, k))},${Math.round(lerp(A.g, B.g, k))},${Math.round(lerp(A.b, B.b, k))})`
}

export function darken(color: string, k: number): string {
  const { r, g, b } = parseRgb(color)
  const t = clamp(k, 0, 1)
  return `rgb(${Math.round(r * (1 - t))},${Math.round(g * (1 - t))},${Math.round(b * (1 - t))})`
}

export function lighten(color: string, k: number): string {
  const { r, g, b } = parseRgb(color)
  const t = clamp(k, 0, 1)
  return `rgb(${Math.round(lerp(r, 255, t))},${Math.round(lerp(g, 255, t))},${Math.round(lerp(b, 255, t))})`
}

export function n01(i: number, seed: number): number {
  return hashNoise(i | 0, seed | 0)
}

/** Wobbly closed polygon around an ellipse, seeded via hashNoise. */
export function blobPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  opts?: BlobOpts,
): Pt[] {
  const n = Math.max(5, opts?.n ?? 9)
  const wobble = opts?.wobble ?? 0.16
  const rot = opts?.rotation ?? 0
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU
    const rr = lerp(1 - wobble, 1 + wobble, n01(i * 3, seed))
    const jt = (n01(i * 3 + 1, seed) - 0.5) * wobble * 0.45
    const jr = (n01(i * 3 + 2, seed) - 0.5) * wobble * 0.25
    pts.push({
      x: cx + Math.cos(a) * rx * (rr + jr) - Math.sin(a) * ry * jt,
      y: cy + Math.sin(a) * ry * (rr + jr) + Math.cos(a) * rx * jt,
    })
  }
  return pts
}

export function smoothPath(pts: readonly Pt[]): Path2D {
  const path = new Path2D()
  const n = pts.length
  if (n < 3) return path
  const last = pts[n - 1]
  const first = pts[0]
  if (!last || !first) return path
  path.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5)
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (!a || !b) continue
    path.quadraticCurveTo(a.x, a.y, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5)
  }
  path.closePath()
  return path
}

export function wobbleBlob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  opts?: BlobOpts,
): Path2D {
  return smoothPath(blobPoints(cx, cy, rx, ry, seed, opts))
}

/** Alias used by painters. */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  opts?: BlobOpts,
): Path2D {
  return wobbleBlob(cx, cy, rx, ry, seed, opts)
}

/**
 * Wet-on-wet wash: several low-alpha fills with slightly different wobble,
 * then a darker pooled edge ring (paint collecting at the rim / gravity side).
 */
export function wash(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opts?: WashOpts,
): void {
  const seed = opts?.seed ?? 1
  const shade = opts?.shade ?? darken(color, 0.36)
  const passes = opts?.passes ?? 4
  const baseAlpha = opts?.alpha ?? 1
  const n = opts?.n ?? 9
  const wobble = opts?.wobble ?? 0.16
  const rot = opts?.rotation ?? 0

  ctx.save()
  for (let p = 0; p < passes; p++) {
    const grow = 1.08 - p * 0.045
    const ox = (n01(p, seed + 40) - 0.5) * rx * 0.08
    const oy = (n01(p, seed + 41) - 0.5) * ry * 0.08 + (p === 0 ? ry * 0.04 : 0)
    const path = wobbleBlob(cx + ox, cy + oy, rx * grow, ry * grow, seed + p * 19, {
      n: n + (p % 2),
      wobble: wobble + p * 0.03,
      rotation: rot + (n01(p, seed + 8) - 0.5) * 0.2,
    })
    const fill = p === 0 ? mixColor(color, '#fff6ea', 0.04) : p === passes - 1 ? shade : color
    ctx.fillStyle = fill
    ctx.globalAlpha = baseAlpha * (p === 0 ? 0.34 : p === 1 ? 0.42 : 0.22)
    ctx.fill(path)
  }

  const body = wobbleBlob(cx, cy, rx * 0.98, ry * 0.98, seed + 3, { n, wobble, rotation: rot })
  ctx.clip(body)
  ctx.globalAlpha = baseAlpha * 0.36
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.08, cy + ry * 0.38, rx * 0.82, ry * 0.5, 0.15, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = baseAlpha * 0.34
  ctx.fillStyle = darken(shade, 0.12)
  ctx.beginPath()
  ctx.ellipse(cx + rx * 0.02, cy + ry * 0.52, rx * 0.88, ry * 0.4, 0.08, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = baseAlpha * 0.2
  ctx.fillStyle = mixColor(color, '#fffaf0', 0.45)
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.18, cy - ry * 0.28, rx * 0.42, ry * 0.28, -0.3, 0, TAU)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = baseAlpha * 0.5
  ctx.strokeStyle = shade
  ctx.lineWidth = Math.max(1.4, Math.min(rx, ry) * 0.09)
  ctx.stroke(wobbleBlob(cx, cy, rx * 1.02, ry * 1.02, seed + 11, { n, wobble: wobble * 1.15, rotation: rot }))
  ctx.restore()
}

function ribbonPath(pts: readonly Pt[], widths: readonly number[]): Path2D {
  const path = new Path2D()
  const n = pts.length
  if (n < 2) return path
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[i === 0 ? 0 : i - 1]
    const next = pts[i === n - 1 ? n - 1 : i + 1]
    const cur = pts[i]
    if (!prev || !next || !cur) continue
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const w = widths[i] ?? 1
    left.push({ x: cur.x - ty * w, y: cur.y + tx * w })
    right.push({ x: cur.x + ty * w, y: cur.y - tx * w })
  }
  const l0 = left[0]
  if (!l0) return path
  path.moveTo(l0.x, l0.y)
  for (let i = 1; i < left.length; i++) {
    const p = left[i]
    if (p) path.lineTo(p.x, p.y)
  }
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i]
    if (p) path.lineTo(p.x, p.y)
  }
  path.closePath()
  return path
}

/** Variable-width imperfect ink outline. Leaves a small gap so the loop does not close cleanly. */
export function inkStroke(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opts?: InkOpts,
): void {
  const seed = opts?.seed ?? 2
  const width = opts?.width ?? Math.max(2.2, Math.min(rx, ry) * 0.14)
  const n = opts?.n ?? 11
  const wobble = opts?.wobble ?? 0.12
  const rot = opts?.rotation ?? 0
  const close = opts?.close ?? 0.9
  const pts = blobPoints(cx, cy, rx * 1.04, ry * 1.04, seed, { n, wobble, rotation: rot })
  const used = Math.max(3, Math.floor(pts.length * close))
  const slice = pts.slice(0, used)
  for (let i = 0; i < slice.length; i++) {
    const p = slice[i]
    if (!p) continue
    p.x += (n01(i, seed + 70) - 0.5) * width * 0.8
    p.y += (n01(i + 9, seed + 71) - 0.5) * width * 0.8
  }
  const widths: number[] = []
  for (let i = 0; i < slice.length; i++) {
    widths.push(width * (0.45 + n01(i, seed + 90) * 1.05))
  }
  ctx.save()
  ctx.globalAlpha = opts?.alpha ?? 0.88
  ctx.fillStyle = color
  ctx.fill(ribbonPath(slice, widths))
  ctx.restore()
}

/** Droplets flung off a wet wash. */
export function splat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  size: number,
  opts?: SplatOpts,
): void {
  const count = opts?.count ?? 7
  const seed = opts?.seed ?? 5
  ctx.save()
  for (let i = 0; i < count; i++) {
    const a = n01(i, seed) * TAU
    const d = (0.15 + n01(i, seed + 3) * 0.95) * size
    const sr = size * (0.05 + n01(i, seed + 6) * 0.16)
    ctx.globalAlpha = 0.28 + n01(i, seed + 9) * 0.42
    ctx.fillStyle = n01(i, seed + 11) > 0.7 ? darken(color, 0.2) : color
    ctx.fill(
      wobbleBlob(x + Math.cos(a) * d, y + Math.sin(a) * d, sr, sr * (0.7 + n01(i, seed + 12) * 0.4), seed + i * 13, {
        n: 6,
        wobble: 0.38,
      }),
    )
  }
  ctx.restore()
}

/** Pigment granulation speckle inside a rectangle. */
export function granulate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts?: GranulateOpts,
): void {
  const density = opts?.density ?? 90
  const seed = opts?.seed ?? 8
  const a = opts?.alpha ?? 0.14
  ctx.save()
  for (let i = 0; i < density; i++) {
    const px = x + n01(i, seed) * w
    const py = y + n01(i + 3, seed + 1) * h
    const s = 0.5 + n01(i, seed + 2) * 1.6
    ctx.fillStyle = rgba(color, a * (0.45 + n01(i, seed + 4) * 0.7))
    ctx.fillRect(px, py, s, s * (0.6 + n01(i, seed + 5)))
  }
  ctx.restore()
}

/** Cached cream paper with fibre noise. */
export function paperTexture(w: number, h: number): HTMLCanvasElement {
  const bw = Math.max(8, Math.round(w))
  const bh = Math.max(8, Math.round(h))
  const key = `${bw}x${bh}`
  const hit = paperTiles.get(key)
  if (hit) return hit

  const c = document.createElement('canvas')
  c.width = bw
  c.height = bh
  const ctx = c.getContext('2d')
  if (!ctx) {
    paperTiles.set(key, c)
    return c
  }

  ctx.fillStyle = PAPER_CREAM
  ctx.fillRect(0, 0, bw, bh)

  const img = ctx.getImageData(0, 0, bw, bh)
  const data = img.data
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4
      const n = n01(x + y * 19, 3) * 0.55 + n01(x * 3 + y, 7) * 0.45
      const d = (n - 0.5) * 14
      const warm = n01(x + y, 21) * 6
      data[i] = clamp((data[i] ?? 240) + d + warm, 0, 255)
      data[i + 1] = clamp((data[i + 1] ?? 230) + d * 0.85, 0, 255)
      data[i + 2] = clamp((data[i + 2] ?? 208) + d * 0.55 - 2, 0, 255)
    }
  }
  ctx.putImageData(img, 0, 0)

  ctx.save()
  for (let i = 0; i < 70; i++) {
    const x0 = n01(i, 30) * bw
    const y0 = n01(i, 31) * bh
    const len = 18 + n01(i, 32) * 70
    const ang = (n01(i, 33) - 0.5) * 0.5
    ctx.strokeStyle = rgba('#6a5340', 0.028 + n01(i, 34) * 0.04)
    ctx.lineWidth = 0.4 + n01(i, 35) * 1.1
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(
      x0 + Math.cos(ang) * len * 0.5,
      y0 + Math.sin(ang) * len * 0.5 + (n01(i, 36) - 0.5) * 8,
      x0 + Math.cos(ang) * len,
      y0 + Math.sin(ang) * len,
    )
    ctx.stroke()
  }
  ctx.restore()

  granulate(ctx, 0, 0, bw, bh, '#6b4e32', { seed: 44, density: 220, alpha: 0.07 })
  granulate(ctx, 0, 0, bw, bh, '#d8c4a0', { seed: 45, density: 80, alpha: 0.08 })

  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.035
    ctx.fillStyle = i % 2 === 0 ? '#c9a078' : '#d8c8a4'
    ctx.fill(
      wobbleBlob(n01(i, 50) * bw, n01(i, 51) * bh, 18 + n01(i, 52) * 40, 12 + n01(i, 53) * 28, 60 + i, {
        n: 8,
        wobble: 0.3,
      }),
    )
  }
  ctx.globalAlpha = 1

  paperTiles.set(key, c)
  return c
}

export function fillPaperTiled(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tile = 256,
): void {
  const tex = paperTexture(tile, tile)
  const x0 = Math.floor(x / tile) * tile
  const y0 = Math.floor(y / tile) * tile
  for (let py = y0; py < y + h; py += tile) {
    for (let px = x0; px < x + w; px += tile) {
      ctx.drawImage(tex, px, py)
    }
  }
}

/** Loose ink rectangle; edges wobble and do not meet at perfect corners. */
export function inkRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  seed: number,
  width = 2.4,
): void {
  const steps = 7
  const edges: Pt[][] = [[], [], [], []]
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const jx = (n01(i, seed) - 0.5) * 7
    const jy = (n01(i, seed + 1) - 0.5) * 7
    edges[0]?.push({ x: x + t * w + jx, y: y + jy })
    edges[1]?.push({ x: x + w + jx, y: y + t * h + jy })
    edges[2]?.push({ x: x + w - t * w + jx, y: y + h + jy })
    edges[3]?.push({ x: x + jx, y: y + h - t * h + jy })
  }
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let e = 0; e < 4; e++) {
    const pts = edges[e]
    if (!pts || pts.length < 2) continue
    ctx.beginPath()
    const p0 = pts[0]
    if (!p0) continue
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]
      if (p) ctx.lineTo(p.x, p.y)
    }
    ctx.globalAlpha = 0.55 + n01(e, seed + 9) * 0.3
    ctx.lineWidth = width * (0.7 + n01(e, seed + 10) * 0.8)
    ctx.stroke()
  }
  ctx.restore()
}

export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.42): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62)
  g.addColorStop(0, 'rgba(42, 30, 20, 0)')
  g.addColorStop(0.65, `rgba(42, 28, 18, ${strength * 0.18})`)
  g.addColorStop(1, `rgba(36, 24, 16, ${strength})`)
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w))
  canvas.height = Math.max(1, Math.ceil(h))
  return { canvas, ctx: canvas.getContext('2d') }
}
