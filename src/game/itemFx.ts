import { TAU, clamp, dist2 } from '../core/math.ts'
import type { Enemy, World } from '../core/types.ts'
import { dealDamageToEnemy as hurt } from './combat.ts'
import { familyUntargetable } from './families.ts'
import { spawnMaterial } from './pickups.ts'
import { countSpecial } from './player.ts'
import type { SimCtx } from './world.ts'

/**
 * Item specials that need their own clock or their own paint: sparks, stomps,
 * thistle seeds, spore clouds, the guard, frenzy, culls, lucky kills.
 * combat.ts calls the on* hooks; run.ts ticks; world.ts draws.
 */

const SPARK_COLOR = '#9fd8ff'
const SPORE_COLOR = '#b9d36a'
const GUARD_COLOR = '#e8c27a'
const FRENZY_COLOR = '#e0502e'

interface Cloud {
  x: number
  y: number
  r: number
  life: number
  dps: number
  acc: number
}

const state = {
  orbitA: 0,
  orbitLock: new Map<number, number>(),
  clouds: [] as Cloud[],
  guardUp: false,
  guardT: 0,
  guardPop: 0,
  stompCd: 0,
  frenzy: 0,
  frenzyT: 0,
  /** Stops a spark from sparking off its own hit. */
  inProc: false,
}

export function resetItemFx(): void {
  state.orbitA = 0
  state.orbitLock.clear()
  state.clouds.length = 0
  state.guardUp = false
  state.guardT = 0
  state.guardPop = 0
  state.stompCd = 0
  state.frenzy = 0
  state.frenzyT = 0
  state.inProc = false
}

function live(e: Enemy): boolean {
  return e.state !== 'dying' && e.state !== 'spawning' && e.hp > 0 && !familyUntargetable(e)
}

function zap(world: World, e: Enemy, dmg: number, ctx: SimCtx, color: string, fromX: number, fromY: number): void {
  state.inProc = true
  hurt(world, e, dmg, ctx, { dirX: e.x - fromX, dirY: e.y - fromY, color, explode: false, thorns: true, knockback: 3 })
  state.inProc = false
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** A direct hit landed and the enemy survived or died. */
export function onItemHit(world: World, enemy: Enemy, dmg: number, ctx: SimCtx): void {
  if (state.inProc) return
  const p = world.player
  const sparks = countSpecial(p, 'chainSpark')
  if (sparks > 0 && ctx.rng.chance(Math.min(0.45, 0.15 * sparks))) {
    const jumps = 1 + sparks
    const reach = 150
    const hit = new Set<number>([enemy.uid])
    let fx = enemy.x
    let fy = enemy.y
    const bolt = Math.max(2, Math.round(3 + p.stats.elementalDamage * 1.5 + dmg * 0.25))
    ctx.audio.play('zap', { gain: 0.55, pitch: 1.25 })
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | null = null
      let bestD = reach * reach
      for (const e of world.enemies) {
        if (hit.has(e.uid) || !live(e)) continue
        const d = dist2(fx, fy, e.x, e.y)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
      if (!best) break
      hit.add(best.uid)
      ctx.render.fx.bolt(fx, fy, best.x, best.y, SPARK_COLOR)
      ctx.render.fx.sparkle(best.x, best.y, SPARK_COLOR)
      zap(world, best, bolt, ctx, SPARK_COLOR, fx, fy)
      fx = best.x
      fy = best.y
    }
  }
  const cull = countSpecial(p, 'cullLow')
  if (cull > 0 && enemy.hp > 0 && !enemy.boss && enemy.hp <= enemy.maxHp * Math.min(0.3, 0.12 + 0.06 * cull)) {
    ctx.render.fx.text(enemy.x, enemy.y - enemy.r - 14, 'CULLED', '#f4ead0')
    ctx.render.fx.inkBurst(enemy.x, enemy.y, enemy.r * 1.4)
    zap(world, enemy, enemy.hp, ctx, '#f4ead0', p.x, p.y)
  }
}

export function onItemKill(world: World, enemy: Enemy, ctx: SimCtx): void {
  const p = world.player
  const spores = countSpecial(p, 'sporeOnKill')
  if (spores > 0 && state.clouds.length < 14 && ctx.rng.chance(Math.min(0.6, 0.3 * spores))) {
    state.clouds.push({
      x: enemy.x,
      y: enemy.y,
      r: 44 + spores * 8,
      life: 3,
      dps: 3 + spores * 2 + p.stats.elementalDamage,
      acc: 0,
    })
    ctx.render.fx.puff(enemy.x, enemy.y, SPORE_COLOR, 26)
    ctx.audio.play('mudSquelch', { gain: 0.4, pitch: 1.3 })
  }
  const frenzy = countSpecial(p, 'frenzyOnKill')
  if (frenzy > 0) {
    const was = state.frenzy
    state.frenzy = Math.min(10, state.frenzy + 1)
    state.frenzyT = 2.6
    if (state.frenzy === 10 && was < 10) {
      ctx.render.fx.text(p.x, p.y - 40, 'FRENZY', FRENZY_COLOR)
      ctx.render.fx.shockwave(p.x, p.y, 70, FRENZY_COLOR)
    }
  }
  const lucky = countSpecial(p, 'luckyKill')
  if (lucky > 0 && ctx.rng.chance(Math.min(0.2, 0.06 * lucky + p.stats.luck / 2000))) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + ctx.rng.range(0, 1)
      spawnMaterial(world, enemy.x + Math.cos(a) * 14, enemy.y + Math.sin(a) * 10, 1, ctx)
    }
    for (let i = 0; i < 4; i++) ctx.render.fx.sparkle(enemy.x + ctx.rng.range(-16, 16), enemy.y + ctx.rng.range(-16, 8), '#ffd84a')
    ctx.render.fx.text(enemy.x, enemy.y - enemy.r - 10, 'LUCKY', '#ffd84a')
    ctx.audio.play('chest', { gain: 0.5, pitch: 1.4 })
  }
}

