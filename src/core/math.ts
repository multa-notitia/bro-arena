export const TAU = Math.PI * 2

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax)
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU
  while (a < -Math.PI) a += TAU
  return a
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

export const ease = {
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  },
  /** Quick up, slow settle. Good for squash. */
  punch: (t: number) => Math.sin(t * Math.PI) * (1 - t),
}

/** Deterministic seeded RNG (mulberry32). */
export class Rng {
  private s: number

  constructor(seed = Date.now() >>> 0) {
    this.s = seed >>> 0 || 1
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(list: readonly T[]): T {
    const item = list[Math.floor(this.next() * list.length)]
    if (item === undefined) throw new Error('pick from empty list')
    return item
  }

  weighted<T extends { weight: number }>(list: readonly T[]): T {
    let total = 0
    for (const it of list) total += it.weight
    let r = this.next() * total
    for (const it of list) {
      r -= it.weight
      if (r <= 0) return it
    }
    const last = list[list.length - 1]
    if (last === undefined) throw new Error('weighted pick from empty list')
    return last
  }

  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const a = list[i]
      const b = list[j]
      if (a !== undefined && b !== undefined) {
        list[i] = b
        list[j] = a
      }
    }
    return list
  }
}

/** Cheap 1D value noise for wobble, hashed from an integer seed. */
export function hashNoise(i: number, seed = 0): number {
  let h = (i * 374761393 + seed * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

let uidCounter = 1
export function uid(): number {
  return uidCounter++
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
