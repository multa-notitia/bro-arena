import { dist, dist2, TAU, wrapAngle } from '../core/math.ts'
import type {
  Enemy,
  StatusEffect,
  Tree,
  WeaponDef,
  WeaponInstance,
  World,
} from '../core/types.ts'
import { WEAPONS, weaponCooldown, weaponDamage, weaponRange } from '../data/weapons.ts'
import { dealDamageToEnemy } from './combat.ts'
import { hitTree, nearestTree } from './pickups.ts'
import { spawnProjectile } from './projectiles.ts'
import { accentColor } from './world.ts'
import type { SimCtx } from './world.ts'

const SWING_TIME = 0.18
const ORBIT_LOCK = 0.25

const orbitLock = new Map<string, number>()

export function resetWeaponRuntime(): void {
  orbitLock.clear()
}

export function nearestEnemy(world: World, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null
  let bestD = range * range
  for (const e of world.enemies) {
    if (e.state === 'dying' || e.state === 'spawning') continue
    const d = dist2(x, y, e.x, e.y)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby || 1
  let t = (apx * abx + apy * aby) / ab2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + abx * t
  const qy = ay + aby * t
  return Math.hypot(px - qx, py - qy)
}

function startSwing(w: WeaponInstance): void {
  w.swingT = 0
}

function tickSwing(w: WeaponInstance, dt: number): void {
  if (w.swingT < 0) return
  w.swingT += dt / SWING_TIME
  if (w.swingT >= 1) w.swingT = -1
}

function weaponHurtOpts(def: WeaponDef, w: WeaponInstance) {
  const row = def.tiers[w.tier]
  return {
    critChance: row.critChance,
    critMult: row.critMult,
    knockback: row.knockback,
    lifeSteal: row.lifeSteal ?? 0,
    effects: (def.effects ?? []) as StatusEffect[],
    color: undefined as string | undefined,
  }
}

function fireShot(
  world: World,
  w: WeaponInstance,
  def: WeaponDef,
  ctx: SimCtx,
  angle: number,
): void {
  const b = def.behavior
  if (b.type !== 'shoot') return
  const player = world.player
  const dmg = weaponDamage(def, w.tier, player.stats)
  const row = def.tiers[w.tier]
  const count = b.count ?? 1
  const spread = b.spread ?? 0
  const color = accentColor(world)
  const muzzle = 18
  const mx = player.x + Math.cos(angle) * muzzle
  const my = player.y + Math.sin(angle) * muzzle
  ctx.render.fx.hitSpark(mx, my, angle, color)
  player.anim.kick.x -= Math.cos(angle) * 5
  player.anim.kick.y -= Math.sin(angle) * 5

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2
    const a = angle + t * (spread / 2)
    const crit = ctx.rng.chance((row.critChance + player.stats.critChance) / 100)
    spawnProjectile(world, {
      x: mx,
      y: my,
      angle: a,
      damage: crit ? Math.round(dmg * row.critMult) : dmg,
      crit,
      def: b.projectile,
      owner: 'player',
      effects: def.effects ?? [],
      knockback: row.knockback,
      weaponUid: w.uid,
    })
  }

  if (def.paint === 'shotgun' || count >= 4) ctx.audio.play('shotgun')
  else if (def.paint === 'flint' || b.projectile.paint === 'bolt') ctx.audio.play('bolt')
  else ctx.audio.play('shoot')
}

function doThrust(world: World, w: WeaponInstance, def: WeaponDef, ctx: SimCtx, range: number): void {
  const b = def.behavior
  if (b.type !== 'thrust') return
  const player = world.player
  const angle = w.angle
  const len = range
  const ax = player.x
  const ay = player.y
  const bx = ax + Math.cos(angle) * len
  const by = ay + Math.sin(angle) * len
  const dmg = weaponDamage(def, w.tier, player.stats)
  const opts = weaponHurtOpts(def, w)
  opts.color = accentColor(world)
  const width = 14 + b.reach * 0.12
  ctx.render.fx.thrust(ax, ay, angle, len, accentColor(world))
  ctx.audio.play('stab')
  player.anim.kick.x += Math.cos(angle) * 10
  player.anim.kick.y += Math.sin(angle) * 10
  startSwing(w)

  for (const e of world.enemies) {
    if (e.state === 'dying' || e.state === 'spawning') continue
    if (pointSegDist(e.x, e.y, ax, ay, bx, by) <= e.r + width) {
      dealDamageToEnemy(world, e, dmg, ctx, {
        ...opts,
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
      })
    }
  }
  for (const tree of world.trees) {
    if (tree.hp <= 0) continue
    if (pointSegDist(tree.x, tree.y, ax, ay, bx, by) <= tree.r + width) {
      hitTree(world, tree, dmg, ctx)
    }
  }
}

