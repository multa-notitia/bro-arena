import { dist, uid } from '../core/math.ts'
import type { EnemyKind, SpawnMarker, Tree, World } from '../core/types.ts'
import { waveDef } from '../data/waves.ts'
import { ENEMIES } from '../data/enemies.ts'
import { beginDeath, MAX_ENEMIES, resetEnemyRuntime, spawnEnemy } from './enemies.ts'
import { magnetAll, payoutHarvest } from './pickups.ts'
import { resetWeaponRuntime } from './weapons.ts'
import { resetForWave } from './world.ts'
import type { SimCtx } from './world.ts'

const MARKER_LIFE = 1
const MIN_SPAWN_DIST = 260

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
  const hw = world.arenaHalfW - margin
  const hh = world.arenaHalfH - margin
  const px = world.player.x
  const py = world.player.y
  for (let i = 0; i < 28; i++) {
    const x = ctx.rng.range(-hw, hw)
    const y = ctx.rng.range(-hh, hh)
    if (dist(x, y, px, py) >= minDist) return { x, y }
  }
  const ang = Math.atan2(py, px) + Math.PI
  return {
    x: clampRange(Math.cos(ang) * minDist + px, -hw, hw),
    y: clampRange(Math.sin(ang) * minDist + py, -hh, hh),
  }
}

function clampRange(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

function placeMarker(world: World, kind: EnemyKind, ctx: SimCtx, elite = false, life = MARKER_LIFE): void {
  if (world.enemies.length + world.markers.length >= MAX_ENEMIES) return
  const pos = randomAway(world, ctx, MIN_SPAWN_DIST)
  const marker: SpawnMarker = { kind, x: pos.x, y: pos.y, t: 0, life }
  world.markers.push(marker)
  if (elite) eliteMarkers.add(marker)
}

function pickKind(world: World, ctx: SimCtx): EnemyKind {
  const pool = world.waveDef.pool
  if (pool.length === 0) return 'blob'
  return ctx.rng.weighted(pool).kind
}

function placeTrees(world: World, ctx: SimCtx): void {
  const n = world.waveDef.trees
  for (let i = 0; i < n; i++) {
    let pos = randomAway(world, ctx, 180, 80)
    let guard = 0
    while (guard < 10 && world.trees.some((t) => dist(t.x, t.y, pos.x, pos.y) < 90)) {
      pos = randomAway(world, ctx, 180, 80)
      guard += 1
    }
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
    }
    world.trees.push(tree)
  }
}

export function beginWave(world: World, ctx: SimCtx, index: number): void {
  const wdef = waveDef(index)
  resetForWave(world, wdef)
  resetWeaponRuntime()
  resetEnemyRuntime()
  director = makeDirector(world)
  placeTrees(world, ctx)
  for (const w of world.player.weapons) {
    w.burstLeft = 0
    w.burstTimer = 0
    w.auraAcc = 0
    if (w.cooldown > 10) w.cooldown = 0.15
  }
  ctx.audio.play('waveStart')
  ctx.audio.setMusic(world.player.form === 'nightmare' ? 'nightmare' : 'wave')
  ctx.ui.banner(`Wave ${index}`, wdef.boss ? 'The soil is moving.' : undefined, 2200)
}

export function updateDirector(world: World, dt: number, ctx: SimCtx): boolean {
  if (!director) director = makeDirector(world)
  const d = director
  const def = world.waveDef
  world.waveTime += dt
  const timeUp = world.waveTime >= def.duration
  world.waveLeft = Math.max(0, def.duration - world.waveTime)

  const markers: SpawnMarker[] = []
  for (const m of world.markers) {
    m.t += dt
    if (m.t >= m.life) {
      spawnEnemy(world, m.kind, m.x, m.y, ctx, eliteMarkers.has(m), undefined, true)
    } else {
      markers.push(m)
    }
  }
  world.markers = markers

  const bossAlive = !!(world.boss && world.boss.state !== 'dying' && world.boss.hp > 0)

  if (!timeUp) {
    d.spawnAcc += dt
    while (d.spawnAcc >= def.spawnInterval && world.enemies.length + world.markers.length < MAX_ENEMIES) {
      d.spawnAcc -= Math.max(0.08, def.spawnInterval)
      for (let i = 0; i < def.batch; i++) placeMarker(world, pickKind(world, ctx), ctx)
    }

    for (let i = 0; i < def.hordes.length; i++) {
      const t = def.hordes[i]
      if (t === undefined || d.hordeFired[i]) continue
      if (world.waveTime >= t) {
        d.hordeFired[i] = true
        const n = ctx.rng.int(10, 18)
        for (let k = 0; k < n; k++) placeMarker(world, pickKind(world, ctx), ctx, false, 0.7)
        ctx.ui.banner('Horde', 'The row emptied at once.', 1400)
      }
    }

    while (d.elitesSpawned < d.eliteTimes.length) {
      const t = d.eliteTimes[d.elitesSpawned]
      if (t === undefined || world.waveTime < t) break
      d.elitesSpawned += 1
      placeMarker(world, pickKind(world, ctx), ctx, true, 1.15)
      ctx.ui.banner('Elite', 'The row grew something bigger.', 1400)
    }

    if (def.boss && !d.bossSpawned && world.waveTime >= 3) {
      d.bossSpawned = true
      const pos = randomAway(world, ctx, 320, 70)
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