/** Before armor. Returns true when the guard ate the hit. */
export function onItemBlock(world: World, ctx: SimCtx): boolean {
  if (!state.guardUp) return false
  const p = world.player
  state.guardUp = false
  state.guardT = 0
  state.guardPop = 1
  p.invuln = Math.max(p.invuln, 0.35)
  ctx.render.fx.shockwave(p.x, p.y, 54, GUARD_COLOR)
  ctx.render.fx.chunks(p.x, p.y - 6, { body: '#b88a4a', shade: '#7a5a30', accent: GUARD_COLOR }, 12, false)
  ctx.render.fx.text(p.x, p.y - 38, 'BLOCK', GUARD_COLOR)
  ctx.audio.play('lock', { gain: 0.9, pitch: 0.7 })
  return true
}

/** After the player took a hit from an enemy. */
export function onItemHurt(world: World, ctx: SimCtx): void {
  const p = world.player
  const stomp = countSpecial(p, 'stompOnHurt')
  if (stomp <= 0 || state.stompCd > 0) return
  state.stompCd = Math.max(1.5, 3.5 - stomp * 0.5)
  const radius = 110 + stomp * 15
  const dmg = 4 + Math.max(0, p.stats.armor) + stomp * 2
  ctx.render.fx.shockwave(p.x, p.y, radius, '#8a6a44')
  ctx.render.fx.shockwave(p.x, p.y, radius * 0.6, '#c9a774')
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    ctx.render.fx.dust(p.x + Math.cos(a) * radius * 0.5, p.y + Math.sin(a) * radius * 0.4, Math.cos(a) * 80, Math.sin(a) * 60)
  }
  ctx.audio.play('mudRise', { gain: 0.8, pitch: 0.8 })
  for (const e of world.enemies) {
    if (!live(e)) continue
    if (dist2(p.x, p.y, e.x, e.y) > (radius + e.r) * (radius + e.r)) continue
    e.slow = Math.max(e.slow, 1.6)
    state.inProc = true
    hurt(world, e, dmg, ctx, { dirX: e.x - p.x, dirY: e.y - p.y, color: '#c9a774', explode: false, thorns: true, knockback: 14 })
    state.inProc = false
  }
}

