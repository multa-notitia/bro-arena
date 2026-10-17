import { CROP_IDS } from '../core/types.ts'
import type { World } from '../core/types.ts'
import { computeStats } from '../data/stats.ts'
import { getLevelBonus, makeWeapon, syncWeaponSlots } from './player.ts'
import { chaosDemoRequested, chaosDemoWave } from './chaosDirector.ts'

/** Fill every bed and slap on a knife + hammer so death_slice / death_smash can fire. */
export function applyChaosDemo(world: World): number {
  if (!chaosDemoRequested()) return 1
  const farm = world.farm
  farm.seeds = { pea: 24, sprout: 24, carrot: 16, garlic: 12, pumpkin: 12, chili: 12 }
  farm.unlocked = [...CROP_IDS]
  const cycle = ['pea', 'sprout', 'carrot'] as const
  for (let i = 0; i < farm.plots.length; i++) {
    const plot = farm.plots[i]
    if (!plot) continue
    const crop = cycle[i % cycle.length]
    if (!crop) continue
    plot.crop = crop
    plot.growth = 0.85
    farm.seeds[crop] = Math.max(0, farm.seeds[crop] - 1)
  }
  const p = world.player
  const have = new Set(p.weapons.map((w) => w.id))
  for (const id of ['knife', 'hammer', 'stick'] as const) {
    if (have.has(id) || p.weapons.length >= 6) continue
    p.weapons.push(makeWeapon(id, 2, p.weapons.length))
  }
  syncWeaponSlots(p)
  p.stats = computeStats(
    p.character,
    p.items,
    getLevelBonus(p),
    p.weapons.map((w) => ({ id: w.id, tier: w.tier })),
    p.form,
  )
  p.stats = { ...p.stats, maxHp: Math.max(p.stats.maxHp, 72) }
  p.hp = p.stats.maxHp
  p.invuln = 1.8
  return chaosDemoWave()
}
