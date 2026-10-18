import { dist, uid } from '../core/math.ts'
import type { EnemyKind, SpawnMarker, Tree, World } from '../core/types.ts'
import { CROPS } from '../data/crops.ts'
import { waveDef } from '../data/waves.ts'
import { ENEMIES } from '../data/enemies.ts'
import { beginDeath, maxEnemies, resetEnemyRuntime, spawnEnemy } from './enemies.ts'
import { farmSpawnBatch, farmSpawnInterval, plantedPlots, tickFarm } from './farm.ts'
import { magnetAll, payoutHarvest } from './pickups.ts'
import { resetWeaponRuntime } from './weapons.ts'
import { resetForWave, spawnOutsideView } from './world.ts'
import type { SimCtx } from './world.ts'
import { hasOpenWing } from './beds.ts'
import { chaosBatch, chaosInterval, onHorde, resetChaosDirector, tickChaosDirector } from './chaosDirector.ts'
import { resetEmerge } from './emerge.ts'
import { resetFamilies } from './families.ts'
import {
  beginPlantBurst,
  cropToPlant,
  gardenPending,
  gardenSheet,
  resetGardenPlants,
  tickGardenPlants,
} from './garden.ts'
import { pickTreeKind, placeArenaDecor, resetArenaProps } from './arenaProps.ts'
import { telegraphLife } from '../data/chaos.ts'

const MARKER_LIFE = 1

interface Director {
  spawnAcc: number
  hordeFired: boolean[]
  eliteTimes: number[]
  elitesSpawned: number
  bossSpawned: boolean
}

let director: Director | null = null
const eliteMarkers = new WeakSet<SpawnMarker>()

function makeDirector(world: World): Director {
  const def = world.waveDef
  const eliteTimes: number[] = []
  for (let i = 0; i < def.elites; i++) {
    eliteTimes.push(def.duration * ((i + 1) / (def.elites + 1)))
  }
  return {
    spawnAcc: def.spawnInterval * 0.45,
    hordeFired: def.hordes.map(() => false),
    eliteTimes,
    elitesSpawned: 0,
    bossSpawned: false,
  }
}

export function randomAway(world: World, ctx: SimCtx, minDist: number, margin = 48): { x: number; y: number } {
  return spawnOutsideView(world, ctx.rng, minDist, margin)
}

const MUD_CHANCE = 0.28

function rollMud(kind: EnemyKind, ctx: SimCtx): EnemyKind {
  if (!kind.endsWith('-light')) return kind
  if (!ctx.rng.chance(MUD_CHANCE)) return kind
  const mud = kind.replace(/-light$/, '-mud') as EnemyKind
  return ENEMIES[mud] ? mud : kind
}

function pickPool(world: World, ctx: SimCtx): EnemyKind {
  const pool = world.waveDef.pool
  let total = 0
  for (const row of pool) total += row.weight
  if (total <= 0 || pool.length === 0) return 'blob-light'
  let r = ctx.rng.range(0, total)
  for (const row of pool) {
    r -= row.weight
    if (r <= 0) return row.kind
  }
  return pool[0]!.kind
}

function spawnFromBed(world: World, ctx: SimCtx, elite = false, life = MARKER_LIFE): void {
  if (world.enemies.length + world.markers.length + gardenPending() >= maxEnemies(world.wave)) return
  if (hasOpenWing() && ctx.rng.chance(0.42)) {
    const pos = spawnOutsideView(world, ctx.rng, 90, 36)
    const kind = rollMud(pickPool(world, ctx), ctx)
    const marker: SpawnMarker = {
      kind,
      x: pos.x,
      y: pos.y,
      t: 0,
      life: life === MARKER_LIFE ? telegraphLife() : life,
      style: 'crack',
    }
    world.markers.push(marker)
    if (elite) eliteMarkers.add(marker)
    return
  }
  const sown = plantedPlots(world.farm)
  const plot = sown.length > 0 ? ctx.rng.pick(sown) : ctx.rng.pick(world.farm.plots)
  const crop = plot.crop
  let kind: EnemyKind = crop ? CROPS[crop].enemy : pickPool(world, ctx)
  // Most spawns follow the bed. A smaller share comes from the wave mix (beetle, shroom, mud).
  if (crop && ctx.rng.chance(0.25)) kind = pickPool(world, ctx)
  kind = rollMud(kind, ctx)
  const jitter = 22
  const x = plot.x + ctx.rng.range(-jitter, jitter)
  const y = plot.y + ctx.rng.range(-10, 16)
  const fam = kind.replace(/-(light|mud)$/, '')
  const plant =
    fam === 'beetroot' || fam === 'tomato' || fam === 'bean' || fam === 'pea'
      ? fam
      : crop
        ? cropToPlant(crop)
        : null
  if (plant && gardenSheet() && beginPlantBurst({
    plant,
    x: plot.x,
    y: plot.y,
    plotUid: plot.uid,
    spawns: [{ kind, elite, x, y }],
  })) {
    return
  }
  const marker: SpawnMarker = {
    kind,
    x,
    y,
    t: 0,
    life: life === MARKER_LIFE ? telegraphLife() : life,
    style: 'crack',
  }
  world.markers.push(marker)
  if (elite) eliteMarkers.add(marker)
}

