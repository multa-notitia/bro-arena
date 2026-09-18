import { TAU, clamp, lerp } from '../core/math.ts'
import type { Palette } from '../core/types.ts'
import { getPaintStyle } from './look.ts'
import {
  blobPoints,
  darken,
  granulate,
  inkStroke,
  lighten,
  mixColor,
  n01,
  parseRgb,
  rgba,
  smoothPath,
  splat,
  wash,
  wobbleBlob,
  type InkOpts,
  type Pt,
  type WashOpts,
} from './watercolor.ts'

const UMBER = '#2a2218'
const GLOW_LIME = '#d9ff5c'
const GLOW_LIME_HOT = '#b6ff3a'

function styleA(): boolean {
  return getPaintStyle() === 'a'
}

function styleB(): boolean {
  return getPaintStyle() === 'b'
}

function styleC(): boolean {
  return getPaintStyle() === 'c'
}

function defaultInkWidth(rx: number, ry: number): number {
  return Math.max(2.2, Math.min(rx, ry) * 0.14)
}

function luminance(color: string): number {
  const { r, g, b } = parseRgb(color)
  return (r * 0.32 + g * 0.5 + b * 0.18) / 255
}

function fillRibbon(ctx: CanvasRenderingContext2D, pts: readonly Pt[], halfW: number): void {
  const n = pts.length
  if (n < 2) return
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const prev = pts[i === 0 ? 0 : i - 1]
    const next = pts[i === n - 1 ? n - 1 : i + 1]
    if (!cur || !prev || !next) continue
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const taper = lerp(1, 0.28, i / Math.max(1, n - 1))
    const w = halfW * taper
    left.push({ x: cur.x - ty * w, y: cur.y + tx * w })
    right.push({ x: cur.x + ty * w, y: cur.y - tx * w })
  }
  const l0 = left[0]
  if (!l0) return
  ctx.beginPath()
  ctx.moveTo(l0.x, l0.y)
  for (let i = 1; i < left.length; i++) {
    const p = left[i]
    if (p) ctx.lineTo(p.x, p.y)
  }
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i]
    if (p) ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.fill()
}

function crackOrigin(
  r: number,
  seed: number,
  speciesHint: string | undefined,
): { x: number; y: number; bias: number } {
  const hint = speciesHint ?? ''
  const jitterX = (n01(3, seed) - 0.5) * r * 0.1
  if (hint === 'pumpkin') return { x: jitterX, y: r * 0.08, bias: 0 }
  if (hint === 'chili') return { x: jitterX * 0.4, y: -r * 0.12, bias: 1.15 }
  if (hint === 'carrot') return { x: jitterX, y: r * 0.38, bias: 0.9 }
  if (hint === 'eggplant') return { x: jitterX * 0.6, y: -r * 0.06, bias: 0.7 }
  if (hint === 'onion' || hint === 'garlic') return { x: jitterX, y: r * 0.04, bias: 0.35 }
  if (hint === 'pea') return { x: jitterX, y: -r * 0.02, bias: 0 }
  if (hint === 'sprout') return { x: jitterX * 0.45, y: r * 0.52, bias: 0.2 }
  return { x: jitterX, y: r * 0.12, bias: 0.2 }
}

function crackClip(
  r: number,
  speciesHint: string | undefined,
): { x: number; y: number; rx: number; ry: number } {
  const hint = speciesHint ?? ''
  if (hint === 'sprout') return { x: 0, y: r * 0.52, rx: r * 0.5, ry: r * 0.56 }
  if (hint === 'carrot') return { x: 0, y: r * 0.12, rx: r * 0.52, ry: r * 1.02 }
  if (hint === 'pea') return { x: 0, y: 0, rx: r * 0.84, ry: r * 0.84 }
  if (hint === 'chili') return { x: r * 0.08, y: r * 0.06, rx: r * 0.7, ry: r * 1.05 }
  return { x: 0, y: 0, rx: r * 0.96, ry: r * 1.04 }
}

