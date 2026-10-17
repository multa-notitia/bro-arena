import { clamp, dist, lerp } from '../core/math.ts'
import type { EnemyKind, SpawnMarker, World } from '../core/types.ts'
import { CHAOS, chaosDirectorOn, maxEnemies, telegraphLife } from '../data/chaos.ts'
import { plantedPlots } from './farm.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import type { SimCtx } from './world.ts'

export type TelegraphStyle = 'crack' | 'ring' | 'patch'

let patchAcc = 0
let ambushAcc = 0
let hopAcc = 0
let nextAmbush = 8
let nextPatch = 11
let nextHop = 6
let mixedAcc = 0

export function resetChaosDirector(): void {
  patchAcc = 0
  ambushAcc = 0
  hopAcc = 0
  mixedAcc = 0
  nextAmbush = CHAOS.director.ambushEvery[0]
  nextPatch = CHAOS.director.patchEvery[0]
  nextHop = CHAOS.director.hopPackEvery[0]
}

function pressure(world: World): number {
  const dur = Math.max(1, world.waveDef.duration)
  return clamp(world.waveTime / dur, 0, 1)
}

export function chaosInterval(base: number, world: World): number {
  if (!chaosDirectorOn()) return base
  const p = pressure(world)
  const speed = lerp(1, 1 - CHAOS.director.ramp * 0.7, p)
  return Math.max(0.07, base * CHAOS.director.intervalScale * speed)
}

export function chaosBatch(base: number, world: World): number {
  if (!chaosDirectorOn()) return base
  const p = pressure(world)
  return base + CHAOS.director.extraBatch + Math.floor(p * 3)
}

function room(world: World): boolean {
  return world.enemies.length + world.markers.length < maxEnemies()
}

function randomAway(world: World, ctx: SimCtx, minDist: number, margin = 48): { x: number; y: number } {
  const hw = world.arenaHalfW - margin
  const hh = world.arenaHalfH - margin
  const px = world.player.x
  const py = world.player.y
  for (let i = 0; i < 20; i++) {
    const x = ctx.rng.range(-hw, hw)
    const y = ctx.rng.range(-hh, hh)
    if (dist(x, y, px, py) >= minDist) return { x, y }
  }
  const ang = Math.atan2(py, px) + Math.PI
  return {
    x: clamp(Math.cos(ang) * minDist + px, -hw, hw),
    y: clamp(Math.sin(ang) * minDist + py, -hh, hh),
  }
}

function pickKind(world: World, ctx: SimCtx, fallback: EnemyKind): EnemyKind {
  const rows = world.waveDef.pool
  if (!rows.length) return fallback
  let total = 0
  for (const row of rows) total += row.weight
  let roll = ctx.rng.range(0, total)
  for (const row of rows) {
    roll -= row.weight
    if (roll <= 0) return row.kind
  }
  return rows[0]?.kind ?? fallback
}

export function queueCrack(
  world: World,
  kind: EnemyKind,
  x: number,
  y: number,
  opts?: { elite?: boolean; style?: TelegraphStyle; life?: number },
): void {
  if (!room(world)) return
  const marker: SpawnMarker = {
    kind,
    x,
    y,
    t: 0,
    life: opts?.life ?? telegraphLife(),
    style: opts?.style ?? 'crack',
    elite: !!opts?.elite,
  }
  world.markers.push(marker)
}

function mixedPack(world: World, ctx: SimCtx): void {
  const n = ctx.rng.int(CHAOS.director.mixedPackSize[0], CHAOS.director.mixedPackSize[1])
  const sown = plantedPlots(world.farm)
  for (let i = 0; i < n; i++) {
    const plot = sown.length ? ctx.rng.pick(sown) : ctx.rng.pick(world.farm.plots)
    const kind = pickKind(world, ctx, 'blob')
    const jx = ctx.rng.range(-36, 36)
    const jy = ctx.rng.range(-20, 22)
    queueCrack(world, kind, plot.x + jx, plot.y + jy, { style: 'crack' })
  }
}

function ambushRing(world: World, ctx: SimCtx): void {
  const n = ctx.rng.int(CHAOS.director.ringCount[0], CHAOS.director.ringCount[1])
  const r = CHAOS.director.ringRadius
  const kindA = pickKind(world, ctx, 'blob')
  const kindB = pickKind(world, ctx, 'runner')
  ctx.ui.banner('Ambush', 'They came up in a ring.', 1400)
  ctx.audio.play('mudRise')
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ctx.rng.range(-0.08, 0.08)
    const x = world.player.x + Math.cos(a) * r
    const y = world.player.y + Math.sin(a) * r * 0.78
    queueCrack(world, i % 2 === 0 ? kindA : kindB, x, y, { style: 'ring', life: 0.55 })
  }
}

