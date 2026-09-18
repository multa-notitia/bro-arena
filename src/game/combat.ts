import { dist2 } from '../core/math.ts'
import type { Enemy, StatusEffect, World } from '../core/types.ts'
import { extraState, countSpecial, healPlayer } from './player.ts'
import { spawnMaterial } from './pickups.ts'
import type { SimCtx } from './world.ts'

export interface HurtOpts {
  critChance?: number
  critMult?: number
  knockback?: number
  lifeSteal?: number
  effects?: StatusEffect[]
  dirX?: number
  dirY?: number
  color?: string
  explode?: boolean
  thorns?: boolean
  burnTick?: boolean
}

function unit(dx: number, dy: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy) || 1
  return { x: dx / d, y: dy / d }
}

export function dealDamageToEnemy(
  world: World,
  enemy: Enemy,
  base: number,
  ctx: SimCtx,
  opts: HurtOpts = {},
): number {
  if (base <= 0) return 0
  if (enemy.state === 'dying' || enemy.state === 'spawning') return 0
  if (enemy.hp <= 0) return 0

  const stats = world.player.stats
  let dmg = base
  let crit = false
  if (!opts.burnTick && !opts.thorns) {
    const chance = (opts.critChance ?? 0) + stats.critChance
    crit = ctx.rng.chance(chance / 100)
    if (crit) dmg *= opts.critMult ?? 2
  }
  if (enemy.state === 'screaming') dmg *= 1.5

  dmg = Math.max(1, Math.round(dmg))
  enemy.hp -= dmg
  world.player.damageDealt += dmg
  enemy.anim.hitFlash = 1
  enemy.anim.squash = 0.72

  const dir = unit(
    opts.dirX ?? world.player.x - enemy.x,
    opts.dirY ?? world.player.y - enemy.y,
  )
  // Knock away from the player unless a shot direction was given.
  const kx = opts.dirX !== undefined ? dir.x : -dir.x
  const ky = opts.dirY !== undefined ? dir.y : -dir.y
  if (!opts.burnTick) {
    const kb = (opts.knockback ?? 0) * (1 + stats.knockback / 100) * (1 - enemy.def.knockbackResist)
    enemy.knock.x += kx * kb * 8
    enemy.knock.y += ky * kb * 8
    ctx.render.fx.hitSpark(enemy.x, enemy.y, Math.atan2(ky, kx), opts.color ?? enemy.def.palette.accent)
    ctx.render.fx.splat(enemy.x, enemy.y, enemy.def.palette.body, Math.min(18, 6 + dmg * 0.4), crit ? 7 : 4)
  }

  const numOpts = opts.burnTick ? { burn: true } : crit ? { crit: true } : undefined
  ctx.render.fx.damageNumber(enemy.x, enemy.y - enemy.r - 6, dmg, numOpts)
  if (opts.burnTick) ctx.audio.play('burn', { gain: 0.45 })
  else if (crit) ctx.audio.play('crit')
  else ctx.audio.play('hit', { gain: 0.7 })

  if (crit) world.camera.shake = Math.min(18, world.camera.shake + 2.5)

  if (!opts.burnTick && !opts.thorns) {
    const steal = (opts.lifeSteal ?? 0) + stats.lifeSteal
    if (steal > 0 && ctx.rng.chance(steal / 100)) healPlayer(world, 1, ctx)
    if (crit && countSpecial(world.player, 'critHeals') > 0) healPlayer(world, 1, ctx)

    if (opts.effects?.includes('burn') || countSpecial(world.player, 'burnOnHit') > 0) {
      enemy.burn = Math.max(enemy.burn, 3.2)
      enemy.burnDps = Math.max(enemy.burnDps, Math.max(2, dmg * 0.22))
    }
    if (opts.effects?.includes('slow') || countSpecial(world.player, 'slowOnHit') > 0) {
      enemy.slow = Math.max(enemy.slow, 2.2)
    }
  }

  const killed = enemy.hp <= 0
  if (killed) {
    enemy.hp = 0
    if (opts.explode !== false && !opts.thorns && !opts.burnTick) {
      const stacks = countSpecial(world.player, 'explodeOnKill')
      if (stacks > 0) {
        const radius = 72 + stacks * 16
        const splash = Math.max(4, Math.round(dmg * (0.35 + stacks * 0.12)))
        ctx.render.fx.shockwave(enemy.x, enemy.y, radius, enemy.def.palette.accent)
        ctx.audio.play('hit', { pitch: 0.7, gain: 0.9 })
        for (const other of world.enemies) {
          if (other === enemy || other.state === 'dying') continue
          if (dist2(enemy.x, enemy.y, other.x, other.y) > radius * radius) continue
          dealDamageToEnemy(world, other, splash, ctx, {
            dirX: other.x - enemy.x,
            dirY: other.y - enemy.y,
            color: enemy.def.palette.accent,
            explode: false,
            knockback: 6,
          })
        }
      }
    }
  }
  return dmg
}

