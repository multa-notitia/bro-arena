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
  opt('t1-maxhp', '+3 Max HP', 'More potato. Harder to mash.', 1, { maxHp: 3 }),
  opt('t1-regen', '+1 HP Regen', 'A slow leak, but inward.', 1, { hpRegen: 1 }),
  opt('t1-lifesteal', '+3% Life Steal', 'Bite back. Politely.', 1, { lifeSteal: 3 }),
  opt('t1-damage', '+5% Damage', 'Everything hits a little ruder.', 1, { damage: 5 }),
  opt('t1-melee', '+2 Melee Damage', 'The close work pays better.', 1, { meleeDamage: 2 }),
  opt('t1-ranged', '+2 Ranged Damage', 'Over there, but worse for them.', 1, { rangedDamage: 2 }),
  opt('t1-elem', '+1 Elemental Damage', 'A spark with ambition.', 1, { elementalDamage: 1 }),
  opt('t1-atkspd', '+8% Attack Speed', 'Hands faster than thoughts. Fine.', 1, { attackSpeed: 8 }),
  opt('t1-crit', '+5% Crit Chance', 'Sometimes the hit means it.', 1, { critChance: 5 }),
  opt('t1-range', '+20 Range', 'Arm, but longer. Still a potato.', 1, { range: 20 }),
  opt('t1-armor', '+1 Armor', 'Skin like last week\'s bread.', 1, { armor: 1 }),
  opt('t1-dodge', '+5% Dodge', 'Not there. On purpose.', 1, { dodge: 5 }),
  opt('t1-speed', '+8% Speed', 'Walk like you have somewhere worse to be.', 1, { speed: 8 }),
  opt('t1-luck', '+8% Luck', 'The shop starts blinking at you.', 1, { luck: 8 }),
  opt('t1-harvest', '+5 Harvesting', 'Wave ends. Dirt pays.', 1, { harvesting: 5 }),
  opt('t1-pickup', '+20 Pickup Range', 'Green bits come when called.', 1, { pickupRange: 20 }),
  opt('t1-xp', '+10% XP Gain', 'Learn faster. Forget nothing. Still a tuber.', 1, { xpGain: 10 }),
  opt('t1-knock', '+10% Knockback', 'Personal space, enforced.', 1, { knockback: 10 }),
  opt('t1-fruit', '+1 Consumable Heal', 'Fruit works overtime.', 1, { consumableHeal: 1 }),

  opt('t2-maxhp', '+6 Max HP', 'Thick. Unapologetic.', 2, { maxHp: 6 }),
  opt('t2-regen', '+2 HP Regen', 'Heals like it has a union.', 2, { hpRegen: 2 }),
  opt('t2-damage', '+10% Damage', 'The argument got louder.', 2, { damage: 10 }),
  opt('t2-melee', '+4 Melee Damage', 'Fists filed a promotion.', 2, { meleeDamage: 4 }),
  opt('t2-ranged', '+4 Ranged Damage', 'The horizon is not safe.', 2, { rangedDamage: 4 }),
  opt('t2-elem', '+2 Elemental Damage', 'Weather with a grudge.', 2, { elementalDamage: 2 }),
  opt('t2-atkspd', '+15% Attack Speed', 'Blur. Then a mess.', 2, { attackSpeed: 15 }),
  opt('t2-crit', '+10% Crit Chance', 'Lucky shots stop being luck.', 2, { critChance: 10 }),
  opt('t2-range', '+40 Range', 'Reach like a complaint.', 2, { range: 40 }),
  opt('t2-armor', '+3 Armor', 'Boil-proof. Almost.', 2, { armor: 3 }),
  opt('t2-dodge', '+10% Dodge', 'A potato in theory only.', 2, { dodge: 10 }),
  opt('t2-speed', '+15% Speed', 'The dirt cannot keep up.', 2, { speed: 15 }),
  opt('t2-luck', '+15% Luck', 'Rerolls flinch first.', 2, { luck: 15 }),
  opt('t2-harvest', '+10 Harvesting', 'The field tips its hat.', 2, { harvesting: 10 }),
  opt('t2-xp', '+20% XP Gain', 'Levels arrive early, stay late.', 2, { xpGain: 20 }),
  opt('t2-lifesteal', '+6% Life Steal', 'Dinner during the fight.', 2, { lifeSteal: 6 }),

  opt('t3-armor-regen', '+2 Armor +2 HP Regen', 'Tough. Then tougher. Then bored.', 3, { armor: 2, hpRegen: 2 }),
  opt('t3-hp-speed', '+4 Max HP +8% Speed', 'Big potato. Fast potato. Rude potato.', 3, { maxHp: 4, speed: 8 }),
  opt('t3-melee-atk', '+3 Melee +8% Attack Speed', 'Close work, done faster, done meaner.', 3, { meleeDamage: 3, attackSpeed: 8 }),
  opt('t3-ranged-range', '+3 Ranged +25 Range', 'Stay away. Hit anyway.', 3, { rangedDamage: 3, range: 25 }),
  opt('t3-elem-crit', '+2 Elemental +8% Crit', 'Sparks that mean it.', 3, { elementalDamage: 2, critChance: 8 }),
  opt('t3-dmg-dodge', '+10% Damage +5% Dodge', 'Hit them. Miss their hit. Repeat.', 3, { damage: 10, dodge: 5 }),
  opt('t3-luck-harvest', '+12% Luck +8 Harvesting', 'The paddock likes you. Unsettling.', 3, { luck: 12, harvesting: 8 }),
  opt('t3-xp-pickup', '+15% XP +20 Pickup Range', 'Learn more. Bend less.', 3, { xpGain: 15, pickupRange: 20 }),
  opt('t3-armor-hp', '+3 Armor +6 Max HP', 'A shed. With feelings.', 3, { armor: 3, maxHp: 6 }),
  opt('t3-ls-regen', '+8% Life Steal +2 HP Regen', 'Two kinds of not dying.', 3, { lifeSteal: 8, hpRegen: 2 }),
  opt('t3-knock-melee', '+15% Knockback +2 Melee', 'Room. Then more room.', 3, { knockback: 15, meleeDamage: 2 }),
  opt('t3-atk-range', '+8% Attack Speed +15 Range', 'Faster hands, longer argument.', 3, { attackSpeed: 8, range: 15 }),

  opt('t4-melee-speed', '+10 Melee Damage -8% Speed', 'Hits like a barn. Walks like one too.', 4, { meleeDamage: 10, speed: -8 }),
  opt('t4-ranged-armor', '+10 Ranged Damage -2 Armor', 'Glass barrel. Long fuse. Your problem.', 4, { rangedDamage: 10, armor: -2 }),
  opt('t4-elem-range', '+8 Elemental Damage -25 Range', 'Hot. Short. Unreasonable.', 4, { elementalDamage: 8, range: -25 }),
  opt('t4-dmg-hp', '+20% Damage -4 Max HP', 'Glass cannon, farm edition.', 4, { damage: 20, maxHp: -4 }),
  opt('t4-dodge-armor', '+20% Dodge -3 Armor', 'Not hit, or very hit. Coin toss.', 4, { dodge: 20, armor: -3 }),
  opt('t4-armor-speed', '+8 Armor -15% Speed', 'A wall. A slow wall.', 4, { armor: 8, speed: -15 }),
  opt('t4-atk-dmg', '+25% Attack Speed -10% Damage', 'Many taps. Each one a suggestion.', 4, { attackSpeed: 25, damage: -10 }),
  opt('t4-harvest-speed', '+20 Harvesting -10% Speed', 'Rich dirt. Poor cardio.', 4, { harvesting: 20, speed: -10 }),
  opt('t4-crit-hp', '+15% Crit +10% Damage -3 Max HP', 'Lucky, loud, and slightly deceased.', 4, { critChance: 15, damage: 10, maxHp: -3 }),
  opt('t4-hp-dodge', '+12 Max HP -10% Dodge', 'You are a building now. Buildings get hit.', 4, { maxHp: 12, dodge: -10 }),
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
