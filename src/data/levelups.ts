import { Rng } from '../core/math.ts'
import type { LevelUpOption, Stats, Tier } from '../core/types.ts'

function opt(
  id: string,
  title: string,
  blurb: string,
  tier: Tier,
  stats: Partial<Stats>,
): LevelUpOption {
  return { id, title, blurb, tier, stats }
}

const POOL: LevelUpOption[] = [
  opt('t1-maxhp', '+3 Max HP', 'Thicker skin. Still peelable.', 1, { maxHp: 3 }),
  opt('t1-regen', '+1 HP Regen', 'Roots find water.', 1, { hpRegen: 1 }),
  opt('t1-lifesteal', '+3% Life Steal', 'Takes a little back from whatever it cuts.', 1, { lifeSteal: 3 }),
  opt('t1-damage', '+5% Damage', 'Everything you swing swings harder.', 1, { damage: 5 }),
  opt('t1-melee', '+2 Melee Damage', 'The close work lands heavier.', 1, { meleeDamage: 2 }),
  opt('t1-ranged', '+2 Ranged Damage', 'What leaves the hand arrives meaner.', 1, { rangedDamage: 2 }),
  opt('t1-elem', '+1 Elemental Damage', 'Warm to the touch. Then not.', 1, { elementalDamage: 1 }),
  opt('t1-atkspd', '+8% Attack Speed', 'Hands find the next row faster.', 1, { attackSpeed: 8 }),
  opt('t1-crit', '+5% Crit Chance', 'Sometimes the cut means it.', 1, { critChance: 5 }),
  opt('t1-range', '+20 Range', 'The row got longer.', 1, { range: 20 }),
  opt('t1-armor', '+1 Armor', 'A rind where there wasn\'t one.', 1, { armor: 1 }),
  opt('t1-dodge', '+5% Dodge', 'Not where they thought you were.', 1, { dodge: 5 }),
  opt('t1-speed', '+8% Speed', 'Legs. Who knew.', 1, { speed: 8 }),
  opt('t1-luck', '+8% Luck', 'The mud missed you again.', 1, { luck: 8 }),
  opt('t1-harvest', '+5 Harvesting', 'Something is left in the soil at dawn.', 1, { harvesting: 5 }),
  opt('t1-pickup', '+20 Pickup Range', 'Things roll toward you now.', 1, { pickupRange: 20 }),
  opt('t1-xp', '+10% XP Gain', 'You grow faster in the dark.', 1, { xpGain: 10 }),
  opt('t1-knock', '+10% Knockback', 'The soil gives them back a step.', 1, { knockback: 10 }),
  opt('t1-fruit', '+1 Consumable Heal', 'Fruit from the trees goes further.', 1, { consumableHeal: 1 }),

  opt('t2-maxhp', '+6 Max HP', 'Thicker still. The peel complains.', 2, { maxHp: 6 }),
  opt('t2-regen', '+2 HP Regen', 'Roots find more water.', 2, { hpRegen: 2 }),
  opt('t2-damage', '+10% Damage', 'Everything you swing swings harder.', 2, { damage: 10 }),
  opt('t2-melee', '+4 Melee Damage', 'Close work, done with the shoulder.', 2, { meleeDamage: 4 }),
  opt('t2-ranged', '+4 Ranged Damage', 'The far row is no longer safe.', 2, { rangedDamage: 4 }),
  opt('t2-elem', '+2 Elemental Damage', 'Warm to the touch. Then not.', 2, { elementalDamage: 2 }),
  opt('t2-atkspd', '+15% Attack Speed', 'The hands do not wait.', 2, { attackSpeed: 15 }),
  opt('t2-crit', '+10% Crit Chance', 'The cut finds the soft part.', 2, { critChance: 10 }),
  opt('t2-range', '+40 Range', 'Reach past the next row.', 2, { range: 40 }),
  opt('t2-armor', '+3 Armor', 'A rind where there wasn\'t one.', 2, { armor: 3 }),
  opt('t2-dodge', '+10% Dodge', 'Not where they thought you were.', 2, { dodge: 10 }),
  opt('t2-speed', '+15% Speed', 'Legs. Who knew.', 2, { speed: 15 }),
  opt('t2-luck', '+15% Luck', 'The mud missed you again.', 2, { luck: 15 }),
  opt('t2-harvest', '+10 Harvesting', 'Something is left in the soil at dawn.', 2, { harvesting: 10 }),
  opt('t2-xp', '+20% XP Gain', 'You grow faster in the dark.', 2, { xpGain: 20 }),
  opt('t2-lifesteal', '+6% Life Steal', 'Takes more back from whatever it cuts.', 2, { lifeSteal: 6 }),

  opt('t3-armor-regen', '+2 Armor +2 HP Regen', 'A rind, and roots under it.', 3, { armor: 2, hpRegen: 2 }),
  opt('t3-hp-speed', '+4 Max HP +8% Speed', 'Thicker skin. Legs. Who knew.', 3, { maxHp: 4, speed: 8 }),
  opt('t3-melee-atk', '+3 Melee +8% Attack Speed', 'The close work lands, then lands again.', 3, { meleeDamage: 3, attackSpeed: 8 }),
  opt('t3-ranged-range', '+3 Ranged +25 Range', 'Stay in your row. Hit theirs.', 3, { rangedDamage: 3, range: 25 }),
  opt('t3-elem-crit', '+2 Elemental +8% Crit', 'Warm. Then exact.', 3, { elementalDamage: 2, critChance: 8 }),
  opt('t3-dmg-dodge', '+10% Damage +5% Dodge', 'Swing harder. Not where they thought.', 3, { damage: 10, dodge: 5 }),
  opt('t3-luck-harvest', '+12% Luck +8 Harvesting', 'The mud missed you. Dawn still pays.', 3, { luck: 12, harvesting: 8 }),
  opt('t3-xp-pickup', '+15% XP +20 Pickup Range', 'Grow faster. Things roll toward you.', 3, { xpGain: 15, pickupRange: 20 }),
  opt('t3-armor-hp', '+3 Armor +6 Max HP', 'Rind and flesh, both thicker.', 3, { armor: 3, maxHp: 6 }),
  opt('t3-ls-regen', '+8% Life Steal +2 HP Regen', 'Takes it back. Roots find the rest.', 3, { lifeSteal: 8, hpRegen: 2 }),
  opt('t3-knock-melee', '+15% Knockback +2 Melee', 'The soil gives them back. Then the hands.', 3, { knockback: 15, meleeDamage: 2 }),
  opt('t3-atk-range', '+8% Attack Speed +15 Range', 'Faster hands. A longer row.', 3, { attackSpeed: 8, range: 15 }),

  opt('t4-melee-speed', '+10 Melee Damage -8% Speed', 'The close work costs the legs.', 4, { meleeDamage: 10, speed: -8 }),
  opt('t4-ranged-armor', '+10 Ranged Damage -2 Armor', 'Thin skin. Long reach.', 4, { rangedDamage: 10, armor: -2 }),
  opt('t4-elem-range', '+8 Elemental Damage -25 Range', 'Hot. Short. The row closes in.', 4, { elementalDamage: 8, range: -25 }),
  opt('t4-dmg-hp', '+20% Damage -4 Max HP', 'Harder swing. Thinner flesh.', 4, { damage: 20, maxHp: -4 }),
  opt('t4-dodge-armor', '+20% Dodge -3 Armor', 'Not where they thought. No rind left.', 4, { dodge: 20, armor: -3 }),
  opt('t4-armor-speed', '+8 Armor -15% Speed', 'A rind. A slow one.', 4, { armor: 8, speed: -15 }),
  opt('t4-atk-dmg', '+25% Attack Speed -10% Damage', 'Many cuts. Each one smaller.', 4, { attackSpeed: 25, damage: -10 }),
  opt('t4-harvest-speed', '+20 Harvesting -10% Speed', 'Dawn pays. The legs do not.', 4, { harvesting: 20, speed: -10 }),
  opt('t4-crit-hp', '+15% Crit +10% Damage -3 Max HP', 'The cut means it. The flesh is thinner.', 4, { critChance: 15, damage: 10, maxHp: -3 }),
  opt('t4-hp-dodge', '+12 Max HP -10% Dodge', 'Thicker. Easier to find.', 4, { maxHp: 12, dodge: -10 }),
]

