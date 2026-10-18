import { CHAOS } from '../data/chaos.ts'

const counters: Array<() => number> = []

export function isSparkClip(name: string): boolean {
  return name === 'hitSpark' || name === 'stars' || name === 'spark'
}

export function underHeroClip(name: string): boolean {
  return isSparkClip(name) || name === 'dust'
}

export function registerSparkCounter(fn: () => number): void {
  counters.push(fn)
}

export function sparkCount(): number {
  let n = 0
  for (let i = 0; i < counters.length; i++) n += counters[i]!()
  return n
}

export function sparksFull(): boolean {
  return sparkCount() >= CHAOS.read.sparkCap
}

export function nearHeroFx(x: number, y: number, hx: number, hy: number): boolean {
  const r = CHAOS.read.heroFxRadius
  const dx = x - hx
  const dy = y - hy
  return dx * dx + dy * dy <= r * r
}

export function heroBurstAlpha(x: number, y: number, hx: number, hy: number): number {
  return nearHeroFx(x, y, hx, hy) ? CHAOS.read.heroFxAlpha : 1
}
