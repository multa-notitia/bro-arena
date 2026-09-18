import type { CropId, EnemyKind } from '../core/types.ts'

export interface CropDef {
  id: CropId
  name: string
  seedName: string
  flavor: string
  enemy: EnemyKind
  enemyName: string
  /** Materials paid at harvest per bed. */
  materials: number
  /** XP paid at harvest per bed. */
  xp: number
  /** Relative spawn weight per planted bed. */
  weight: number
  /** Extra monster toughness this crop invites. */
  threat: number
  seedChance: number
  /** Wave at which the shed may stock this seed. */
  unlockWave: number
  /** Extra luck that can pull the seed one wave early. */
  luckUnlock: number
  body: string
  shade: string
  leaf: string
  hud: string
}

export const CROPS: Record<CropId, CropDef> = {
  pea: {
    id: 'pea',
    name: 'Peas',
    seedName: 'Pea seed',
    flavor: 'Easy. They come up as Peas from that bed.',
    enemy: 'blob',
    enemyName: 'Pea',
    materials: 2,
    xp: 3,
    weight: 70,
    threat: 1,
    seedChance: 0.28,
    unlockWave: 1,
    luckUnlock: 0,
    body: '#7fae4a',
    shade: '#4f7a2a',
    leaf: '#c4d48a',
    hud: 'P',
  },
  sprout: {
    id: 'sprout',
    name: 'Sprouts',
    seedName: 'Sprout seed',
    flavor: 'Leafy. They come up as Sprouts.',
    enemy: 'sprout',
    enemyName: 'Sprout',
    materials: 3,
    xp: 5,
    weight: 55,
    threat: 2,
    seedChance: 0.22,
    unlockWave: 1,
    luckUnlock: 0,
    body: '#9ccd6a',
    shade: '#6a9a3e',
    leaf: '#d4e8b0',
    hud: 'S',
  },
  carrot: {
    id: 'carrot',
    name: 'Carrots',
    seedName: 'Carrot seed',
    flavor: 'Rich. They come up as Chargers.',
    enemy: 'charger',
    enemyName: 'Carrot',
    materials: 5,
    xp: 8,
    weight: 48,
    threat: 3,
    seedChance: 0.16,
    unlockWave: 1,
    luckUnlock: 0,
    body: '#e57a2c',
    shade: '#b3541c',
    leaf: '#4f8a3c',
    hud: 'C',
  },
  garlic: {
    id: 'garlic',
    name: 'Garlic',
    seedName: 'Garlic seed',
    flavor: 'Pungent. They keep their distance and spit.',
    enemy: 'wisp',
    enemyName: 'Garlic',
    materials: 4,
    xp: 6,
    weight: 42,
    threat: 3,
    seedChance: 0.2,
    unlockWave: 3,
    luckUnlock: 22,
    body: '#efe8dc',
    shade: '#c4b8a4',
    leaf: '#5f8a4e',
    hud: 'G',
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkins',
    seedName: 'Pumpkin seed',
    flavor: 'Heavy. They come up as Gourds.',
    enemy: 'brute',
    enemyName: 'Pumpkin',
    materials: 7,
    xp: 10,
    weight: 36,
    threat: 4,
    seedChance: 0.14,
    unlockWave: 6,
    luckUnlock: 40,
    body: '#d7862c',
    shade: '#a35a16',
    leaf: '#5a6e3a',
    hud: 'K',
  },
  chili: {
    id: 'chili',
    name: 'Chilies',
    seedName: 'Chili seed',
    flavor: 'Hot. They spit from the bed.',
    enemy: 'spitter',
    enemyName: 'Chili',
    materials: 6,
    xp: 9,
    weight: 40,
    threat: 4,
    seedChance: 0.15,
    unlockWave: 10,
    luckUnlock: 55,
    body: '#c9382b',
    shade: '#8e1f14',
    leaf: '#3f6b2e',
    hud: 'H',
  },
}

export const GARDEN_ROWS = ['North row', 'Middle row', 'South row'] as const
export const GARDEN_ROW_COUNT = 3
export const GARDEN_COL_COUNT = 4

export const CROP_LIST: readonly CropDef[] = [
  CROPS.pea,
  CROPS.sprout,
  CROPS.carrot,
  CROPS.garlic,
  CROPS.pumpkin,
  CROPS.chili,
]

export function cropByEnemy(kind: EnemyKind): CropId | null {
  if (kind === 'blob' || kind === 'eliteBlob') return 'pea'
  if (kind === 'sprout') return 'sprout'
  if (kind === 'charger') return 'carrot'
  if (kind === 'wisp') return 'garlic'
  if (kind === 'brute' || kind === 'eliteBrute') return 'pumpkin'
  if (kind === 'spitter') return 'chili'
  return null
}

export function cropUnlockedAt(id: CropId, nextWave: number, luck: number): boolean {
  const c = CROPS[id]
  if (nextWave >= c.unlockWave) return true
  if (c.luckUnlock <= 0) return false
  return nextWave >= c.unlockWave - 1 && luck >= c.luckUnlock
}
