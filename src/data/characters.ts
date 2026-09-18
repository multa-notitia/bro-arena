import type { CharacterDef, Palette } from '../core/types.ts'

const MUD = '#33241a'

function veg(
  body: string,
  shade: string,
  accent: string,
  glow: string,
  ink: string,
  eye: string,
  mud = MUD,
): Palette {
  return { body, shade, ink, accent, eye, mud, glow }
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'well-rounded',
    name: 'Spud',
    species: 'potato',
    flavor: 'A potato. Two eyes, two arms, one plan: keep walking. Always clean.',
    stats: {},
    startingWeapons: [{ id: 'pistol', tier: 1 }],
    palette: veg('#c9a962', '#8f6e36', '#6b8f71', '#d9ff5c', '#3a2a14', '#1a1208', '#2e2016'),
    perks: ['Starts with a pistol.', 'No trick. That is the trick.', 'Average tuber. Average odds.'],
    nightmare: {
      name: 'Mud Spud',
      flavor: 'Went under. Came up. Still walking, but the eyes are lit.',
      stats: { damage: 25, speed: 10, maxHp: -3 },
      perks: [
        '+25% Damage, +10% Speed, -3 Max HP.',
        'The Mud knows your name. More of them come up wrong.',
        'Screams instead of blinking.',
      ],
    },
  },
  {
    id: 'brawler',
    name: 'Turnip',
    species: 'turnip',
    flavor: 'Talks with both hands. Neither one is listening.',
    stats: { attackSpeed: 25, dodge: 12, meleeDamage: 1, speed: 5 },
    startingWeapons: [
      { id: 'fist', tier: 1 },
      { id: 'fist', tier: 1 },
    ],
    palette: veg('#efe6dc', '#b07aa8', '#7a4d8f', '#ff8a3d', '#3a2438', '#1c1018'),
    perks: ['Melee weapons only.', '+25% Attack Speed, +12% Dodge.', 'Two fists. Purple knuckles.'],
    special: 'meleeOnly',
    nightmare: {
      name: 'Rotten Turnip',
      flavor: 'The fists are the only part still purple.',
      stats: { meleeDamage: 4, attackSpeed: 15, maxHp: -4, armor: -1 },
      perks: [
        '+4 Melee Damage, +15% Attack Speed.',
        '-4 Max HP, -1 Armor. The Mud notices you.',
        'Every punch splashes.',
      ],
    },
  },
  {
    id: 'ranger',
    name: 'Carrot',
    species: 'carrot',
    flavor: 'Long. Pointed. Would rather be far away. Always clean.',
    stats: { range: 45, rangedDamage: 3, armor: -2, speed: 8 },
    startingWeapons: [{ id: 'slingshot', tier: 1 }],
    palette: veg('#e6792b', '#b3541c', '#4f8a3c', '#ffd23d', '#4a2410', '#1c1008', '#3b2a1c'),
    perks: ['Ranged weapons only.', '+45 Range, +3 Ranged Damage.', '-2 Armor. Thin skin, good eyes.'],
    special: 'rangedOnly',
    nightmare: {
      name: 'Carrot in the Dark',
      flavor: 'You can see the eyes from across the Plot. That is the point.',
      stats: { rangedDamage: 4, range: 30, maxHp: -3, dodge: -5 },
      perks: [
        '+4 Ranged Damage, +30 Range.',
        '-3 Max HP, -5% Dodge. The Mud notices you.',
        'Glows enough to aim by.',
      ],
    },
  },
  {
    id: 'bull',
    name: 'Pumpkin',
    species: 'pumpkin',
    flavor: 'Heavy in every sense. Also in that one.',
    stats: { maxHp: 12, speed: -22, armor: 3 },
    startingWeapons: [{ id: 'hammer', tier: 1 }],
    palette: veg('#e08a2e', '#a35a16', '#5a6e3a', '#ff6b2b', '#3a200c', '#1a0c06'),
    perks: [
      '+12 Max HP, +3 Armor, -22% Speed.',
      'Thorns give back half of what touches you.',
      'The hammer came with the patch.',
    ],
    special: 'thornsHalf',
    nightmare: {
      name: 'Rotting Gourd',
      flavor: 'Soft in the middle now. Harder everywhere else.',
      stats: { maxHp: 4, armor: 2, speed: -10, damage: 15, hpRegen: -1 },
      perks: [
        '+4 Max HP, +2 Armor, +15% Damage.',
        '-10% Speed, -1 HP Regen. The Mud notices you.',
        'Sits low. Screams low.',
      ],
    },
  },
  {
    id: 'lucky',
    name: 'Radish',
    species: 'radish',
    flavor: 'Small, red, and the mud missed it twice.',
    stats: { luck: 40, harvesting: 10, maxHp: -3 },
    startingWeapons: [{ id: 'knife', tier: 1 }],
    palette: veg('#e05a7a', '#a0344f', '#4f8a3c', '#ff4fd8', '#4a1824', '#1c080c', '#2e2016'),
    perks: ['+40% Luck, +10 Harvesting.', '-3 Max HP. Shopkeepers like you.', 'Starts with a knife.'],
    nightmare: {
      name: 'Mud Radish',
      flavor: "Luck didn't leave. It just got dirty.",
      stats: { luck: 40, harvesting: 12, maxHp: -3, critChance: 8 },
      perks: [
        '+40% Luck, +12 Harvesting, +8% Crit.',
        '-3 Max HP. The Mud notices you.',
        'Finds coins in the mud. Finds worse too.',
      ],
    },
  },
  {
    id: 'mage',
    name: 'Chili',
    species: 'chili',
    flavor: 'Read one book. It was about fire.',
    stats: { elementalDamage: 4, range: -40, attackSpeed: 8, critChance: 5 },
    startingWeapons: [{ id: 'wand', tier: 1 }],
    palette: veg('#d9382a', '#8e1f14', '#3f6b2e', '#ff3b1f', '#3a100c', '#1a0806', '#3b2a1c'),
    perks: [
      '+4 Elemental Damage, +8% Attack Speed.',
      '-40 Range. Burns things that get close.',
      'Starts with a wand.',
    ],
    special: 'lowRange',
    nightmare: {
      name: 'Chili Ash',
      flavor: 'Burned once already. Kept the heat.',
      stats: { elementalDamage: 5, attackSpeed: 10, maxHp: -3, lifeSteal: -3 },
      perks: [
        '+5 Elemental Damage, +10% Attack Speed.',
        '-3 Max HP, no Life Steal. The Mud notices you.',
        'Embers instead of seeds.',
      ],
    },
  },
  {
    id: 'glutton',
    name: 'Eggplant',
    species: 'eggplant',
    flavor: 'If it fits in the mouth, it counts as a plan.',
    stats: { maxHp: 5, pickupRange: 20, speed: -5 },
    startingWeapons: [{ id: 'stick', tier: 1 }],
    palette: veg('#5b3a7a', '#3a2352', '#4f8a3c', '#b56bff', '#1a1024', '#0c0814', '#2e2016'),
    perks: [
      'Materials heal: 1 HP per 10 picked up.',
      '+5 Max HP, +20 Pickup Range.',
      'Starts with a stick.',
    ],
    special: 'materialsHeal',
    nightmare: {
      name: 'Bloated Eggplant',
      flavor: 'Ate the mud. Regrets nothing it can remember.',
      stats: { maxHp: 6, pickupRange: 30, speed: -8, consumableHeal: 2 },
      perks: [
        '+6 Max HP, +30 Pickup Range, +2 Consumable Heal.',
        '-8% Speed. The Mud notices you.',
        'Swallows whole.',
      ],
    },
  },
  {
    id: 'loud',
    name: 'Onion',
    species: 'onion',
    flavor: 'Makes everything cry. Especially itself.',
    stats: { damage: 40, knockback: 15, luck: -10 },
    startingWeapons: [{ id: 'shotgun', tier: 2 }],
    palette: veg('#f1dfb8', '#c9a86d', '#7ba35b', '#e6ff5c', '#4a3a20', '#1c140c'),
    perks: [
      'One weapon slot. Starts with a T2 shotgun.',
      '+40% Damage. Starts with 40 materials.',
      'Layers. All of them angry.',
    ],
    special: 'startRich',
    weaponSlots: 1,
    nightmare: {
      name: 'Onion That Screams',
      flavor: 'There is no inside voice left.',
      stats: { damage: 40, maxHp: -5, luck: -10 },
      perks: ['+40% Damage.', '-5 Max HP, -10% Luck. The Mud notices you.', 'One weapon. One volume. Louder.'],
    },
  },
]

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]))

/** This slice: Spud and Carrot only. Everyone else stays in the pack, hidden. */
export const GATE_IDS: readonly string[] = ['well-rounded', 'ranger']

export const GATE_CHARACTERS: CharacterDef[] = CHARACTERS.filter((c) => GATE_IDS.includes(c.id))

export function characterById(id: string): CharacterDef {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown character: ${id}`)
  return found
}