function placeTrees(world: World, ctx: SimCtx): void {
  const n = world.waveDef.trees
  for (let i = 0; i < n; i++) {
    const inset = 72
    const spanX = Math.max(40, world.arenaMaxX - world.arenaMinX - inset * 2)
    const spanY = Math.max(40, world.arenaMaxY - world.arenaMinY - inset * 2)
    const sample = (): { x: number; y: number } => ({
      x: ctx.rng.range(world.arenaMinX + inset, world.arenaMinX + inset + spanX),
      y: ctx.rng.range(world.arenaMinY + inset, world.arenaMinY + inset + spanY),
    })
    let pos = sample()
    let guard = 0
    const blocked = (): boolean =>
      world.trees.some((t) => dist(t.x, t.y, pos.x, pos.y) < 90) ||
      world.farm.plots.some((p) => dist(p.x, p.y, pos.x, pos.y) < 78) ||
      dist(pos.x, pos.y, world.player.x, world.player.y) < 110
    while (guard < 12 && blocked()) {
      pos = sample()
      guard += 1
    }
    if (world.farm.plots.some((p) => dist(p.x, p.y, pos.x, pos.y) < 70)) continue
    const hp = 16 + world.wave * 4
    const tree: Tree = {
      uid: uid(),
      x: pos.x,
      y: pos.y,
      hp,
      maxHp: hp,
      r: 26,
      sway: ctx.rng.range(0, 8),
      hitFlash: 0,
      kind: pickTreeKind(ctx.rng),
      hitAnim: false,
    }
    world.trees.push(tree)
  }
}

export function beginWave(world: World, ctx: SimCtx, index: number): void {
  const wdef = waveDef(index)
  resetForWave(world, wdef)
  resetWeaponRuntime()
  resetEnemyRuntime()
  resetChaosDirector()
  resetEmerge()
  resetFamilies()
  resetGardenPlants()
  resetArenaProps()
  director = makeDirector(world)
  placeTrees(world, ctx)
  placeArenaDecor(world, ctx)
  for (const w of world.player.weapons) {
    w.burstLeft = 0
    w.burstTimer = 0
    w.auraAcc = 0
    if (w.cooldown > 10) w.cooldown = 0.15
  }
  ctx.audio.play('waveStart')
  ctx.audio.setMusic('wave')
  ctx.ui.banner(`Wave ${index}`, wdef.boss ? 'The soil is moving.' : undefined, 2200)
}

export function updateDirector(world: World, dt: number, ctx: SimCtx): boolean {
  if (!director) director = makeDirector(world)
  const d = director
  const def = world.waveDef
  world.waveTime += dt
  tickFarm(world, dt)
  const timeUp = world.waveTime >= def.duration
  world.waveLeft = Math.max(0, def.duration - world.waveTime)
  const interval = chaosInterval(farmSpawnInterval(def.spawnInterval, world.farm), world)
  const batch = chaosBatch(farmSpawnBatch(def.batch, world.farm), world)

  const markers: SpawnMarker[] = []
  for (const m of world.markers) {
    m.t += dt
    if (m.t >= m.life) {
      spawnEnemy(world, m.kind, m.x, m.y, ctx, eliteMarkers.has(m) || !!m.elite, undefined, true)
    } else {
      markers.push(m)
    }
  }
  world.markers = markers
  tickChaosDirector(world, dt, ctx)
  tickGardenPlants(world, dt, (kind, x, y, elite) => {
    spawnEnemy(world, kind, x, y, ctx, elite, undefined, true)
  })

  const bossAlive = !!(world.boss && world.boss.state !== 'dying' && world.boss.hp > 0)

  if (!timeUp) {
    d.spawnAcc += dt
    while (d.spawnAcc >= interval && world.enemies.length + world.markers.length + gardenPending() < maxEnemies(world.wave)) {
      d.spawnAcc -= Math.max(0.08, interval)
      for (let i = 0; i < batch; i++) spawnFromBed(world, ctx)
    }

    for (let i = 0; i < def.hordes.length; i++) {
      const t = def.hordes[i]
      if (t === undefined || d.hordeFired[i]) continue
      if (world.waveTime >= t) {
        d.hordeFired[i] = true
        const n = ctx.rng.int(10, 18)
        for (let k = 0; k < n; k++) spawnFromBed(world, ctx, false, telegraphLife())
        onHorde(world, ctx)
        ctx.ui.banner('Horde', 'The row emptied at once.', 1400)
      }
    }

    while (d.elitesSpawned < d.eliteTimes.length) {
      const t = d.eliteTimes[d.elitesSpawned]
      if (t === undefined || world.waveTime < t) break
      d.elitesSpawned += 1
      spawnFromBed(world, ctx, true, 1.15)
      ctx.ui.banner('Elite', 'The row grew something bigger.', 1500)
    }

    if (def.boss && !d.bossSpawned && world.waveTime >= 3) {
      d.bossSpawned = true
      const sown = plantedPlots(world.farm)
      let pos = randomAway(world, ctx, 320, 70)
      if (sown.length > 0) {
        let best = sown[0]
        let bestD = -1
        for (const p of sown) {
          const d2 = dist(p.x, p.y, world.player.x, world.player.y)
          if (d2 > bestD) {
            bestD = d2
            best = p
          }
        }
        if (best) pos = { x: best.x, y: best.y - 28 }
      }
      const boss = spawnEnemy(world, def.boss, pos.x, pos.y, ctx)
      if (boss) {
        world.boss = boss
        ctx.audio.play('bossRoar')
        ctx.audio.setMusic('boss')
        const name = ENEMIES[def.boss]?.nightmareName ?? ENEMIES[def.boss]?.name ?? 'The soil'
        ctx.ui.banner(name, 'The soil is moving.', 2600)
      }
    }
  }

  if (timeUp && bossAlive) return false
  if (timeUp) return true
  return false
}

export function settleWave(world: World, ctx: SimCtx): void {
  world.markers = []
  for (const e of world.enemies) {
    if (e.state !== 'dying') beginDeath(world, e, ctx, true)
  }
  world.projectiles = world.projectiles.filter((p) => p.owner === 'player')
  magnetAll(world)
  payoutHarvest(world, ctx)
  ctx.audio.play('waveEnd')
}