function crackCount(seed: number, speciesHint: string | undefined): number {
  let n = 3 + Math.floor(n01(0, seed) * 4)
  const hint = speciesHint ?? ''
  if (hint === 'pumpkin' || hint === 'broccoli' || hint === 'cabbage') n += 1
  if (hint === 'chili' || hint === 'pea') n -= 1
  return clamp(n, 3, 6)
}

function jaggedSpine(
  ox: number,
  oy: number,
  angle: number,
  length: number,
  seed: number,
  salt: number,
  chaos = 1,
): Pt[] {
  const segs = (chaos < 0.5 ? 4 : 5) + Math.floor(n01(salt, seed + 4) * 3)
  const pts: Pt[] = [{ x: ox, y: oy }]
  let x = ox
  let y = oy
  let a = angle
  for (let k = 1; k <= segs; k++) {
    a += (n01(salt * 11 + k, seed + 8) - 0.5) * 0.72 * chaos
    const step = length / segs
    x += Math.cos(a) * step
    y += Math.sin(a) * step
    x += (n01(salt * 13 + k, seed + 9) - 0.5) * length * 0.12 * chaos
    y += (n01(salt * 17 + k, seed + 10) - 0.5) * length * 0.08 * chaos
    pts.push({ x, y })
  }
  return pts
}

function strokeSpine(ctx: CanvasRenderingContext2D, spine: readonly Pt[]): void {
  const p0 = spine[0]
  if (!p0) return
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  for (let k = 1; k < spine.length; k++) {
    const p = spine[k]
    if (p) ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
}

export function paperColor(): string {
  if (styleB()) return '#d2cec4'
  if (styleC()) return '#f7e4c8'
  return '#f3ead8'
}

export function langWash(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opts?: WashOpts,
): void {
  if (styleA()) {
    wash(ctx, cx, cy, rx, ry, color, opts)
    return
  }

  const seed = opts?.seed ?? 1
  const n = opts?.n ?? 9
  const rot = opts?.rotation ?? 0
  const baseAlpha = opts?.alpha ?? 1

  if (styleB()) {
    const shade = opts?.shade ?? darken(color, 0.48)
    const mixed = mixColor(color, shade, 0.2)
    const wobble = opts?.wobble ?? 0.1
    ctx.save()
    for (let p = 0; p < 2; p++) {
      const grow = 1.04 - p * 0.05
      const ox = (n01(p, seed + 40) - 0.5) * rx * 0.045
      const oy = (n01(p, seed + 41) - 0.5) * ry * 0.045
      ctx.globalAlpha = baseAlpha * (p === 0 ? 0.58 : 0.4)
      ctx.fillStyle = p === 0 ? mixed : shade
      ctx.fill(
        wobbleBlob(cx + ox, cy + oy, rx * grow, ry * grow, seed + p * 19, {
          n,
          wobble: wobble + p * 0.02,
          rotation: rot,
        }),
      )
    }
    ctx.save()
    ctx.clip(wobbleBlob(cx, cy, rx, ry, seed, { n, wobble, rotation: rot }))
    granulate(ctx, cx - rx, cy - ry, rx * 2, ry * 2, darken(shade, 0.18), {
      seed: seed + 17,
      density: 78,
      alpha: 0.2,
    })
    ctx.strokeStyle = rgba(darken(shade, 0.28), 0.22)
    ctx.lineWidth = Math.max(0.7, Math.min(rx, ry) * 0.035)
    ctx.lineCap = 'round'
    for (let i = 0; i < 7; i++) {
      const a = n01(i, seed + 60) * TAU
      const d0 = Math.min(rx, ry) * (0.12 + n01(i, seed + 61) * 0.28)
      const d1 = d0 + Math.min(rx, ry) * (0.1 + n01(i, seed + 62) * 0.16)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0)
      ctx.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1)
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalAlpha = baseAlpha * 0.72
    ctx.strokeStyle = darken(shade, 0.22)
    ctx.lineWidth = Math.max(1.15, Math.min(rx, ry) * 0.06)
    ctx.stroke(
      wobbleBlob(cx, cy, rx * 1.01, ry * 1.01, seed + 11, {
        n,
        wobble: wobble * 1.12,
        rotation: rot,
      }),
    )
    ctx.restore()
    return
  }

  const shade = opts?.shade ?? darken(color, 0.28)
  const wobble = 0.08
  ctx.save()
  ctx.globalAlpha = baseAlpha * 0.94
  ctx.fillStyle = color
  ctx.fill(wobbleBlob(cx, cy, rx, ry, seed, { n: n + 1, wobble, rotation: rot }))
  ctx.globalAlpha = baseAlpha * 0.26
  ctx.fillStyle = mixColor(color, shade, 0.32)
  ctx.fill(
    wobbleBlob(cx + rx * 0.03, cy + ry * 0.07, rx * 0.92, ry * 0.9, seed + 2, {
      n,
      wobble,
      rotation: rot,
    }),
  )
  ctx.globalAlpha = baseAlpha * 0.3
  ctx.fillStyle = mixColor(color, lighten(color, 0.45), 0.55)
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.22, cy - ry * 0.3, rx * 0.36, ry * 0.24, -0.35, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function langInk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opts?: InkOpts,
): void {
  const baseW = opts?.width ?? defaultInkWidth(rx, ry)
  if (styleA()) {
    inkStroke(ctx, cx, cy, rx, ry, color, opts)
    return
  }
  if (styleB()) {
    const seed = opts?.seed ?? 2
    const jx = (n01(0, seed + 50) - 0.5) * Math.min(rx, ry) * 0.035
    const jy = (n01(1, seed + 51) - 0.5) * Math.min(rx, ry) * 0.035
    inkStroke(ctx, cx + jx, cy + jy, rx, ry, darken(color, 0.22), {
      ...opts,
      width: baseW * 1.32,
      close: opts?.close ?? 0.96,
      alpha: opts?.alpha ?? 0.94,
      wobble: (opts?.wobble ?? 0.12) * 1.18,
      n: opts?.n ?? 12,
    })
    inkStroke(ctx, cx - jx * 0.6, cy + jy * 0.4, rx * 1.01, ry * 1.01, darken(color, 0.38), {
      ...opts,
      seed: seed + 7,
      width: baseW * 0.42,
      close: 0.93,
      alpha: 0.5,
      wobble: 0.16,
      n: 11,
      rotation: (opts?.rotation ?? 0) + 0.05,
    })
    return
  }
  inkStroke(ctx, cx, cy, rx, ry, color, {
    ...opts,
    width: baseW * 0.7,
    close: opts?.close ?? 0.98,
    alpha: opts?.alpha ?? 0.9,
    wobble: Math.min(0.08, opts?.wobble ?? 0.08),
    n: opts?.n ?? 14,
  })
}

