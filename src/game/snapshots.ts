import type { HudSnapshot, ItemPaint, RunSummary, World } from '../core/types.ts'
import { ITEMS } from '../data/items.ts'
import { WEAPONS, weaponCooldown } from '../data/weapons.ts'
import { WAVE_COUNT } from '../data/waves.ts'
import { nightmaresAlive } from './enemies.ts'

export function hudSnapshot(world: World, fps: number): HudSnapshot {
  const p = world.player
  const boss = world.boss
  const displayName = p.form === 'nightmare' ? p.character.nightmare.name : p.character.name
  return {
    hp: Math.max(0, p.hp),
    maxHp: p.stats.maxHp,
    level: p.level,
    xp: p.xp,
    xpNext: p.xpNext,
    materials: p.materials,
    wave: world.wave,
    waveLeft: world.waveLeft,
    waveTotal: WAVE_COUNT,
    boss:
      boss && boss.anim.deathT < 1
        ? {
            name: boss.form === 'nightmare' ? boss.def.nightmareName || boss.def.name : boss.def.name,
            hp: Math.max(0, boss.hp),
            maxHp: boss.maxHp,
          }
        : null,
    weapons: p.weapons.map((w) => {
      const def = WEAPONS[w.id]
      const cd = weaponCooldown(def, w.tier, p.stats)
      return {
        id: w.id,
        name: def.name,
        tier: w.tier,
        paint: def.paint,
        cooldownFrac: cd > 0 ? Math.max(0, Math.min(1, w.cooldown / cd)) : 0,
      }
    }),
    characterName: displayName,
    form: p.form,
    nightmaresAlive: nightmaresAlive(world),
    fps,
  }
}

export function runSummary(
  world: World,
  opts: { won: boolean; killedBy: string | null },
): RunSummary {
  const p = world.player
  const itemCounts = new Map<string, number>()
  for (const id of p.items) itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1)
  const items: RunSummary['items'] = []
  for (const [id, count] of itemCounts) {
    const def = ITEMS[id]
    if (!def) continue
    items.push({ name: def.name, tier: def.tier, paint: def.paint as ItemPaint, count })
  }
  const displayName = p.form === 'nightmare' ? p.character.nightmare.name : p.character.name
  return {
    characterName: displayName,
    species: p.character.species,
    form: p.form,
    wave: world.wave,
    wavesTotal: WAVE_COUNT,
    won: opts.won,
    kills: p.kills,
    level: p.level,
    timeSeconds: world.time,
    damageDealt: p.damageDealt,
    damageTaken: p.damageTaken,
    materialsCollected: p.materialsCollected,
    weapons: p.weapons.map((w) => {
      const def = WEAPONS[w.id]
      return { name: def.name, tier: w.tier, paint: def.paint }
    }),
    items,
    killedBy: opts.won ? null : opts.killedBy,
  }
}
