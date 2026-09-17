import { clamp, dist2, uid, wrapAngle } from '../core/math.ts'
import type { Projectile, ProjectileDef, StatusEffect, World } from '../core/types.ts'
import { dealDamageToEnemy, damagePlayer } from './combat.ts'
import { hitTree } from './pickups.ts'
import type { SimCtx } from './world.ts'

export interface FireSpec {
  x: number
  y: number
  angle: number
  damage: number
  crit: boolean
  def: ProjectileDef
  owner: 'player' | 'enemy'
  effects: StatusEffect[]
  knockback: number
  weaponUid: number
}

export function spawnProjectile(world: World, spec: FireSpec): Projectile {
  const spd = spec.def.speed
  const p: Projectile = {
    uid: uid(),
    x: spec.x,
    y: spec.y,
    vx: Math.cos(spec.angle) * spd,
    vy: Math.sin(spec.angle) * spd,
    r: spec.def.radius,
    damage: spec.damage,
    crit: spec.crit,
    pierce: spec.def.pierce,
    bounce: spec.def.bounce ?? 0,
    life: spec.def.life,
    maxLife: spec.def.life,
    owner: spec.owner,
    def: spec.def,
    angle: spec.angle,
    trail: [{ x: spec.x, y: spec.y }],
    effects: spec.effects,
    knockback: spec.knockback,
    hitUids: [],
    weaponUid: spec.weaponUid,
    homing: spec.def.homing ?? 0,
  }
  world.projectiles.push(p)
  return p
}

function nearestHoming(world: World, p: Projectile): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestD = 420 * 420
  if (p.owner === 'player') {
    for (const e of world.enemies) {
      if (e.state === 'dying' || e.state === 'spawning') continue
      if (p.hitUids.includes(e.uid)) continue
      const d = dist2(p.x, p.y, e.x, e.y)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
  } else {
    const pl = world.player
    if (pl.hp > 0) best = pl
  }
  return best
}

export function updateProjectiles(world: World, dt: number, ctx: SimCtx): void {
  const hw = world.arenaHalfW
  const hh = world.arenaHalfH
  const keep: Projectile[] = []

  for (const p of world.projectiles) {
    p.life -= dt
    if (p.life <= 0) continue

    if (p.homing > 0) {
      const t = nearestHoming(world, p)
      if (t) {
        const desired = Math.atan2(t.y - p.y, t.x - p.x)
        const da = wrapAngle(desired - p.angle)
        const turn = p.homing * 8 * dt
        p.angle += clamp(da, -turn, turn)
        const spd = Math.hypot(p.vx, p.vy) || p.def.speed
        p.vx = Math.cos(p.angle) * spd
        p.vy = Math.sin(p.angle) * spd
      }
    }

    p.x += p.vx * dt
    p.y += p.vy * dt
    p.angle = Math.atan2(p.vy, p.vx)

    p.trail.push({ x: p.x, y: p.y })
    if (p.trail.length > 6) p.trail.splice(0, p.trail.length - 6)

    let dead = false
    if (p.x < -hw || p.x > hw) {
      if (p.bounce > 0) {
        p.vx *= -1
        p.bounce -= 1
        p.x = clamp(p.x, -hw + 1, hw - 1)
        p.angle = Math.atan2(p.vy, p.vx)
      } else dead = true
    }
    if (p.y < -hh || p.y > hh) {
      if (p.bounce > 0) {
        p.vy *= -1
        p.bounce -= 1
        p.y = clamp(p.y, -hh + 1, hh - 1)
        p.angle = Math.atan2(p.vy, p.vx)
      } else dead = true
    }
    if (dead) continue

    if (p.owner === 'player') {
      for (const e of world.enemies) {
        if (e.state === 'dying' || e.state === 'spawning') continue
        if (p.hitUids.includes(e.uid)) continue
        const rad = p.r + e.r
        if (dist2(p.x, p.y, e.x, e.y) > rad * rad) continue
        p.hitUids.push(e.uid)
        dealDamageToEnemy(world, e, p.damage, ctx, {
          critChance: p.crit ? 100 : 0,
          critMult: 1,
          knockback: p.knockback,
          effects: p.effects,
          dirX: p.vx,
          dirY: p.vy,
          color: world.player.character.palette.accent,
        })
        p.pierce -= 1
        if (p.pierce < 0) {
          dead = true
          break
        }
      }
      if (!dead) {
        for (const tree of world.trees) {
          if (tree.hp <= 0 || p.hitUids.includes(tree.uid)) continue
          const rad = p.r + tree.r
          if (dist2(p.x, p.y, tree.x, tree.y) > rad * rad) continue
          p.hitUids.push(tree.uid)
          hitTree(world, tree, p.damage, ctx)
          p.pierce -= 1
          if (p.pierce < 0) {
            dead = true
            break
          }
        }
      }
    } else {
      const pl = world.player
      if (pl.hp > 0 && !p.hitUids.includes(-1)) {
        const rad = p.r + pl.r
        if (dist2(p.x, p.y, pl.x, pl.y) <= rad * rad) {
          p.hitUids.push(-1)
          if (pl.invuln <= 0) damagePlayer(world, p.damage, ctx, 'a stray shot')
          dead = true
        }
      }
    }
    if (!dead) keep.push(p)
  }
  world.projectiles = keep
}
