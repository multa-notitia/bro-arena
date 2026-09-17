import { clamp } from '../core/math.ts'
import {
  PERCENT_STATS,
  STAT_KEYS,
  STAT_LABELS,
  type CharacterDef,
  type StatKey,
  type Stats,
  type Tier,
  type WeaponId,
} from '../core/types.ts'
import { ITEMS } from './items.ts'
import { WEAPONS } from './weapons.ts'

export const BASE_STATS: Stats = {
  maxHp: 10,
  hpRegen: 0,
  lifeSteal: 0,
  damage: 0,
  meleeDamage: 0,
  rangedDamage: 0,
  elementalDamage: 0,
  attackSpeed: 0,
  critChance: 0,
  range: 0,
  armor: 0,
  dodge: 0,
  speed: 0,
  luck: 0,
  harvesting: 0,
  pickupRange: 0,
  xpGain: 0,
  knockback: 0,
  consumableHeal: 0,
}

export function emptyStats(): Stats {
  return {
    maxHp: 0,
    hpRegen: 0,
    lifeSteal: 0,
    damage: 0,
    meleeDamage: 0,
    rangedDamage: 0,
    elementalDamage: 0,
    attackSpeed: 0,
    critChance: 0,
    range: 0,
    armor: 0,
    dodge: 0,
    speed: 0,
    luck: 0,
    harvesting: 0,
    pickupRange: 0,
    xpGain: 0,
    knockback: 0,
    consumableHeal: 0,
  }
}

export function addStats(into: Stats, add: Partial<Stats>, mult = 1): Stats {
  for (const key of STAT_KEYS) {
    const value = add[key]
    if (value !== undefined) into[key] += value * mult
  }
  return into
}

export function computeStats(
  character: CharacterDef,
  itemIds: string[],
  levelBonus: Partial<Stats>,
  weapons: { id: WeaponId; tier: Tier }[],
): Stats {
  const stats = emptyStats()
  addStats(stats, BASE_STATS)
  addStats(stats, character.stats)
  for (const id of itemIds) {
    const item = ITEMS[id]
    if (item) addStats(stats, item.stats)
  }
  addStats(stats, levelBonus)

  let melee = 0
  let ranged = 0
  let elemental = 0
  for (const weapon of weapons) {
    const def = WEAPONS[weapon.id]
    if (!def) continue
    if (def.class === 'melee') melee += 1
    else if (def.class === 'ranged') ranged += 1
    else elemental += 1
  }
  stats.armor += Math.floor(melee / 2)
  stats.rangedDamage += Math.floor(ranged / 2) * 3
  stats.elementalDamage += Math.floor(elemental / 2)

  stats.dodge = clamp(stats.dodge, -1e6, 60)
  stats.speed = clamp(stats.speed, -80, 1e6)
  stats.maxHp = Math.max(1, stats.maxHp)
  stats.attackSpeed = Math.max(-90, stats.attackSpeed)
  return stats
}

function isPercent(key: StatKey): boolean {
  return PERCENT_STATS.includes(key)
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

export function formatStat(key: StatKey, value: number): string {
  const abs = formatNumber(Math.abs(value))
  const sign = value < 0 ? '-' : '+'
  return isPercent(key) ? `${sign}${abs}%` : `${sign}${abs}`
}

export function statLine(key: StatKey, value: number): string {
  return `${formatStat(key, value)} ${STAT_LABELS[key]}`
}

export function statLines(stats: Partial<Stats>): string[] {
  const lines: string[] = []
  for (const key of STAT_KEYS) {
    const value = stats[key]
    if (value === undefined || value === 0) continue
    lines.push(statLine(key, value))
  }
  return lines
}