export function damagePlayer(
  world: World,
  amount: number,
  ctx: SimCtx,
  source: string,
  sourceEnemy?: Enemy,
): boolean {
  const player = world.player
  if (player.hp <= 0 || amount <= 0) return false
  if (player.invuln > 0) return false

  const dodge = Math.min(60, Math.max(0, player.stats.dodge))
  if (dodge > 0 && ctx.rng.chance(dodge / 100)) {
    ctx.render.fx.damageNumber(player.x, player.y - 24, 0, { dodge: true })
    ctx.audio.play('dodge')
    if (countSpecial(player, 'materialOnDodge') > 0) {
      spawnMaterial(world, player.x + ctx.rng.range(-10, 10), player.y + ctx.rng.range(-8, 8), 1, ctx, true)
    }
    return false
  }

  const armor = player.stats.armor
  const factor = 15 / Math.max(0.75, armor + 15)
  const taken = Math.max(1, Math.round(amount * factor))
  player.hp -= taken
  player.damageTaken += taken
  player.invuln = 0.5
  player.anim.hitFlash = 1
  world.camera.shake = Math.min(22, world.camera.shake + 9)
  ctx.audio.play('playerHurt')
  ctx.render.fx.flash('rgba(140,22,18,0.55)', 0.5)
  ctx.render.fx.splat(player.x, player.y, player.character.palette.body, 12, 6)
  ctx.render.fx.damageNumber(player.x, player.y - 20, taken)

  const extra = extraState(player)
  extra.flinchT = 0.3

  if (sourceEnemy) {
    const away = unit(player.x - sourceEnemy.x, player.y - sourceEnemy.y)
    player.anim.kick.x += away.x * 14
    player.anim.kick.y += away.y * 14
    let thorns = countSpecial(player, 'thorns')
    if (player.character.special === 'thornsHalf') thorns += Math.max(1, Math.round(amount * 0.5))
    if (thorns > 0 && sourceEnemy.state !== 'dying') {
      dealDamageToEnemy(world, sourceEnemy, thorns, ctx, {
        dirX: sourceEnemy.x - player.x,
        dirY: sourceEnemy.y - player.y,
        color: player.character.palette.accent,
        explode: false,
        thorns: true,
        knockback: 4,
      })
    }
  }

  if (player.hp <= 0) {
    player.hp = 0
    player.anim.deathT = 0
    setKillSource(killLabel(source, sourceEnemy))
  }
  return true
}

let killSource: string | null = null

function killLabel(source: string, enemy?: Enemy): string {
  if (!enemy) return source
  return enemy.form === 'nightmare' ? enemy.def.nightmareName || enemy.def.name : enemy.def.name
}

export function setKillSource(name: string): void {
  killSource = name
}

export function takeKillSource(): string | null {
  const v = killSource
  killSource = null
  return v
}

export function peekKillSource(): string | null {
  return killSource
}
