import { CROP_IDS } from '../core/types.ts'
import type { World } from '../core/types.ts'
import { computeStats } from '../data/stats.ts'
import { getLevelBonus, makeWeapon, syncWeaponSlots } from './player.ts'
import { chaosDemoRequested, chaosDemoWave } from './chaosDirector.ts'

/** Preview kit. Early waves stay a real garden; later waves add tools, not a soup. */
export function applyChaosDemo(world: World): number {
  if (!chaosDemoRequested()) return 1
  const wave = chaosDemoWave()
  const farm = world.farm
  farm.unlocked = [...CROP_IDS]
  farm.seeds = { pea: 12, sprout: 8, carrot: 6, garlic: 4, pumpkin: 0, chili: 0 }
  const early = wave <= 3
  const cycle = early ? (['pea', 'pea', 'sprout'] as const) : (['pea', 'sprout', 'carrot'] as const)
  const sow = early ? Math.min(4, farm.plots.length) : Math.min(8, farm.plots.length)
  for (let i = 0; i < farm.plots.length; i++) {
    const plot = farm.plots[i]
    if (!plot) continue
    plot.crop = null
    plot.growth = 0
    if (i >= sow) continue
    const crop = cycle[i % cycle.length]
    if (!crop) continue
    plot.crop = crop
    plot.growth = 0.7
    farm.seeds[crop] = Math.max(0, farm.seeds[crop] - 1)
  }
  const p = world.player
  const have = new Set(p.weapons.map((w) => w.id))
  const kit = early ? (['knife'] as const) : (['knife', 'hammer'] as const)
  for (const id of kit) {
    if (have.has(id) || p.weapons.length >= 6) continue
    p.weapons.push(makeWeapon(id, early ? 1 : 2, p.weapons.length))
  }
  syncWeaponSlots(p)
  p.stats = computeStats(
    p.character,
    p.items,
    getLevelBonus(p),
    p.weapons.map((w) => ({ id: w.id, tier: w.tier })),
    p.form,
  )
  const floorHp = early ? 18 : 160
  p.stats = { ...p.stats, maxHp: Math.max(p.stats.maxHp, floorHp) }
  p.hp = p.stats.maxHp
  p.invuln = early ? 1.2 : 8
  return wave
}