function doSweep(world: World, w: WeaponInstance, def: WeaponDef, ctx: SimCtx, range: number): void {
  const b = def.behavior
  if (b.type !== 'sweep') return
  const player = world.player
  const dmg = weaponDamage(def, w.tier, player.stats)
  const opts = weaponHurtOpts(def, w)
  opts.color = accentColor(world)
  ctx.render.fx.slash(player.x, player.y, w.angle, b.arc, range, accentColor(world))
  ctx.audio.play('swing')
  startSwing(w)
  const half = b.arc / 2
  for (const e of world.enemies) {
    if (e.state === 'dying' || e.state === 'spawning') continue
    const d = dist(player.x, player.y, e.x, e.y)
    if (d > range + e.r) continue
    const ang = Math.atan2(e.y - player.y, e.x - player.x)
    if (Math.abs(wrapAngle(ang - w.angle)) > half) continue
    dealDamageToEnemy(world, e, dmg, ctx, {
      ...opts,
      dirX: e.x - player.x,
      dirY: e.y - player.y,
    })
  }
  for (const tree of world.trees) {
    if (tree.hp <= 0) continue
    const d = dist(player.x, player.y, tree.x, tree.y)
    if (d > range + tree.r) continue
    const ang = Math.atan2(tree.y - player.y, tree.x - player.x)
    if (Math.abs(wrapAngle(ang - w.angle)) > half) continue
    hitTree(world, tree, dmg, ctx)
  }
}

function doChain(world: World, w: WeaponInstance, def: WeaponDef, ctx: SimCtx, range: number): void {
  const b = def.behavior
  if (b.type !== 'chain') return
  const player = world.player
  const first = nearestEnemy(world, player.x, player.y, range)
  if (!first) return
  const dmg = weaponDamage(def, w.tier, player.stats)
  const opts = weaponHurtOpts(def, w)
  opts.color = accentColor(world)
  const hit = new Set<number>()
  let fromX = player.x
  let fromY = player.y
  let current: Enemy | null = first
  const jumps = b.jumps
  ctx.audio.play('zap')
  startSwing(w)
  for (let n = 0; n < jumps + 1 && current; n++) {
    hit.add(current.uid)
    ctx.render.fx.thrust(fromX, fromY, Math.atan2(current.y - fromY, current.x - fromX), dist(fromX, fromY, current.x, current.y), '#8ec8ff')
    dealDamageToEnemy(world, current, dmg, ctx, {
      ...opts,
      dirX: current.x - fromX,
      dirY: current.y - fromY,
      color: '#8ec8ff',
    })
    fromX = current.x
    fromY = current.y
    let next: Enemy | null = null
    let nextD = b.jumpRange * b.jumpRange
    for (const e of world.enemies) {
      if (hit.has(e.uid) || e.state === 'dying' || e.state === 'spawning') continue
      const d = dist2(fromX, fromY, e.x, e.y)
      if (d < nextD) {
        nextD = d
        next = e
      }
    }
    current = next
  }
}

function doAura(world: World, w: WeaponInstance, def: WeaponDef, ctx: SimCtx, dt: number): void {
  const b = def.behavior
  if (b.type !== 'aura') return
  const player = world.player
  const radius = weaponRange(def, w.tier, player.stats)
  w.auraAcc += dt
  while (w.auraAcc >= b.tick) {
    w.auraAcc -= b.tick
    const dmg = weaponDamage(def, w.tier, player.stats)
    const opts = weaponHurtOpts(def, w)
    opts.color = '#e07030'
    startSwing(w)
    for (const e of world.enemies) {
      if (e.state === 'dying' || e.state === 'spawning') continue
      if (dist2(player.x, player.y, e.x, e.y) > (radius + e.r) * (radius + e.r)) continue
      dealDamageToEnemy(world, e, dmg, ctx, { ...opts, knockback: opts.knockback * 0.25 })
    }
    for (const tree of world.trees) {
      if (tree.hp <= 0) continue
      if (dist2(player.x, player.y, tree.x, tree.y) > (radius + tree.r) * (radius + tree.r)) continue
      hitTree(world, tree, dmg, ctx)
    }
  }
}

