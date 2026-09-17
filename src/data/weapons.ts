import { TAU } from '../core/math.ts'
import { STAT_KEYS } from '../core/types.ts'
import type {
  ProjectileDef,
  Stats,
  Tier,
  WeaponBehavior,
  WeaponDef,
  WeaponId,
  WeaponTier,
} from '../core/types.ts'

const MELEE_BONUS = '+1 Armor per 2 melee weapons'
const RANGED_BONUS = '+3 Ranged Damage per 2 ranged weapons'
const ELEM_BONUS = '+1 Elemental Damage per 2 elemental weapons'

function t(
  damage: number,
  cooldown: number,
  range: number,
  knockback: number,
  critChance: number,
  critMult: number,
  price: number,
  lifeSteal?: number,
): WeaponTier {
  const row: WeaponTier = { damage, cooldown, range, knockback, critChance, critMult, price }
  if (lifeSteal !== undefined) row.lifeSteal = lifeSteal
  return row
}

function bullet(over: Partial<ProjectileDef> = {}): ProjectileDef {
  return {
    speed: 520,
    radius: 4,
    life: 0.85,
    pierce: 0,
    trail: 'ink',
    paint: 'bullet',
    ...over,
  }
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fist: {
    id: 'fist',
    name: 'Fist',
    class: 'melee',
    flavor: 'A potato with knuckles. Range measured in grudges.',
    paint: 'fist',
    behavior: { type: 'thrust', reach: 16 },
    tiers: {
      1: t(4, 0.42, 68, 8, 3, 1.5, 12),
      2: t(7, 0.38, 74, 10, 4, 1.6, 28),
      3: t(11, 0.34, 80, 12, 5, 1.75, 54),
      4: t(16, 0.3, 88, 14, 8, 2, 100),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    class: 'melee',
    flavor: 'Kitchen issue. Still waiting on the tomato.',
    paint: 'knife',
    behavior: { type: 'thrust', reach: 22 },
    tiers: {
      1: t(5, 0.32, 82, 4, 8, 2, 15),
      2: t(8, 0.28, 88, 5, 10, 2.1, 32),
      3: t(13, 0.24, 96, 6, 12, 2.25, 62),
      4: t(19, 0.2, 106, 8, 16, 2.5, 115),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  stick: {
    id: 'stick',
    name: 'Stick',
    class: 'melee',
    flavor: 'Picked it up. Did not put it down. Philosophy.',
    paint: 'stick',
    behavior: { type: 'sweep', arc: 1.85 },
    tiers: {
      1: t(6, 0.7, 108, 10, 3, 1.75, 12),
      2: t(10, 0.64, 116, 12, 4, 1.85, 28),
      3: t(15, 0.58, 126, 14, 5, 2, 55),
      4: t(22, 0.52, 138, 18, 7, 2.2, 100),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  sword: {
    id: 'sword',
    name: 'Sword',
    class: 'melee',
    flavor: 'Too fancy for a tuber. Using it anyway.',
    paint: 'sword',
    behavior: { type: 'sweep', arc: 2.15 },
    tiers: {
      1: t(8, 0.82, 124, 12, 5, 2, 18),
      2: t(13, 0.74, 132, 14, 6, 2.1, 38),
      3: t(20, 0.66, 142, 16, 8, 2.25, 72),
      4: t(30, 0.58, 156, 20, 10, 2.5, 130),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  spear: {
    id: 'spear',
    name: 'Spear',
    class: 'melee',
    flavor: 'A stick that made better choices.',
    paint: 'spear',
    behavior: { type: 'thrust', reach: 42 },
    tiers: {
      1: t(9, 0.92, 172, 14, 4, 2, 20),
      2: t(14, 0.84, 188, 16, 5, 2.1, 42),
      3: t(22, 0.76, 204, 18, 6, 2.25, 80),
      4: t(32, 0.66, 224, 22, 8, 2.5, 145),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    class: 'melee',
    flavor: 'If it still moves, the argument is unfinished.',
    paint: 'hammer',
    behavior: { type: 'sweep', arc: 1.55 },
    tiers: {
      1: t(14, 1.38, 118, 28, 3, 2, 22),
      2: t(22, 1.26, 126, 32, 4, 2.15, 46),
      3: t(34, 1.14, 136, 38, 5, 2.3, 88),
      4: t(50, 1.0, 148, 46, 7, 2.6, 155),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  scythe: {
    id: 'scythe',
    name: 'Scythe',
    class: 'melee',
    flavor: 'Harvests everything. Has opinions about wheat.',
    paint: 'scythe',
    behavior: { type: 'sweep', arc: TAU * 0.46 },
    tiers: {
      1: t(10, 1.02, 142, 10, 6, 2, 24),
      2: t(16, 0.94, 154, 12, 8, 2.15, 50),
      3: t(25, 0.86, 166, 14, 10, 2.3, 92, 4),
      4: t(38, 0.76, 182, 16, 14, 2.6, 160, 8),
    },
    scaling: { meleeDamage: 1 },
    classBonus: MELEE_BONUS,
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    class: 'ranged',
    flavor: 'Six shots of diplomacy. Reload not included in the speech.',
    paint: 'pistol',
    behavior: { type: 'shoot', projectile: bullet() },
    tiers: {
      1: t(8, 0.7, 380, 6, 5, 2, 16),
      2: t(13, 0.62, 400, 7, 6, 2.1, 34),
      3: t(20, 0.54, 422, 8, 8, 2.25, 65),
      4: t(30, 0.46, 450, 10, 10, 2.5, 120),
    },
    scaling: { rangedDamage: 1 },
    classBonus: RANGED_BONUS,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    class: 'ranged',
    flavor: 'Three opinions, rapidly.',
    paint: 'smg',
    behavior: {
      type: 'shoot',
      projectile: bullet({ speed: 560, radius: 3, life: 0.7 }),
      burst: 3,
      burstDelay: 0.07,
    },
    tiers: {
      1: t(4, 0.82, 338, 3, 4, 1.75, 20),
      2: t(6, 0.74, 352, 3, 5, 1.85, 42),
      3: t(10, 0.66, 368, 4, 6, 2, 80),
      4: t(15, 0.56, 388, 5, 8, 2.2, 140),
    },
    scaling: { rangedDamage: 1 },
    classBonus: RANGED_BONUS,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    class: 'ranged',
    flavor: 'A polite cone of no.',
    paint: 'shotgun',
    behavior: {
      type: 'shoot',
      projectile: bullet({ speed: 420, radius: 3.5, life: 0.42, paint: 'pellet' }),
      count: 5,
      spread: 0.52,
    },
    tiers: {
      1: t(5, 1.12, 210, 14, 3, 1.75, 22),
      2: t(8, 1.02, 226, 16, 4, 1.9, 46),
      3: t(12, 0.92, 244, 18, 5, 2.1, 88),
      4: t(18, 0.82, 266, 22, 7, 2.3, 150),
    },
    scaling: { rangedDamage: 1 },
    classBonus: RANGED_BONUS,
  },
  slingshot: {
    id: 'slingshot',
    name: 'Slingshot',
    class: 'ranged',
    flavor: 'Childhood toy. Adulthood problem.',
    paint: 'slingshot',
    behavior: {
      type: 'shoot',
      projectile: {
        speed: 360,
        radius: 6,
        life: 1.15,
        pierce: 0,
        bounce: 1,
        trail: 'ink',
        paint: 'stone',
      },
    },
    tiers: {
      1: t(9, 0.92, 318, 10, 6, 2, 15),
      2: t(14, 0.84, 338, 12, 8, 2.15, 32),
      3: t(22, 0.76, 360, 14, 10, 2.3, 62),
      4: t(32, 0.66, 388, 16, 14, 2.6, 115),
    },
    scaling: { rangedDamage: 1 },
    classBonus: RANGED_BONUS,
  },
  crossbow: {
    id: 'crossbow',
    name: 'Crossbow',
    class: 'ranged',
    flavor: 'Loads slow. Arrives committed.',
    paint: 'crossbow',
    behavior: {
      type: 'shoot',
      projectile: {
        speed: 640,
        radius: 4,
        life: 1.05,
        pierce: 2,
        trail: 'ink',
        paint: 'arrow',
      },
    },
    tiers: {
      1: t(12, 1.22, 418, 8, 8, 2.25, 24),
      2: t(19, 1.12, 442, 10, 10, 2.4, 50),
      3: t(28, 1.02, 468, 12, 12, 2.6, 95),
      4: t(42, 0.9, 508, 14, 16, 3, 165),
    },
    scaling: { rangedDamage: 1 },
    classBonus: RANGED_BONUS,
  },
  wand: {
    id: 'wand',
    name: 'Wand',
    class: 'elemental',
    flavor: 'A stick that went to night school.',
    paint: 'wand',
    behavior: {
      type: 'shoot',
      projectile: {
        speed: 320,
        radius: 5,
        life: 1.25,
        pierce: 0,
        homing: 0.5,
        trail: 'spark',
        paint: 'bolt',
      },
    },
    tiers: {
      1: t(7, 0.78, 292, 4, 5, 2, 18),
      2: t(11, 0.7, 314, 5, 6, 2.15, 38),
      3: t(17, 0.62, 336, 6, 8, 2.3, 72),
      4: t(26, 0.52, 364, 8, 10, 2.6, 130),
    },
    scaling: { elementalDamage: 1 },
    classBonus: ELEM_BONUS,
  },
  torch: {
    id: 'torch',
    name: 'Torch',
    class: 'elemental',
    flavor: 'Personal weather: unpleasant.',
    paint: 'torch',
    behavior: { type: 'aura', radius: 88, tick: 0.4 },
    tiers: {
      1: t(4, 0.4, 88, 2, 0, 1.5, 16),
      2: t(6, 0.38, 98, 2, 0, 1.5, 34),
      3: t(9, 0.35, 112, 3, 0, 1.5, 65),
      4: t(14, 0.3, 130, 4, 0, 1.5, 120),
    },
    scaling: { elementalDamage: 1, meleeDamage: 0.25 },
    effects: ['burn'],
    classBonus: ELEM_BONUS,
  },
  flint: {
    id: 'flint',
    name: 'Flint',
    class: 'elemental',
    flavor: 'Sparks first. Questions later. Questions also on fire.',
    paint: 'flint',
    behavior: {
      type: 'shoot',
      projectile: {
        speed: 300,
        radius: 7,
        life: 0.72,
        pierce: 0,
        trail: 'ember',
        paint: 'flame',
      },
    },
    tiers: {
      1: t(6, 0.74, 248, 6, 4, 2, 20),
      2: t(10, 0.66, 266, 7, 5, 2.1, 42),
      3: t(15, 0.58, 286, 8, 6, 2.25, 80),
      4: t(23, 0.5, 312, 10, 8, 2.5, 140),
    },
    scaling: { elementalDamage: 1, rangedDamage: 0.35 },
    effects: ['burn'],
    classBonus: ELEM_BONUS,
  },
  lightning: {
    id: 'lightning',
    name: 'Lightning',
    class: 'elemental',
    flavor: 'Sky mail. Very rude postage.',
    paint: 'lightning',
    behavior: { type: 'chain', jumps: 3, jumpRange: 168 },
    tiers: {
      1: t(8, 1.08, 276, 4, 5, 2, 26),
      2: t(13, 0.98, 298, 5, 6, 2.15, 54),
      3: t(20, 0.88, 322, 6, 8, 2.3, 100),
      4: t(30, 0.76, 356, 8, 10, 2.6, 175),
    },
    scaling: { elementalDamage: 1 },
    classBonus: ELEM_BONUS,
  },
}

export const WEAPON_LIST: WeaponDef[] = [
  WEAPONS.fist,
  WEAPONS.knife,
  WEAPONS.stick,
  WEAPONS.sword,
  WEAPONS.spear,
  WEAPONS.hammer,
  WEAPONS.scythe,
  WEAPONS.pistol,
  WEAPONS.smg,
  WEAPONS.shotgun,
  WEAPONS.slingshot,
  WEAPONS.crossbow,
  WEAPONS.wand,
  WEAPONS.torch,
  WEAPONS.flint,
  WEAPONS.lightning,
]

export function weaponDamage(def: WeaponDef, tier: Tier, stats: Stats): number {
  const row = def.tiers[tier]
  let damage = row.damage
  for (const key of STAT_KEYS) {
    const scale = def.scaling[key]
    if (scale) damage += stats[key] * scale
  }
  damage *= 1 + stats.damage / 100
  return Math.max(0, Math.round(damage))
}

export function weaponCooldown(def: WeaponDef, tier: Tier, stats: Stats): number {
  const cd = def.tiers[tier].cooldown / Math.max(0.05, 1 + stats.attackSpeed / 100)
  return Math.max(0.12, cd)
}

export function weaponRange(def: WeaponDef, tier: Tier, stats: Stats): number {
  return def.tiers[tier].range + stats.range
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

function behaviorLine(behavior: WeaponBehavior, effects: WeaponDef['effects']): string {
  const extra = effects?.includes('burn') ? ', burn' : ''
  switch (behavior.type) {
    case 'thrust':
      return behavior.reach <= 20 ? `Short thrust${extra}` : `Long thrust${extra}`
    case 'sweep':
      return behavior.arc >= 2.4 ? `Wide sweep${extra}` : `Sweep${extra}`
    case 'shoot': {
      const bits: string[] = []
      if (behavior.count && behavior.count > 1) bits.push(`${behavior.count} pellets`)
      if (behavior.burst && behavior.burst > 1) bits.push(`Burst ${behavior.burst}`)
      if (behavior.projectile.pierce > 0) bits.push(`Pierces ${behavior.projectile.pierce} enemies`)
      if (behavior.projectile.bounce) {
        bits.push(behavior.projectile.bounce === 1 ? 'Bounces 1 time' : `Bounces ${behavior.projectile.bounce} times`)
      }
      if (behavior.projectile.homing) bits.push('Homing bolts')
      if (behavior.spread && behavior.spread > 0.35 && !(behavior.count && behavior.count > 1)) bits.push('Wide spread')
      if (bits.length === 0) bits.push(behavior.projectile.paint === 'flame' ? 'Flame shot' : 'Ranged shot')
      return `${bits.join(', ')}${extra}`
    }
    case 'orbit':
      return `${behavior.count} orbiting blades${extra}`
    case 'aura':
      return `Burning aura${extra && extra !== ', burn' ? extra : ''}`
    case 'chain':
      return `Chains ${behavior.jumps} times${extra}`
  }
}

export function weaponLines(def: WeaponDef, tier: Tier, stats?: Stats): string[] {
  const row = def.tiers[tier]
  const damage = stats ? weaponDamage(def, tier, stats) : row.damage
  const cooldown = stats ? weaponCooldown(def, tier, stats) : row.cooldown
  const range = stats ? weaponRange(def, tier, stats) : row.range
  const crit = row.critChance + (stats?.critChance ?? 0)
  const knockback = row.knockback * (1 + (stats?.knockback ?? 0) / 100)
  const lines = [
    `Damage ${formatQty(damage)}`,
    `Cooldown ${formatQty(cooldown)}s`,
    `Range ${formatQty(range)}`,
  ]
  if (crit > 0) lines.push(`Crit ${formatQty(crit)}% ×${formatQty(row.critMult)}`)
  if (knockback > 0) lines.push(`Knockback ${formatQty(Math.round(knockback * 10) / 10)}`)
  const lifeSteal = (row.lifeSteal ?? 0) + (stats?.lifeSteal ?? 0)
  if (lifeSteal > 0) lines.push(`Life Steal ${formatQty(lifeSteal)}%`)
  lines.push(behaviorLine(def.behavior, def.effects))
  return lines
}
