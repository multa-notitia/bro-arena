/**
 * Integer hash shared with the ground scatter. Same mix as `u01` in
 * `render/beds.ts`, folded over several ints. Do not flip or rotate tiles:
 * the four ground variants only meet on an unflipped border.
 */

export function u01(n: number): number {
  let x = Math.imul(n | 0, 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

export function h(...k: number[]): number {
  let n = 0x2545f491
  for (const v of k) n = Math.imul(n ^ (v | 0), 0x01000193)
  return u01(n)
}

const W = [0.16, 0.3, 0.24, 0.3]

export function basePick(tx: number, ty: number): number {
  const r = h(tx, ty, 11)
  let a = 0
  for (let i = 0; i < 4; i++) {
    a += W[i]!
    if (r < a) return i
  }
  return 3
}

/** 0..3 → ground-garden a..d. */
export function tileVariant(tx: number, ty: number): number {
  let v = basePick(tx, ty)
  const ban = new Set([basePick(tx - 1, ty), basePick(tx, ty - 1)])
  if (ban.has(v)) {
    const o = [0, 1, 2, 3].filter((i) => !ban.has(i))
    v = o[Math.floor(h(tx, ty, 12) * o.length) % o.length]!
  }
  return v
}

export const GROUND_VARIANTS = ['a', 'b', 'c', 'd'] as const