function doOrbit(world: World, w: WeaponInstance, def: WeaponDef, ctx: SimCtx, dt: number): void {
  const b = def.behavior
  if (b.type !== 'orbit') return
  const player = world.player
  const radius = b.radius + player.stats.range * 0.2
  w.angle = world.time * 2.35
  const dmg = weaponDamage(def, w.tier, player.stats)
  const opts = weaponHurtOpts(def, w)
  opts.color = accentColor(world)
  const bladeR = 12
  for (const [key, left] of orbitLock) {
    const next = left - dt
    if (next <= 0) orbitLock.delete(key)
    else orbitLock.set(key, next)
  }
  for (let i = 0; i < b.count; i++) {
    const a = w.angle + (i / b.count) * TAU
    const bx = player.x + Math.cos(a) * radius
    const by = player.y + Math.sin(a) * radius
    for (const e of world.enemies) {
      if (e.state === 'dying' || e.state === 'spawning') continue
      const key = `${w.uid}:${e.uid}`
      if (orbitLock.has(key)) continue
      if (dist2(bx, by, e.x, e.y) > (bladeR + e.r) * (bladeR + e.r)) continue
      orbitLock.set(key, ORBIT_LOCK)
      dealDamageToEnemy(world, e, dmg, ctx, {
        ...opts,
        dirX: e.x - player.x,
        dirY: e.y - player.y,
      })
      startSwing(w)
    }
    for (const tree of world.trees) {
      if (tree.hp <= 0) continue
      const key = `${w.uid}:t${tree.uid}`
      if (orbitLock.has(key)) continue
      if (dist2(bx, by, tree.x, tree.y) > (bladeR + tree.r) * (bladeR + tree.r)) continue
      orbitLock.set(key, ORBIT_LOCK)
      hitTree(world, tree, dmg, ctx)
      startSwing(w)
    }
  }
}

function aimWeapon(world: World, w: WeaponInstance, range: number, dt: number, melee: boolean): void {
  const player = world.player
  const enemy = nearestEnemy(world, player.x, player.y, range)
  let target: Enemy | Tree | null = enemy
  if (!target && melee) target = nearestTree(world, player.x, player.y, range)
  w.targetUid = target ? target.uid : null
  const desired = target
    ? Math.atan2(target.y - player.y, target.x - player.x)
    : player.facingAngle
  w.angle += wrapAngle(desired - w.angle) * Math.min(1, 14 * dt)
}

export function updateWeapons(world: World, dt: number, ctx: SimCtx): void {
  const player = world.player
  if (player.hp <= 0) return
  for (const w of player.weapons) {
    const def = WEAPONS[w.id]
    if (!def) continue
    tickSwing(w, dt)
    const range = weaponRange(def, w.tier, player.stats)
    const cd = weaponCooldown(def, w.tier, player.stats)
    const b = def.behavior
    const melee = b.type === 'thrust' || b.type === 'sweep' || b.type === 'chain'

    if (b.type === 'orbit') {
      doOrbit(world, w, def, ctx, dt)
      continue
    }
    if (b.type === 'aura') {
      doAura(world, w, def, ctx, dt)
      continue
    }

    aimWeapon(world, w, range, dt, melee)
    w.cooldown = Math.max(0, w.cooldown - dt)

    if (b.type === 'shoot' && w.burstLeft > 0) {
      w.burstTimer -= dt
      if (w.burstTimer <= 0) {
        fireShot(world, w, def, ctx, w.angle)
        w.burstLeft -= 1
        w.burstTimer = b.burstDelay ?? 0.08
        startSwing(w)
        if (w.burstLeft <= 0) w.cooldown = cd
      }
      continue
    }

    if (w.cooldown > 0) continue
    if (b.type === 'shoot') {
      const enemy = nearestEnemy(world, player.x, player.y, range * 1.12)
      if (!enemy) continue
      fireShot(world, w, def, ctx, w.angle)
      startSwing(w)
      const burst = b.burst ?? 1
      if (burst > 1) {
        w.burstLeft = burst - 1
        w.burstTimer = b.burstDelay ?? 0.08
        w.cooldown = 999
      } else {
        w.cooldown = cd
      }
      continue
    }
    if (b.type === 'thrust') {
      const enemy = nearestEnemy(world, player.x, player.y, range)
      const tree = enemy ? null : nearestTree(world, player.x, player.y, range)
      if (!enemy && !tree) continue
      doThrust(world, w, def, ctx, range)
      w.cooldown = cd
      continue
    }
    if (b.type === 'sweep') {
      const enemy = nearestEnemy(world, player.x, player.y, range)
      const tree = enemy ? null : nearestTree(world, player.x, player.y, range)
      if (!enemy && !tree) continue
      doSweep(world, w, def, ctx, range)
      w.cooldown = cd
      continue
    }
    if (b.type === 'chain') {
      const enemy = nearestEnemy(world, player.x, player.y, range)
      if (!enemy) continue
      doChain(world, w, def, ctx, range)
      w.cooldown = cd
    }
  }
}
