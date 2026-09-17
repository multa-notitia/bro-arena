import { lerp } from '../core/math.ts'
import type { EnemyDef, EnemyKind, WaveDef } from '../core/types.ts'

type Pool = { kind: EnemyKind; weight: number }[]

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
  }
  if (extras.boss) wave.boss = extras.boss
  return wave
}

export const WAVES: WaveDef[] = [
  w(1, [
    { kind: 'blob', weight: 80 },
    { kind: 'sprout', weight: 20 },
  ]),
  w(2, [
    { kind: 'blob', weight: 55 },
    { kind: 'sprout', weight: 25 },
    { kind: 'runner', weight: 20 },
  ]),
  w(3, [
    { kind: 'blob', weight: 40 },
    { kind: 'sprout', weight: 20 },
    { kind: 'runner', weight: 25 },
    { kind: 'crab', weight: 15 },
  ]),
  w(4, [
    { kind: 'blob', weight: 30 },
    { kind: 'sprout', weight: 18 },
    { kind: 'runner', weight: 22 },
    { kind: 'crab', weight: 18 },
    { kind: 'wisp', weight: 12 },
  ]),
  w(5, [
    { kind: 'blob', weight: 24 },
    { kind: 'sprout', weight: 14 },
    { kind: 'runner', weight: 20 },
    { kind: 'crab', weight: 16 },
    { kind: 'wisp', weight: 14 },
    { kind: 'brute', weight: 12 },
  ]),
  w(6, [
    { kind: 'blob', weight: 18 },
    { kind: 'sprout', weight: 12 },
    { kind: 'runner', weight: 16 },
    { kind: 'crab', weight: 14 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 14 },
    { kind: 'spitter', weight: 14 },
  ]),
  w(7, [
    { kind: 'blob', weight: 14 },
    { kind: 'sprout', weight: 10 },
    { kind: 'runner', weight: 14 },
    { kind: 'crab', weight: 12 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 12 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 12 },
  ]),
  w(8, [
    { kind: 'blob', weight: 12 },
    { kind: 'sprout', weight: 8 },
    { kind: 'runner', weight: 14 },
    { kind: 'crab', weight: 10 },
    { kind: 'wisp', weight: 10 },
    { kind: 'brute', weight: 12 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 10 },
    { kind: 'charger', weight: 12 },
  ]),
  w(9, [
    { kind: 'blob', weight: 10 },
    { kind: 'sprout', weight: 8 },
    { kind: 'runner', weight: 12 },
    { kind: 'crab', weight: 10 },
    { kind: 'wisp', weight: 10 },
    { kind: 'brute', weight: 14 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 10 },
    { kind: 'charger', weight: 14 },
  ]),
  w(10, [
    { kind: 'blob', weight: 10 },
    { kind: 'sprout', weight: 14 },
    { kind: 'runner', weight: 10 },
    { kind: 'crab', weight: 8 },
    { kind: 'wisp', weight: 10 },
    { kind: 'brute', weight: 12 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 12 },
    { kind: 'charger', weight: 12 },
  ], { boss: 'mother' }),
  w(11, [
    { kind: 'blob', weight: 8 },
    { kind: 'runner', weight: 14 },
    { kind: 'crab', weight: 10 },
    { kind: 'wisp', weight: 10 },
    { kind: 'brute', weight: 14 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 12 },
    { kind: 'charger', weight: 14 },
    { kind: 'sprout', weight: 6 },
  ]),
  w(12, [
    { kind: 'runner', weight: 14 },
    { kind: 'crab', weight: 10 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 14 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 12 },
    { kind: 'charger', weight: 16 },
    { kind: 'sprout', weight: 6 },
    { kind: 'blob', weight: 4 },
  ]),
  w(13, [
    { kind: 'runner', weight: 12 },
    { kind: 'crab', weight: 10 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 16 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 12 },
    { kind: 'charger', weight: 16 },
    { kind: 'sprout', weight: 6 },
    { kind: 'blob', weight: 4 },
  ]),
  w(14, [
    { kind: 'runner', weight: 12 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 16 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 14 },
    { kind: 'charger', weight: 16 },
    { kind: 'crab', weight: 8 },
    { kind: 'sprout', weight: 4 },
    { kind: 'blob', weight: 4 },
  ]),
  w(15, [
    { kind: 'runner', weight: 12 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 16 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 14 },
    { kind: 'charger', weight: 18 },
    { kind: 'crab', weight: 8 },
    { kind: 'sprout', weight: 6 },
  ]),
  w(16, [
    { kind: 'runner', weight: 10 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 18 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 14 },
    { kind: 'charger', weight: 18 },
    { kind: 'crab', weight: 8 },
    { kind: 'sprout', weight: 6 },
  ]),
  w(17, [
    { kind: 'runner', weight: 10 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 18 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 16 },
    { kind: 'charger', weight: 18 },
    { kind: 'crab', weight: 6 },
    { kind: 'sprout', weight: 6 },
  ]),
  w(18, [
    { kind: 'runner', weight: 12 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 18 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 16 },
    { kind: 'charger', weight: 18 },
    { kind: 'sprout', weight: 6 },
    { kind: 'crab', weight: 4 },
  ]),
  w(19, [
    { kind: 'runner', weight: 12 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 18 },
    { kind: 'spitter', weight: 14 },
    { kind: 'hive', weight: 16 },
    { kind: 'charger', weight: 20 },
    { kind: 'sprout', weight: 8 },
  ]),
  w(20, [
    { kind: 'runner', weight: 16 },
    { kind: 'wisp', weight: 12 },
    { kind: 'brute', weight: 16 },
    { kind: 'spitter', weight: 12 },
    { kind: 'hive', weight: 14 },
    { kind: 'charger', weight: 18 },
    { kind: 'sprout', weight: 8 },
    { kind: 'crab', weight: 4 },
  ], { boss: 'lord' }),
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
