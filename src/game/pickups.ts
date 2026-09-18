import { clamp, dist2, uid } from '../core/math.ts'
import type { CropId, Enemy, EnemyDef, Pickup, PickupType, Tree, World } from '../core/types.ts'
import { CROPS, cropByEnemy } from '../data/crops.ts'
import { ITEM_LIST } from '../data/items.ts'
import { harvestPayout, materialDropValue, tierOdds } from '../data/economy.ts'
import { addSeed, harvestFarm, seedDropChance } from './farm.ts'
import { addXp, countSpecial, extraState, healPlayer, recomputeStats } from './player.ts'
import type { SimCtx } from './world.ts'

const BASE_PICKUP_RANGE = 90

export function spawnPickup(
  world: World,
  type: PickupType,
  x: number,
  y: number,
  value: number,
  ctx: SimCtx,
  magnet = false,
): Pickup {
  const pop = magnet ? 0 : ctx.rng.range(40, 110)
  const ang = ctx.rng.range(0, Math.PI * 2)
  const pickup: Pickup = {
    uid: uid(),
    type,
    x,
    y,
    value,
    vx: Math.cos(ang) * pop,
    vy: Math.sin(ang) * pop,
    t: 0,
    magnet,
  }
  world.pickups.push(pickup)
  return pickup
}

export function spawnMaterial(
  world: World,
  x: number,
  y: number,
  value: number,
  ctx: SimCtx,
  magnet = false,
): Pickup {
  const type: PickupType = value >= 5 ? 'materialBig' : 'material'
  return spawnPickup(world, type, x, y, Math.max(1, value), ctx, magnet)
}

export function spawnFruit(world: World, x: number, y: number, ctx: SimCtx, magnet = false): Pickup {
  return spawnPickup(world, 'fruit', x, y, 1, ctx, magnet)
}

export function spawnChest(world: World, x: number, y: number, ctx: SimCtx, magnet = false): Pickup {
  ctx.render.fx.sparkle(x, y, '#c4a050')
  return spawnPickup(world, 'chest', x, y, 1, ctx, magnet)
}

export function spawnSeed(
  world: World,
  x: number,
  y: number,
  crop: CropId,
  ctx: SimCtx,
  magnet = false,
): Pickup {
  const p = spawnPickup(world, 'seed', x, y, 1, ctx, magnet)
  p.crop = crop
  return p
}

export function dropFromEnemy(world: World, x: number, y: number, materials: number, elite: boolean, ctx: SimCtx, magnet = false, enemy?: Enemy): void {
  const n = Math.max(1, materials)
  spawnMaterial(world, x, y, n, ctx, magnet)
  if (elite) spawnChest(world, x + ctx.rng.range(-8, 8), y + ctx.rng.range(-8, 8), ctx, magnet)
  if (!enemy) return
  const crop = cropByEnemy(enemy.kind)
  if (!crop) return
  if (!ctx.rng.chance(seedDropChance(enemy.kind, elite || enemy.boss, world.player.stats.luck))) return
  spawnSeed(world, x + ctx.rng.range(-10, 10), y + ctx.rng.range(-8, 8), crop, ctx, magnet)
}

export function magnetAll(world: World): void {
  for (const p of world.pickups) p.magnet = true
}

export function nearestTree(world: World, x: number, y: number, range: number): Tree | null {
  let best: Tree | null = null
  let bestD = range * range
  for (const tree of world.trees) {
    if (tree.hp <= 0) continue
    const d = dist2(x, y, tree.x, tree.y)
    if (d < bestD) {
      bestD = d
      best = tree
    }
  }
  return best
}

export function hitTree(world: World, tree: Tree, damage: number, ctx: SimCtx): void {
  if (tree.hp <= 0 || damage <= 0) return
  tree.hp -= damage
  tree.hitFlash = 1
  ctx.render.fx.puff(tree.x, tree.y - 10, '#5a7a38', 10)
  ctx.render.fx.hitSpark(tree.x, tree.y, ctx.rng.range(0, Math.PI * 2), '#7a9a40')
  if (tree.hp <= 0) {
    tree.hp = 0
    ctx.audio.play('treeBreak')
    ctx.render.fx.splat(tree.x, tree.y, '#4a6a30', 22, 10)
    ctx.render.fx.puff(tree.x, tree.y, '#c4d48a', 18)
    spawnFruit(world, tree.x, tree.y - 6, ctx)
    spawnMaterial(world, tree.x + 8, tree.y + 4, 2 + Math.floor(world.wave / 5), ctx)
  }
}

