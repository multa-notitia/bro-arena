import type { CharacterDef } from '../core/types.ts'

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'well-rounded',
    name: 'Well Rounded',
    flavor: 'A potato. Has two eyes. That is the autobiography.',
    stats: {},
    startingWeapons: [{ id: 'pistol', tier: 1 }],
    palette: {
      body: '#c4a35a',
      shade: '#8a6a32',
      ink: '#3a2a14',
      accent: '#6b8f71',
      eye: '#1a1208',
    },
    perks: ['Starts with a pistol.', 'No perk. That is the perk.', 'Average potato. Average chances. Fine.'],
  },
  {
    id: 'brawler',
    name: 'Brawler',
    flavor: 'Talked with fists. Fists won.',
    stats: { attackSpeed: 25, dodge: 12, meleeDamage: 1, speed: 5 },
    startingWeapons: [
      { id: 'fist', tier: 1 },
      { id: 'fist', tier: 1 },
    ],
    palette: {
      body: '#b56a3a',
      shade: '#7a3e22',
      ink: '#2c140c',
      accent: '#d4a574',
      eye: '#1c0e08',
    },
    perks: [
      'Melee weapons only.',
      '+25% Attack Speed, +12% Dodge.',
      'Two fists. No second opinion.',
    ],
    special: 'meleeOnly',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    flavor: 'Keeps the fight over there. Over there is better.',
    stats: { range: 45, rangedDamage: 3, armor: -2, speed: 8 },
    startingWeapons: [{ id: 'slingshot', tier: 1 }],
    palette: {
      body: '#e2d2b0',
      shade: '#b9a078',
      ink: '#4a3c28',
      accent: '#7a9bb0',
      eye: '#2a2418',
    },
    perks: [
      'Ranged weapons only.',
      '+45 Range, +3 Ranged Damage.',
      '-2 Armor. Stay back. Stay breathing.',
    ],
    special: 'rangedOnly',
  },
  {
    id: 'bull',
    name: 'Bull',
    flavor: 'Eats damage. Asks for seconds.',
    stats: { maxHp: 12, speed: -22, armor: 3 },
    startingWeapons: [{ id: 'hammer', tier: 1 }],
    palette: {
      body: '#8b4518',
      shade: '#5a2c0e',
      ink: '#1a0c04',
      accent: '#c45c26',
      eye: '#140804',
    },
    perks: [
      '+12 Max HP, +3 Armor, -22% Speed.',
      'Thorns deal half of contact damage back.',
      'The hammer is not a suggestion.',
    ],
    special: 'thornsHalf',
  },
  {
    id: 'lucky',
    name: 'Lucky',
    flavor: 'Found a four-leaf. Ate it. Still lucky.',
    stats: { luck: 40, harvesting: 10, maxHp: -3 },
    startingWeapons: [{ id: 'knife', tier: 1 }],
    palette: {
      body: '#d4b84a',
      shade: '#9a7a22',
      ink: '#3a2c0c',
      accent: '#f0e6a0',
      eye: '#2c2208',
    },
    perks: ['+40% Luck, +10 Harvesting.', '-3 Max HP. The shop likes you more than the doctor.', 'Starts with a knife.'],
  },
  {
    id: 'mage',
    name: 'Mage',
    flavor: 'Read a book once. It caught fire. Promoted himself.',
    stats: { elementalDamage: 4, range: -40, attackSpeed: 8, critChance: 5 },
    startingWeapons: [{ id: 'wand', tier: 1 }],
    palette: {
      body: '#8b6b9e',
      shade: '#5a4468',
      ink: '#2a1c32',
      accent: '#c4a0e0',
      eye: '#1a1020',
    },
    perks: [
      '+4 Elemental Damage, +8% Attack Speed.',
      'Short reach. The magic walks the rest.',
      'Starts with a wand.',
    ],
    special: 'lowRange',
  },
  {
    id: 'glutton',
    name: 'Glutton',
    flavor: 'If it fits in the mouth, it is a plan.',
    stats: { maxHp: 5, pickupRange: 20, speed: -5 },
    startingWeapons: [{ id: 'stick', tier: 1 }],
    palette: {
      body: '#9a8a5a',
      shade: '#5e6a3a',
      ink: '#2a2410',
      accent: '#6a8a4a',
      eye: '#1c1808',
    },
    perks: [
      'Materials heal: 1 HP per 10 picked up.',
      '+5 Max HP, +20 Pickup Range.',
      'Starts with a stick. Will chew it if bored.',
    ],
    special: 'materialsHeal',
  },
  {
    id: 'loud',
    name: 'Loud',
    flavor: 'One gun. One volume. No indoor voice.',
    stats: { damage: 40, knockback: 15, luck: -10 },
    startingWeapons: [{ id: 'shotgun', tier: 2 }],
    palette: {
      body: '#c45c48',
      shade: '#8a3028',
      ink: '#2a100c',
      accent: '#e8c070',
      eye: '#1a0808',
    },
    perks: [
      'One weapon slot. Starts with a T2 shotgun.',
      '+40% Damage. Starts rich (40 materials).',
      'The paddock has heard enough.',
    ],
    special: 'startRich',
    weaponSlots: 1,
  },
]

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]))

export function characterById(id: string): CharacterDef {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown character: ${id}`)
  return found
}