/** Weapon cooldowns tick this much faster. */
export function frenzyRate(): number {
  return 1 + state.frenzy * 0.05
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

const ORBIT_R = 48
const SEED_R = 9

function seedCount(world: World): number {
  return Math.min(6, countSpecial(world.player, 'orbitSeeds') * 2)
}

export function updateItemFx(world: World, dt: number, ctx: SimCtx): void {
  const p = world.player
  if (p.hp <= 0) return

  state.stompCd = Math.max(0, state.stompCd - dt)
  state.guardPop = Math.max(0, state.guardPop - dt * 3)

  const guards = countSpecial(p, 'guard')
  if (guards > 0 && !state.guardUp) {
    state.guardT += dt
    if (state.guardT >= Math.max(4, 9 - guards * 1.5)) {
      state.guardUp = true
      state.guardT = 0
      ctx.render.fx.sparkle(p.x, p.y - 20, GUARD_COLOR)
    }
  }

  if (state.frenzyT > 0) {
    state.frenzyT -= dt
    if (state.frenzyT <= 0) state.frenzy = 0
  }

  const seeds = seedCount(world)
  if (seeds > 0) {
    state.orbitA += dt * 3.1
    for (const [uid, left] of state.orbitLock) {
      if (left - dt <= 0) state.orbitLock.delete(uid)
      else state.orbitLock.set(uid, left - dt)
    }
    const dmg = Math.max(2, Math.round(3 + p.stats.meleeDamage * 0.6 + p.stats.damage * 0.05))
    for (let i = 0; i < seeds; i++) {
      const a = state.orbitA + (i / seeds) * TAU
      const sx = p.x + Math.cos(a) * ORBIT_R
      const sy = p.y + Math.sin(a) * ORBIT_R * 0.8
      for (const e of world.enemies) {
        if (!live(e) || state.orbitLock.has(e.uid)) continue
        if (dist2(sx, sy, e.x, e.y) > (SEED_R + e.r) * (SEED_R + e.r)) continue
        state.orbitLock.set(e.uid, 0.45)
        ctx.render.fx.puff(sx, sy, '#f2ecd8', 8)
        zap(world, e, dmg, ctx, '#f2ecd8', p.x, p.y)
      }
    }
  }

  for (let i = state.clouds.length - 1; i >= 0; i--) {
    const c = state.clouds[i]
    if (!c) continue
    c.life -= dt
    c.acc += dt
    if (c.life <= 0) {
      state.clouds.splice(i, 1)
      continue
    }
    if (c.acc < 0.5) continue
    c.acc -= 0.5
    for (const e of world.enemies) {
      if (!live(e)) continue
      if (dist2(c.x, c.y, e.x, e.y) > (c.r + e.r) * (c.r + e.r)) continue
      e.slow = Math.max(e.slow, 0.6)
      state.inProc = true
      hurt(world, e, Math.max(1, Math.round(c.dps * 0.5)), ctx, { burnTick: true, explode: false, color: SPORE_COLOR })
      state.inProc = false
    }
  }
}

// ---------------------------------------------------------------------------
// Paint (world space, camera already applied)
// ---------------------------------------------------------------------------

/** Under actors: spore clouds and the frenzy ring at the feet. */
export function drawItemFxFloor(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.time
  for (const c of state.clouds) {
    const fade = clamp(c.life / 0.6, 0, 1) * clamp((3 - c.life) / 0.25, 0, 1)
    ctx.save()
    for (let k = 0; k < 4; k++) {
      const a = t * 0.7 + k * 1.7
      ctx.globalAlpha = 0.16 * fade
      ctx.fillStyle = SPORE_COLOR
      ctx.beginPath()
      ctx.ellipse(c.x + Math.cos(a) * c.r * 0.3, c.y + Math.sin(a) * c.r * 0.2, c.r * 0.75, c.r * 0.5, a * 0.3, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 0.5 * fade
    ctx.fillStyle = '#e8f2a8'
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + t * 1.3
      const rr = c.r * (0.25 + ((k * 0.37 + t * 0.4) % 0.6))
      ctx.beginPath()
      ctx.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * 0.6 - ((t * 14 + k * 7) % 18), 1.8, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
  const p = world.player
  if (state.frenzy > 0 && p.hp > 0) {
    const k = state.frenzy / 10
    ctx.save()
    ctx.globalAlpha = (0.12 + k * 0.3) * clamp(state.frenzyT / 0.5, 0, 1)
    ctx.strokeStyle = FRENZY_COLOR
    ctx.lineWidth = 1.5 + k * 2.5
    const r = 24 + Math.sin(t * 18) * 2
    ctx.beginPath()
    ctx.ellipse(p.x, p.y + 12, r, r * 0.42, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }
}

/** Over actors: thistle seeds and the guard. */
export function drawItemFxTop(ctx: CanvasRenderingContext2D, world: World): void {
  const p = world.player
  if (p.hp <= 0) return
  const t = world.time
  const seeds = seedCount(world)
  for (let i = 0; i < seeds; i++) {
    const a = state.orbitA + (i / seeds) * TAU
    const sx = p.x + Math.cos(a) * ORBIT_R
    const sy = p.y + Math.sin(a) * ORBIT_R * 0.8
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(a * 2)
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = '#f6f0dc'
    ctx.lineWidth = 1.2
    for (let k = 0; k < 7; k++) {
      const fa = (k / 7) * TAU
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(fa) * SEED_R, Math.sin(fa) * SEED_R)
      ctx.stroke()
    }
    ctx.fillStyle = '#5a3a24'
    ctx.beginPath()
    ctx.ellipse(0, 0, 3, 2.2, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
  if (state.guardUp || state.guardPop > 0) {
    const pop = state.guardPop
    const r = 28 + pop * 18
    ctx.save()
    ctx.globalAlpha = state.guardUp ? 0.55 + Math.sin(t * 4) * 0.12 : pop * 0.7
    ctx.strokeStyle = GUARD_COLOR
    ctx.lineWidth = 2.4
    ctx.setLineDash([7, 5])
    ctx.lineDashOffset = -t * 20
    ctx.beginPath()
    ctx.ellipse(p.x, p.y - 4, r, r * 1.08, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }
}