/** Direction C vertical stain bloom behind a creature. */
export function langBloom(ctx: CanvasRenderingContext2D, r: number, color: string, seed: number): void {
  if (!styleC()) return
  const lum = luminance(color)
  const footMix = lum > 0.52 ? 0.62 : 0.42
  const deep = mixColor(darken(color, footMix), UMBER, 0.38)
  ctx.save()
  const layers = 9
  for (let i = 0; i < layers; i++) {
    const u = i / (layers - 1)
    const y = lerp(-r * 2.15, r * 1.55, u)
    const rx = r * lerp(0.72, 1.95, u * u)
    const ry = r * lerp(0.72, 1.05, u)
    const ox = (n01(i, seed) - 0.5) * r * lerp(0.18, 0.48, u)
    const washCol = u < 0.58 ? mixColor(color, lighten(color, 0.1), 1 - u) : mixColor(color, deep, (u - 0.5) * 1.7)
    ctx.globalAlpha = lerp(0.42, 0.78, u)
    ctx.fillStyle = washCol
    ctx.fill(
      wobbleBlob(ox, y, rx, ry, seed + i * 11, {
        n: 8 + (i % 3),
        wobble: 0.28 + u * 0.08,
      }),
    )
    if (i === 2 || i === 4 || i === 6) {
      splat(ctx, ox + r * 0.4, y, mixColor(color, deep, 0.28), r * 0.62, {
        seed: seed + 80 + i,
        count: 6,
      })
    }
  }
  ctx.globalAlpha = 0.48
  ctx.fillStyle = deep
  const puddle = blobPoints(0, r * 1.28, r * 1.45, r * 0.52, seed + 40, { n: 9, wobble: 0.3 })
  ctx.fill(smoothPath(puddle))
  ctx.globalAlpha = 0.28
  ctx.fillStyle = mixColor(deep, '#120c08', 0.35)
  ctx.fill(wobbleBlob((n01(9, seed) - 0.5) * r * 0.2, r * 1.4, r * 1.15, r * 0.4, seed + 44, { n: 8, wobble: 0.32 }))
  granulate(ctx, -r * 1.4, -r * 2.2, r * 2.8, r * 4.0, darken(color, 0.25), {
    seed: seed + 90,
    density: 70,
    alpha: 0.16,
  })
  ctx.restore()
}

