import { CHAOS } from './chaos.ts'
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
  const slot = Math.max(0, Math.min(19, index - 1))
  const duration = CHAOS.pace.waveSeconds[slot] ?? 20
  const spawnInterval = CHAOS.pace.spawnInterval[slot] ?? 1.4
  const batch = CHAOS.pace.batch[slot] ?? 1
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

/** Light is the common garden twin. Mud is rarer inside each family. */
function mix(light: EnemyKind, mud: EnemyKind, lightW: number): Pool {
  return [
    { kind: light, weight: lightW },
    { kind: mud, weight: Math.max(1, Math.round(lightW * 0.28)) },
  ]
}

/** Farm loop still follows the beds. This pool is the mix when a spawn is not tied to a crop. */
const EARLY: Pool = [
  ...mix('blob-light', 'blob-mud', 40),
  ...mix('beetle-light', 'beetle-mud', 12),
  ...mix('shroom-light', 'shroom-mud', 10),
  ...mix('bean-light', 'bean-mud', 18),
  ...mix('tomato-light', 'tomato-mud', 10),
  { kind: 'sprout', weight: 10 },
]
const MID: Pool = [
  ...mix('blob-light', 'blob-mud', 22),
  ...mix('charger-light', 'charger-mud', 20),
  ...mix('beetle-light', 'beetle-mud', 12),
  ...mix('shroom-light', 'shroom-mud', 10),
  ...mix('bean-light', 'bean-mud', 16),
  ...mix('tomato-light', 'tomato-mud', 14),
  { kind: 'sprout', weight: 8 },
]
const LATE: Pool = [
  ...mix('blob-light', 'blob-mud', 14),
  ...mix('charger-light', 'charger-mud', 18),
  ...mix('spitter-light', 'spitter-mud', 14),
  ...mix('beetle-light', 'beetle-mud', 10),
  ...mix('shroom-light', 'shroom-mud', 10),
  ...mix('bean-light', 'bean-mud', 18),
  ...mix('tomato-light', 'tomato-mud', 16),
]

const BEETROOTS = mix('beetroot-light', 'beetroot-mud', 16)
const ONIONS = mix('onion-light', 'onion-mud', 16)
const PEAS = mix('pea-light', 'pea-mud', 16)

function withPack(base: Pool, extra: Pool): Pool {
  return [...base, ...extra]
}

export const WAVES: WaveDef[] = [
  w(1, EARLY),
  w(2, EARLY),
  w(3, withPack(MID, [...BEETROOTS, ...PEAS])),
  w(4, withPack(MID, [...ONIONS, ...PEAS])),
  w(5, withPack(MID, [...BEETROOTS, ...ONIONS])),
  w(6, withPack(MID, [...BEETROOTS, ...ONIONS, ...PEAS])),
  w(7, withPack(MID, [...ONIONS, ...PEAS])),
  w(8, withPack(LATE, [...BEETROOTS, ...PEAS])),
  w(9, withPack(LATE, [...ONIONS, ...BEETROOTS])),
  w(10, withPack(LATE, [...PEAS, ...ONIONS]), { boss: 'eliteBlob' }),
  w(11, withPack(LATE, [...BEETROOTS, ...ONIONS, ...PEAS])),
  w(12, withPack(LATE, [...BEETROOTS, ...PEAS])),
  w(13, withPack(LATE, [...ONIONS, ...PEAS])),
  w(14, withPack(LATE, [...BEETROOTS, ...ONIONS])),
  w(15, withPack(LATE, [...BEETROOTS, ...ONIONS, ...PEAS])),
  w(16, withPack(LATE, [...PEAS, ...ONIONS])),
  w(17, withPack(LATE, [...BEETROOTS, ...PEAS])),
  w(18, withPack(LATE, [...ONIONS, ...BEETROOTS])),
  w(19, withPack(LATE, [...PEAS, ...BEETROOTS])),
  w(20, withPack(LATE, [...BEETROOTS, ...ONIONS, ...PEAS]), { boss: 'eliteBlob' }),
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
