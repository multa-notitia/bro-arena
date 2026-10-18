/**
 * Deterministic ground decals. Port of tools/ground_v3/scatter.py.
 * One fixed seed per bed, plus 7919 outside the beds. Unlock state is not
 * an input, so a bed looks the same shut or open.
 */
import { FEEL } from '../feel.ts'
import { BEDS, plotBounds, type BedId } from './beds.ts'
import { h } from '../render/groundHash.ts'

export interface GroundDecal {
  name: string
  x: number
  y: number
  rot: number
  scale: number
  flipX: boolean
  flipY: boolean
  alpha: number
  /** Set on grid, clump, and shoulder marks. Paths omit it, matching the reference. */
  bed?: string
}

/** Weights in scatter.py. The reference JSON was generated with these. */
export const REFERENCE_PUDDLES = { out: 0.25, inn: 0.2 } as const

/**
 * The painted map read wet. Live placement keeps every other weight and
 * trims the puddle decals a little (outskirts 0.25 → 0.2, beds 0.2 → 0.16).
 */
export const LIVE_PUDDLES = { out: 0.2, inn: 0.16 } as const

/**
 * Tidy garden: the scatter stays, and nothing from it is drawn.
 * Turn this back on to restore grass, moss, puddles, and the worn path.
 */
export const GROUND_DECALS_ON = false

const OUT_SEED = 7919
const CELL = 130
const FOOT = 0.42
const MARGIN = 320
/** scatter.py writes `6.283`, not 2π. The reference JSON depends on it. */
const TURN = 6.283

const PATHS: readonly [readonly [number, number], readonly [number, number]][] = [
  [[-450, 6], [-1600, 0]],
  [[450, 6], [1600, 0]],
  [[-8, -420], [10, -810]],
  [[8, 420], [-6, 810]],
]

interface Row {
  name: string
  weight: number
  s0: number
  s1: number
  rot: 'free' | 'tilt'
}

const PATCH = new Set(['grass', 'moss', 'clover', 'thyme', 'weeds'])

const DENS = { out: 0.5, edge: 0.5, in: 0.48 } as const

type Ctx = keyof typeof DENS

function bedSeed(id: BedId): number {
  const i = BEDS.findIndex((bed) => bed.id === id)
  return i * 977 + 101
}

function furrowSize(): { w: number; h: number } {
  return {
    w: Math.round(613 * FEEL.garden.scale),
    h: Math.round(146 * FEEL.garden.scale),
  }
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function furrowRects(): Rect[] {
  const { w, h } = furrowSize()
  const out: Rect[] = []
  for (const bed of BEDS) {
    for (const row of bed.rows) {
      out.push({ x: row.x - w / 2, y: row.y + 6 - h / 2, w, h })
    }
  }
  return out
}

export function bedAt(x: number, y: number): BedId | null {
  for (const bed of BEDS) {
    if (bed.x <= x && x < bed.x + bed.w && bed.y <= y && y < bed.y + bed.h) return bed.id
  }
  return null
}

function distEdge(x: number, y: number, id: BedId): number {
  const bed = BEDS.find((item) => item.id === id)!
  return Math.min(x - bed.x, bed.x + bed.w - x, y - bed.y, bed.y + bed.h - y)
}

function rectDist(x: number, y: number, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w))
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

function segDist(x: number, y: number, a: readonly [number, number], b: readonly [number, number]): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const denom = vx * vx + vy * vy
  const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / denom))
  return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t)
}

function pick(table: readonly Row[], r: number): Row {
  const tot = table.reduce((sum, row) => sum + row.weight, 0)
  let acc = 0
  for (const row of table) {
    acc += row.weight / tot
    if (r < acc) return row
  }
  return table[table.length - 1]!
}

/** Python 3 round: half to even. Grid marks in the reference use this. */
function pyRound(value: number, digits: number): number {
  const p = 10 ** digits
  const y = value * p
  const sign = y < 0 ? -1 : 1
  const ax = Math.abs(y)
  const fl = Math.floor(ax + 1e-12)
  const frac = ax - fl
  let n: number
  if (frac > 0.5 + 1e-9) n = fl + 1
  else if (frac < 0.5 - 1e-9) n = fl
  else n = fl % 2 === 0 ? fl : fl + 1
  return (sign * n) / p
}