/** Glow cracks on a nightmare vegetable. Paint style changes HOW, not whether. */
export function langCracks(
  ctx: CanvasRenderingContext2D,
  r: number,
  glow: string,
  seed: number,
  speciesHint?: string,
): void {
  const origin = crackOrigin(r, seed, speciesHint)
  const count = crackCount(seed, speciesHint)
  const lime = mixColor(glow, GLOW_LIME_HOT, styleA() ? 0.28 : 0.45)
  const core = lighten(mixColor(glow, GLOW_LIME, styleA() ? 0.22 : 0.35), styleA() ? 0.18 : 0.35)
  const pooled = mixColor(lime, UMBER, 0.28)
  const clip = crackClip(r, speciesHint)
  const chaos = styleC() ? 0.3 : styleA() ? 0.78 : 1
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(clip.x, clip.y, clip.rx, clip.ry, 0, 0, TAU)
  ctx.clip()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < count; i++) {
    let ang = n01(i, seed + 1) * TAU
    if (origin.bias > 0) ang = lerp(ang, Math.PI * 0.5, origin.bias * 0.55)
    if (speciesHint === 'chili') ang = lerp(ang, 1.25, 0.55)
    const len = r * (0.42 + n01(i, seed + 2) * 0.46)
    const spine = jaggedSpine(origin.x, origin.y, ang, len, seed, i + 1, chaos)
    if (styleA()) {
      ctx.save()
      ctx.fillStyle = rgba(pooled, 0.58)
      fillRibbon(ctx, spine, Math.max(4.2, r * 0.16))
      ctx.fillStyle = rgba(lime, 0.78)
      fillRibbon(ctx, spine, Math.max(1.8, r * 0.06))
      for (let k = 0; k < spine.length; k += 2) {
        const p = spine[k]
        if (!p) continue
        ctx.globalAlpha = 0.42
        ctx.fillStyle = mixColor(lime, UMBER, 0.18)
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, r * 0.07, r * 0.048, ang, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = rgba(core, 0.6)
      ctx.lineWidth = Math.max(1.1, r * 0.032)
      strokeSpine(ctx, spine)
      ctx.restore()
    } else if (styleC()) {
      ctx.save()
      ctx.strokeStyle = rgba(lime, 0.92)
      ctx.lineWidth = Math.max(3.2, r * 0.11)
      strokeSpine(ctx, spine)
      ctx.strokeStyle = rgba(core, 0.95)
      ctx.lineWidth = Math.max(1.3, r * 0.04)
      strokeSpine(ctx, spine)
      ctx.restore()
    } else {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(lime, 0.62)
      fillRibbon(ctx, spine, Math.max(4.0, r * 0.15))
      ctx.fillStyle = rgba(core, 0.9)
      fillRibbon(ctx, spine, Math.max(1.5, r * 0.05))
      ctx.strokeStyle = rgba(core, 0.75)
      ctx.lineWidth = Math.max(1.0, r * 0.03)
      strokeSpine(ctx, spine)
      ctx.restore()
      if (n01(i, seed + 30) > 0.55 && spine.length > 3) {
        const mid = spine[2]
        if (mid) {
          const branchAng = ang + (n01(i, seed + 31) > 0.5 ? 0.7 : -0.7)
          const branch = jaggedSpine(mid.x, mid.y, branchAng, len * 0.38, seed, i + 40, chaos)
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = rgba(lime, 0.5)
          fillRibbon(ctx, branch, Math.max(2.2, r * 0.07))
          ctx.restore()
        }
      }
    }
  }
  ctx.restore()
}

