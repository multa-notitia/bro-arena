import { clamp, type Rng } from '../core/math.ts'
import type { EnemyDef, ItemDef, Tier, WeaponDef } from '../core/types.ts'

export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level))
  return Math.round(6 * n ** 1.32)
}

export function tierOdds(wave: number, luck: number): Record<Tier, number> {
  const w = Math.max(1, wave)
  const l = luck
  let t4 = clamp(0.008 + w * 0.005 + l * 0.0012, 0, 0.22)
  let t3 = clamp(0.04 + w * 0.01 + l * 0.002, 0, 0.32)
  let t2 = clamp(0.16 + w * 0.018 + l * 0.0025, 0, 0.42)
  let t1 = 1 - t2 - t3 - t4
  if (t1 < 0.08) {
    const extra = 0.08 - t1
    const sum = t2 + t3 + t4
    if (sum > 0) {
      t2 -= extra * (t2 / sum)
      t3 -= extra * (t3 / sum)
      t4 -= extra * (t4 / sum)
    }
    t1 = 0.08
  }
  return { 1: t1, 2: t2, 3: t3, 4: t4 }
}

export function rerollPrice(wave: number, rerolls: number): number {
  const base = 6 + wave * 2
  const growth = 5 + Math.floor(wave * 0.5)
  return Math.max(1, Math.round(base + Math.max(0, rerolls) * growth))
}

export function weaponPrice(def: WeaponDef, tier: Tier, wave: number): number {
  return Math.max(1, Math.round(def.tiers[tier].price * (1 + wave * 0.08)))
}

export function itemPrice(def: ItemDef, wave: number): number {
  return Math.max(1, Math.round(def.price * (1 + wave * 0.08)))
}

export function sellPrice(def: WeaponDef, tier: Tier, wave: number): number {
  return Math.max(1, Math.round(weaponPrice(def, tier, wave) * 0.5))
}

export function harvestPayout(harvesting: number): number {
  return Math.max(0, Math.round(harvesting))
}

export function materialDropValue(def: EnemyDef, wave: number, rng: Rng): number {
  let n = Math.max(1, def.materials)
  if (rng.chance(clamp(0.1 + wave * 0.008, 0, 0.45))) n += 1
  return n
}