function tables(puddles: { out: number; inn: number }): Record<Ctx, Row[]> {
  return {
    out: [
      { name: 'leaves_autumn', weight: 3, s0: 0.38, s1: 0.6, rot: 'free' },
      { name: 'leaves_oak', weight: 3, s0: 0.38, s1: 0.6, rot: 'free' },
      { name: 'moss', weight: 2, s0: 0.45, s1: 0.85, rot: 'free' },
      { name: 'grass', weight: 2, s0: 0.45, s1: 0.85, rot: 'free' },
      { name: 'weeds', weight: 1.5, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'path', weight: 0.6, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'puddle_a', weight: puddles.out, s0: 0.7, s1: 1, rot: 'free' },
      { name: 'puddle_b', weight: puddles.out, s0: 0.7, s1: 1, rot: 'free' },
    ],
    edge: [
      { name: 'grass', weight: 3, s0: 0.4, s1: 0.75, rot: 'free' },
      { name: 'moss', weight: 2, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'leaves_oak', weight: 2, s0: 0.35, s1: 0.55, rot: 'free' },
      { name: 'clover', weight: 2, s0: 0.4, s1: 0.65, rot: 'free' },
      { name: 'thyme', weight: 1, s0: 0.4, s1: 0.65, rot: 'free' },
      { name: 'petals_white', weight: 1, s0: 0.35, s1: 0.55, rot: 'free' },
    ],
    in: [
      { name: 'clover', weight: 3, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'grass', weight: 2, s0: 0.4, s1: 0.75, rot: 'free' },
      { name: 'thyme', weight: 2, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'daisies', weight: 1.5, s0: 0.32, s1: 0.48, rot: 'tilt' },
      { name: 'flowers_violet', weight: 1.2, s0: 0.32, s1: 0.48, rot: 'tilt' },
      { name: 'petals_pink', weight: 1.5, s0: 0.35, s1: 0.55, rot: 'free' },
      { name: 'weeds', weight: 1.5, s0: 0.4, s1: 0.65, rot: 'free' },
      { name: 'moss', weight: 1, s0: 0.4, s1: 0.7, rot: 'free' },
      { name: 'puddle_a', weight: puddles.inn, s0: 0.7, s1: 0.95, rot: 'free' },
      { name: 'puddle_b', weight: puddles.inn, s0: 0.7, s1: 0.95, rot: 'free' },
    ],
  }
}