function grantChestItem(world: World, ctx: SimCtx): void {
  const odds = tierOdds(world.wave, world.player.stats.luck)
  const roll = ctx.rng.next()
  let acc = 0
  let tier: 1 | 2 | 3 | 4 = 1
  acc += odds[1]
  if (roll > acc) {
    acc += odds[2]
    tier = 2
  }
  if (roll > acc) {
    acc += odds[3]
    tier = 3
  }
  if (roll > acc) tier = 4

  const owned = new Set(world.player.items)
  let pool = ITEM_LIST.filter((it) => it.tier === tier && !(it.unique && owned.has(it.id)))
  if (pool.length === 0) pool = ITEM_LIST.filter((it) => !(it.unique && owned.has(it.id)))
  if (pool.length === 0) {
    spawnMaterial(world, world.player.x, world.player.y, 8, ctx, true)
    ctx.ui.toast('The chest was all moths. Have scrap.')
    return
  }
  const item = ctx.rng.pick(pool)
  world.player.items.push(item.id)
  recomputeStats(world.player)
  ctx.ui.toast(`Found ${item.name}`)
  ctx.render.fx.sparkle(world.player.x, world.player.y, world.player.character.palette.accent)
}

function collectPickup(world: World, pickup: Pickup, ctx: SimCtx): void {
  const player = world.player
  const healStacks = countSpecial(player, 'healOnPickup')

  if (pickup.type === 'material' || pickup.type === 'materialBig') {
    let value = pickup.value
    if (countSpecial(player, 'doubleMaterials') > 0) value *= 2
    player.materials += value
    player.materialsCollected += value
    addXp(player, value, ctx)
    ctx.audio.play('pickup')
    ctx.render.fx.sparkle(pickup.x, pickup.y, '#6aaf4a')
    if (player.character.special === 'materialsHeal') {
      const extra = extraState(player)
      extra.matHeal += value
      while (extra.matHeal >= 10) {
        extra.matHeal -= 10
        healPlayer(world, 1, ctx)
      }
    }
  } else if (pickup.type === 'fruit') {
    const heal = 3 + player.stats.consumableHeal
    healPlayer(world, heal, ctx)
    ctx.audio.play('fruit')
    ctx.render.fx.sparkle(pickup.x, pickup.y, '#c44a3a')
  } else if (pickup.type === 'chest') {
    ctx.audio.play('chest')
    grantChestItem(world, ctx)
  } else if (pickup.type === 'seed') {
    const crop = pickup.crop
    if (crop) {
      addSeed(world.farm, crop, 1)
      ctx.ui.toast(crop ? CROPS[crop].seedName : 'Seed')
    }
    ctx.audio.play('pickup')
    ctx.render.fx.sparkle(pickup.x, pickup.y, '#c4a050')
  }

  if (healStacks > 0) healPlayer(world, healStacks, ctx)
}

export function collectAllNow(world: World, ctx: SimCtx): void {
  for (const p of world.pickups) collectPickup(world, p, ctx)
  world.pickups = []
}

export function updatePickups(world: World, dt: number, ctx: SimCtx): void {
  const player = world.player
  const range = BASE_PICKUP_RANGE + player.stats.pickupRange
  const range2 = range * range
  const keep: Pickup[] = []
  for (const p of world.pickups) {
    p.t += dt
    if (!p.magnet && dist2(p.x, p.y, player.x, player.y) <= range2) p.magnet = true
    if (p.magnet) {
      const dx = player.x - p.x
      const dy = player.y - p.y
      const d = Math.hypot(dx, dy) || 1
      const pull = 90 + p.t * 520
      p.vx = (dx / d) * pull
      p.vy = (dy / d) * pull
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (d < 26) {
        collectPickup(world, p, ctx)
        continue
      }
    } else {
      p.vx = dampVel(p.vx, dt)
      p.vy = dampVel(p.vy, dt)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.x = clamp(p.x, -world.arenaHalfW + 8, world.arenaHalfW - 8)
      p.y = clamp(p.y, -world.arenaHalfH + 8, world.arenaHalfH - 8)
    }
    keep.push(p)
  }
  world.pickups = keep
}

function dampVel(v: number, dt: number): number {
  return v * Math.exp(-5.5 * dt)
}

export function payoutHarvest(world: World, ctx: SimCtx): void {
  const pay = harvestPayout(world.player.stats.harvesting)
  if (pay > 0) {
    world.player.materials += pay
    world.player.materialsCollected += pay
    addXp(world.player, pay, ctx)
    ctx.ui.toast(`Harvest +${pay}`)
    ctx.render.fx.sparkle(world.player.x, world.player.y, '#6aaf4a')
  }
  const cropPay = harvestFarm(world, world.player.stats.harvesting)
  if (cropPay.materials > 0 || cropPay.xp > 0) {
    world.player.materials += cropPay.materials
    world.player.materialsCollected += cropPay.materials
    addXp(world.player, cropPay.xp, ctx)
    ctx.ui.toast(`The row paid ${cropPay.materials} scrap, ${cropPay.xp} growth.`)
    ctx.render.fx.sparkle(world.player.x, world.player.y - 12, '#c4a050')
  }
  const fruits = countSpecial(world.player, 'fruitOnWaveEnd')
  for (let i = 0; i < fruits; i++) {
    spawnFruit(
      world,
      world.player.x + ctx.rng.range(-40, 40),
      world.player.y + ctx.rng.range(-30, 30),
      ctx,
      true,
    )
  }
}

export function enemyMaterialValue(world: World, def: EnemyDef, ctx: SimCtx): number {
  return materialDropValue(def, world.wave, ctx.rng)
}
