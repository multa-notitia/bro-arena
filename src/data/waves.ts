import { lerp } from '../core/math.ts'
import type { EnemyDef, EnemyKind, WaveDef } from '../core/types.ts'

type Pool = { kind: EnemyKind; weight: number }[]

const NIGHTMARE_CHANCE = [
  0.55, 0.5, 0.52, 0.55, 0.55, 0.58, 0.6, 0.6, 0.62, 0.55, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.72,
] as const

function w(
  index: number,
  pool: Pool,
  extras: { boss?: EnemyKind } = {},
): WaveDef {
  const t = (index - 1) / 19
  const duration = Math.round(lerp(20, 60, t))
  const spawnInterval = Math.round(lerp(1.4, 0.32, t) * 100) / 100
  const batch = Math.max(1, Math.round(lerp(1, 4, t)))
  const elites = index < 6 ? 0 : index < 10 ? 1 : index < 16 ? 2 : 3
  const trees = index <= 5 ? 2 : index <= 12 ? 3 : 4
  const hordeCount = index < 3 ? 0 : index < 8 ? 1 : index < 14 ? 2 : 3
  const hordes: number[] = []
  for (let k = 1; k <= hordeCount; k++) {
    hordes.push(Math.round((duration * k) / (hordeCount + 1)))
  }
  const wave: WaveDef = {
    index,
    duration,
    spawnInterval,
    batch,
    pool,
    elites,
    hordes,
    trees,
    nightmareChance: NIGHTMARE_CHANCE[index - 1] ?? 0,
  }
  if (extras.boss) wave.boss = extras.boss
  return wave
}

/** Farm loop: pea / sprout / charger early; garlic / pumpkin / chili unlock later. Pool is leftover — live spawns come from planted beds. */
const EARLY: Pool = [
  { kind: 'blob', weight: 70 },
  { kind: 'sprout', weight: 30 },
]
const MID: Pool = [
  { kind: 'blob', weight: 45 },
  { kind: 'sprout', weight: 25 },
  { kind: 'charger', weight: 30 },
]
const LATE: Pool = [
  { kind: 'blob', weight: 32 },
  { kind: 'sprout', weight: 28 },
  { kind: 'charger', weight: 40 },
]

export const WAVES: WaveDef[] = [
  w(1, EARLY),
  w(2, EARLY),
  w(3, MID),
  w(4, MID),
  w(5, MID),
  w(6, MID),
  w(7, MID),
  w(8, LATE),
  w(9, LATE),
  w(10, LATE, { boss: 'eliteBlob' }),
  w(11, LATE),
  w(12, LATE),
  w(13, LATE),
  w(14, LATE),
  w(15, LATE),
  w(16, LATE),
  w(17, LATE),
  w(18, LATE),
  w(19, LATE),
  w(20, LATE, { boss: 'eliteBlob' }),
]

export const WAVE_COUNT = WAVES.length

export function waveDef(index: number): WaveDef {
  const def = WAVES[index - 1]
  if (!def) throw new Error(`No wave ${index}`)
  return def
}

export function enemyHpAtWave(def: EnemyDef, wave: number): number {
  return Math.max(1, Math.round(def.hp * (1 + Math.max(0, wave - 1) * def.hpScale)))
}

export function enemyDamageAtWave(def: EnemyDef, wave: number): number {
  return Math.max(1, Math.round(def.damage * (1 + Math.max(0, wave - 1) * def.damageScale)))
}