export function langMudSplash(ctx: CanvasRenderingContext2D, r: number, mud: string, seed: number): void {
  const y = r * 0.85
  ctx.save()
  if (styleC()) {
    ctx.globalAlpha = 0.84
    ctx.fillStyle = mixColor(mud, '#120c08', 0.48)
    ctx.fill(smoothPath(blobPoints(0, r * 0.94, r * 1.08, r * 0.28, seed, { n: 8, wobble: 0.16 })))
    ctx.globalAlpha = 0.52
    ctx.fillStyle = mixColor(mud, UMBER, 0.58)
    ctx.fill(wobbleBlob(0, r * 1.02, r * 0.72, r * 0.16, seed + 2, { n: 7, wobble: 0.14 }))
    ctx.restore()
    return
  }
  if (styleA()) {
    ctx.globalAlpha = 0.72
    ctx.fillStyle = mixColor(mud, '#5a4030', 0.18)
    ctx.fill(smoothPath(blobPoints(0, y, r * 1.18, r * 0.42, seed, { n: 11, wobble: 0.44 })))
    ctx.globalAlpha = 0.5
    ctx.fillStyle = mixColor(mud, UMBER, 0.28)
    ctx.fill(wobbleBlob(0, y + r * 0.12, r * 0.78, r * 0.22, seed + 2, { n: 8, wobble: 0.36 }))
    const drips = 4 + Math.floor(n01(2, seed) * 3)
    for (let i = 0; i < drips; i++) {
      const x = (n01(i, seed + 10) - 0.5) * r * 1.05
      const h = r * (0.2 + n01(i, seed + 11) * 0.32)
      ctx.globalAlpha = 0.5 + n01(i, seed + 12) * 0.28
      ctx.fillStyle = n01(i, seed + 13) > 0.6 ? darken(mud, 0.12) : mud
      ctx.beginPath()
      ctx.moveTo(x - r * 0.055, y)
      ctx.quadraticCurveTo(x + r * 0.02, y + h * 0.55, x, y + h)
      ctx.quadraticCurveTo(x - r * 0.02, y + h * 0.55, x + r * 0.055, y)
      ctx.fill()
    }
    splat(ctx, 0, y, mud, r * 0.78, { seed: seed + 6, count: 7 })
    ctx.restore()
    return
  }
  ctx.globalAlpha = 0.78
  ctx.fillStyle = mud
  ctx.fill(smoothPath(blobPoints(0, y, r * 1.22, r * 0.36, seed, { n: 10, wobble: 0.36 })))
  ctx.globalAlpha = 0.55
  ctx.fillStyle = mixColor(mud, UMBER, 0.4)
  ctx.fill(wobbleBlob(0, y + r * 0.1, r * 0.82, r * 0.2, seed + 2, { n: 8, wobble: 0.3 }))
  splat(ctx, 0, y, mud, r * 0.95, { seed: seed + 6, count: 9 })
  const flecks = 5 + Math.floor(n01(1, seed) * 4)
  for (let i = 0; i < flecks; i++) {
    const a = lerp(-2.6, -0.55, n01(i, seed + 4)) + (n01(i, seed + 7) > 0.5 ? TAU * 0.5 : 0)
    const d = r * (0.55 + n01(i, seed + 5) * 0.7)
    ctx.globalAlpha = 0.5 + n01(i, seed + 8) * 0.35
    ctx.fillStyle = n01(i, seed + 9) > 0.65 ? darken(mud, 0.18) : mud
    ctx.fill(
      wobbleBlob(Math.cos(a) * d, y + Math.sin(a) * d * 0.35, r * 0.07, r * 0.11, seed + 12 + i, {
        n: 5,
        wobble: 0.42,
      }),
    )
  }
  ctx.restore()
}