function plantPatch(world: World, ctx: SimCtx): void {
  const sown = plantedPlots(world.farm)
  const plot = sown.length ? ctx.rng.pick(sown) : ctx.rng.pick(world.farm.plots)
  tomatoSwarm(world, ctx, plot.x, plot.y)
}

function tomatoSwarm(world: World, ctx: SimCtx, x: number, y: number): void {
  const n = ctx.rng.int(CHAOS.director.tomatoSwarmSize[0], CHAOS.director.tomatoSwarmSize[1])
  ctx.ui.banner('The vine dropped', `${n} tomatoes`, 1200)
  ctx.audio.play('spawn', { pitch: 0.78, gain: 0.85 })
  spawnFunnyClip('rustle_a', x, y, { scale: CHAOS.sheets.drawScale })
  spawnFunnyClip('rustle_b', x + 8, y + 4, { scale: CHAOS.sheets.drawScale })
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.range(0, Math.PI * 2)
    const d = ctx.rng.range(10, 40)
    queueCrack(world, 'tomato', x + Math.cos(a) * d, y + Math.sin(a) * d, {
      style: 'patch',
      life: 0.55 + i * 0.08,
    })
  }
}

function hopPack(world: World, ctx: SimCtx): void {
  const n = ctx.rng.int(CHAOS.director.hopPackSize[0], CHAOS.director.hopPackSize[1])
  ctx.ui.banner('Hop pack', 'Beans in the row.', 1200)
  ctx.audio.play('mudRise', { pitch: 1.3, gain: 0.7 })
  const sown = plantedPlots(world.farm)
  for (let i = 0; i < n; i++) {
    const plot = sown.length ? ctx.rng.pick(sown) : ctx.rng.pick(world.farm.plots)
    queueCrack(world, 'bean', plot.x + ctx.rng.range(-28, 28), plot.y + ctx.rng.range(-16, 18), {
      style: 'crack',
      life: 0.55,
    })
  }
}

export function onHorde(world: World, ctx: SimCtx): void {
  if (!chaosDirectorOn()) return
  for (let i = 0; i < CHAOS.director.hordeBonus; i++) {
    const pos = randomAway(world, ctx, 70, 40)
    queueCrack(world, pickKind(world, ctx, 'blob'), pos.x, pos.y)
  }
  mixedPack(world, ctx)
  hopPack(world, ctx)
}

export function tickChaosDirector(world: World, dt: number, ctx: SimCtx): void {
  if (!chaosDirectorOn()) return
  const p = pressure(world)
  ambushAcc += dt
  patchAcc += dt
  hopAcc += dt
  mixedAcc += dt
  if (ambushAcc >= nextAmbush) {
    ambushAcc = 0
    nextAmbush = ctx.rng.range(CHAOS.director.ambushEvery[0], lerp(CHAOS.director.ambushEvery[1], 6, p))
    ambushRing(world, ctx)
  }
  if (patchAcc >= nextPatch) {
    patchAcc = 0
    nextPatch = ctx.rng.range(CHAOS.director.patchEvery[0], lerp(CHAOS.director.patchEvery[1], 7, p))
    plantPatch(world, ctx)
  }
  if (hopAcc >= nextHop) {
    hopAcc = 0
    nextHop = ctx.rng.range(CHAOS.director.hopPackEvery[0], lerp(CHAOS.director.hopPackEvery[1], 5, p))
    hopPack(world, ctx)
  }
  if (mixedAcc >= lerp(3.2, 1.1, p) && ctx.rng.chance(CHAOS.director.mixedPackChance)) {
    mixedAcc = 0
    mixedPack(world, ctx)
  }
}

export function chaosDemoRequested(): boolean {
  if (typeof location === 'undefined') return false
  const q = new URLSearchParams(location.search)
  return q.get('chaos') === '1' || q.get('chaosDemo') === '1'
}

export function chaosDemoWave(): number {
  if (typeof location === 'undefined') return 4
  const n = Number(new URLSearchParams(location.search).get('wave'))
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 4
}