const BY_TIER: Record<Tier, LevelUpOption[]> = { 1: [], 2: [], 3: [], 4: [] }
for (const option of POOL) BY_TIER[option.tier].push(option)

function rollTier(rng: Rng, luck: number, wave: number): Tier {
  const t4 = 0.01 + wave * 0.003 + luck * 0.001
  const t3 = 0.05 + wave * 0.008 + luck * 0.002
  const t2 = 0.1 + wave * 0.015 + luck * 0.003
  const roll = rng.next()
  if (roll < t4) return 4
  if (roll < t4 + t3) return 3
  if (roll < t4 + t3 + t2) return 2
  return 1
}

export function rollLevelUps(rng: Rng, luck: number, wave: number, count = 4): LevelUpOption[] {
  const picked = new Set<string>()
  const result: LevelUpOption[] = []
  let guard = 0
  while (result.length < count && guard < 80) {
    guard += 1
    const tier = rollTier(rng, luck, wave)
    const preferred = BY_TIER[tier].filter((o) => !picked.has(o.id))
    const fallback = POOL.filter((o) => !picked.has(o.id))
    const pool = preferred.length > 0 ? preferred : fallback
    if (pool.length === 0) break
    const choice = rng.pick(pool)
    picked.add(choice.id)
    result.push(choice)
  }
  return result
}