export function langSmoke(ctx: CanvasRenderingContext2D, r: number, t: number, uid: number): void {
  const n = styleC() ? 4 : 6
  const a0 = styleA() ? 0.16 : styleC() ? 0.14 : 0.2
  const colA = styleB() ? '#6a5e54' : styleA() ? '#8a7464' : '#4a3c34'
  const colB = styleB() ? '#3c342c' : styleA() ? '#5c4a3c' : '#261c16'
  ctx.save()
  for (let i = 0; i < n; i++) {
    const cycle = styleA() ? 3.1 : 2.6
    const u = ((t * 0.38 + n01(i, uid + 2) * cycle) % cycle) / cycle
    const x =
      (n01(i, uid + 4) - 0.5) * r * 1.35 + Math.sin(t * 1.35 + i * 1.7) * r * 0.14
    const y = lerp(r * 0.18, -r * 1.75, u)
    const rw = r * lerp(styleC() ? 0.06 : 0.09, styleA() ? 0.26 : 0.2, u)
    const rh = r * lerp(styleC() ? 0.12 : 0.16, styleA() ? 0.42 : 0.36, u)
    const fade = Math.sin(u * Math.PI)
    ctx.globalAlpha = a0 * fade * (1 - u * 0.35)
    ctx.fillStyle = mixColor(colA, colB, n01(i, uid + 8))
    ctx.beginPath()
    ctx.ellipse(x, y, rw, rh, (n01(i, uid) - 0.5) * 0.7 + Math.sin(t + i) * 0.18, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function langWorms(ctx: CanvasRenderingContext2D, r: number, seed: number): void {
  if (!styleA()) return
  const n = 1 + Math.floor(n01(2, seed) * 3)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < n; i++) {
    const x = (n01(i, seed + 20) - 0.5) * r * 0.95
    const y = r * (0.38 + n01(i, seed + 21) * 0.42)
    const dir = n01(i, seed + 22) > 0.5 ? 1 : -1
    const pink = mixColor('#e8a090', '#c97868', n01(i, seed + 23) * 0.5)
    ctx.strokeStyle = pink
    ctx.lineWidth = Math.max(1.15, r * 0.042)
    ctx.globalAlpha = 0.82
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + dir * r * 0.1, y - r * 0.07, x + dir * r * 0.16, y + r * 0.02)
    ctx.quadraticCurveTo(x + dir * r * 0.22, y + r * 0.08, x + dir * r * 0.2, y + r * 0.05)
    ctx.stroke()
    ctx.fillStyle = pink
    ctx.beginPath()
    ctx.arc(x + dir * r * 0.2, y + r * 0.05, Math.max(1.1, r * 0.028), 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function nightmareBodyPal(pal: Palette): Palette {
  return {
    body: mixColor(pal.body, UMBER, 0.55),
    shade: mixColor(pal.shade, UMBER, 0.68),
    ink: mixColor(pal.ink, '#120c08', 0.42),
    accent: mixColor(pal.accent, '#4a7a32', 0.38),
    eye: mixColor(pal.eye, UMBER, 0.25),
    mud: pal.mud ?? UMBER,
    glow: pal.glow ?? GLOW_LIME,
  }
}

export function langFillPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  pal: Palette,
  r: number,
  seed: number,
): void {
  ctx.save()
  ctx.clip(path)
  langWash(ctx, 0, 0, r * 0.98, r * 1.02, pal.body, {
    seed,
    shade: pal.shade,
    n: 9,
    wobble: styleC() ? 0.08 : 0.14,
  })
  ctx.globalAlpha = styleC() ? 0.22 : 0.38
  ctx.fillStyle = pal.shade
  ctx.beginPath()
  ctx.ellipse((n01(0, seed) - 0.5) * r * 0.1, r * 0.44, r * 0.8, r * 0.46, 0.1, 0, TAU)
  ctx.fill()
  ctx.restore()
}