export function scatterDecals(puddles: { out: number; inn: number } = LIVE_PUDDLES): GroundDecal[] {
  const plot = plotBounds()
  const minx = plot.minX - MARGIN
  const miny = plot.minY - MARGIN
  const maxx = plot.maxX + MARGIN
  const maxy = plot.maxY + MARGIN
  const table = tables(puddles)
  const furrows = furrowRects()
  const out: GroundDecal[] = []

  for (let pi = 0; pi < PATHS.length; pi++) {
    const path = PATHS[pi]!
    const a = path[0]
    const b = path[1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const step = 96
    const n = Math.floor(len / step) + 1
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    for (let i = 0; i < n; i++) {
      const t = (i * step) / len
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      const off = (h(pi, i, 31) - 0.5) * 16 + Math.sin(i * 0.7 + pi) * 8
      out.push({
        name: 'path_long',
        x: x + nx * off,
        y: y + ny * off,
        rot: ang + (h(pi, i, 32) - 0.5) * 0.16,
        scale: 0.62 + h(pi, i, 33) * 0.22,
        flipX: h(pi, i, 34) < 0.5,
        flipY: h(pi, i, 35) < 0.5,
        alpha: 0.6 + h(pi, i, 36) * 0.14,
      })
      if (h(pi, i, 37) < 0.45) {
        out.push({
          name: 'path',
          x: x + nx * off * 1.5,
          y: y + ny * off * 1.5,
          rot: h(pi, i, 38) * TURN,
          scale: 0.32 + h(pi, i, 39) * 0.18,
          flipX: false,
          flipY: false,
          alpha: 0.5,
        })
      }
    }
  }

  const gx0 = Math.floor(minx / CELL)
  const gy0 = Math.floor(miny / CELL)
  const gx1 = Math.ceil(maxx / CELL)
  const gy1 = Math.ceil(maxy / CELL)
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const cx = (gx + 0.5) * CELL
      const cy = (gy + 0.5) * CELL
      const x = cx + (h(gx, gy, 1) - 0.5) * CELL * 0.9
      const y = cy + (h(gx, gy, 2) - 0.5) * CELL * 0.9
      const id = bedAt(x, y)
      const seed = id ? bedSeed(id) : OUT_SEED
      let ctx: Ctx
      if (id == null) ctx = 'out'
      else if (distEdge(x, y, id) < 70) ctx = 'edge'
      else ctx = 'in'
      if (h(gx, gy, seed, 3) > DENS[ctx]) continue
      const row = pick(table[ctx], h(gx, gy, seed, 4))
      const sc = row.s0 + (row.s1 - row.s0) * h(gx, gy, seed, 5)
      let rad = 250 * sc * FOOT
      if (row.name.startsWith('puddle')) rad = 110 * sc * 0.6
      if (furrows.some((rect) => rectDist(x, y, rect) < rad * 0.75 + 14)) continue
      if (PATHS.some((path) => segDist(x, y, path[0], path[1]) < rad * 0.6 + 30)) continue
      const rot = row.rot === 'free' ? h(gx, gy, seed, 6) * TURN : (h(gx, gy, seed, 6) - 0.5) * 0.5
      const bed = id ?? '-'
      out.push({
        name: row.name,
        x: pyRound(x, 1),
        y: pyRound(y, 1),
        rot: pyRound(rot, 3),
        scale: pyRound(sc, 3),
        flipX: h(gx, gy, seed, 7) < 0.5,
        flipY: row.rot === 'free' && h(gx, gy, seed, 8) < 0.5,
        alpha: pyRound(0.82 + h(gx, gy, seed, 9) * 0.18, 3),
        bed,
      })
      if (!PATCH.has(row.name)) continue
      const extra = 1 + Math.trunc(h(gx, gy, seed, 20) * 2)
      for (let c = 0; c < extra; c++) {
        const ang = h(gx, gy, seed, 21 + c) * TURN
        const r = 250 * sc * (0.28 + 0.14 * h(gx, gy, seed, 24 + c))
        out.push({
          name: row.name,
          x: pyRound(x + Math.cos(ang) * r, 1),
          y: pyRound(y + Math.sin(ang) * r * 0.8, 1),
          rot: pyRound(h(gx, gy, seed, 27 + c) * TURN, 3),
          scale: pyRound(sc * (0.5 + 0.3 * h(gx, gy, seed, 30 + c)), 3),
          flipX: h(gx, gy, seed, 33 + c) < 0.5,
          flipY: h(gx, gy, seed, 36 + c) < 0.5,
          alpha: pyRound(0.8 + h(gx, gy, seed, 39 + c) * 0.2, 3),
          bed,
        })
      }
    }
  }

  const shoulders = ['weeds', 'clover', 'grass', 'thyme'] as const
  for (let fi = 0; fi < furrows.length; fi++) {
    const rect = furrows[fi]!
    for (let j = 0; j < 3; j++) {
      if (h(fi, j, 51) > 0.7) continue
      const side = h(fi, j, 52) < 0.5 ? -1 : 1
      const x = rect.x + rect.w * (0.15 + 0.7 * h(fi, j, 53))
      const y = rect.y + rect.h / 2 + side * (rect.h / 2 + 26 + h(fi, j, 54) * 14)
      const name = shoulders[Math.trunc(h(fi, j, 55) * 4) % 4]!
      out.push({
        name,
        x,
        y,
        rot: h(fi, j, 56) * TURN,
        scale: 0.38 + h(fi, j, 57) * 0.18,
        flipX: h(fi, j, 58) < 0.5,
        flipY: false,
        alpha: 0.9,
        bed: bedAt(x, y) ?? '-',
      })
    }
  }

  return out
}
