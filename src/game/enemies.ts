import { clamp, damp, dist, dist2, uid } from '../core/math.ts'
import type {
  Enemy,
  EnemyKind,
  Form,
  ProjectileDef,
  World,
} from '../core/types.ts'
import { ENEMIES } from '../data/enemies.ts'
import { enemyDamageAtWave, enemyHpAtWave } from '../data/waves.ts'
import { damagePlayer, dealDamageToEnemy } from './combat.ts'
import { dropFromEnemy, enemyMaterialValue } from './pickups.ts'
import { createAnim, tickFaceAnim } from './player.ts'
import { spawnProjectile } from './projectiles.ts'
import { clampToArena } from './world.ts'
import type { SimCtx } from './world.ts'

export const MAX_ENEMIES = 160
const SPAWN_TIME = 0.35
const DEATH_TIME = 0.45
const CONTACT_IFRAMES = 0.5

interface EnemyExtra {
  burnAcc: number
  parentUid: number | null
  spiralAng: number
  chargeLeft: number
  blinkWait: number
  surgeT: number
  screamBurst: boolean
}

const extras = new WeakMap<Enemy, EnemyExtra>()
const byUid = new Map<number, Enemy>()
let announcedNightmare = false

function extra(e: Enemy): EnemyExtra {
  let x = extras.get(e)
  if (!x) {
    x = { burnAcc: 0, parentUid: null, spiralAng: 0, chargeLeft: 0, blinkWait: 4, surgeT: 0, screamBurst: false }
    extras.set(e, x)
  }
  return x
}

export function resetEnemyRuntime(): void {
  byUid.clear()
  announcedNightmare = false
}

function screamIntervalOf(def: Enemy['def'], ctx: SimCtx): number {
  if (def.screamInterval && def.screamInterval > 0) return def.screamInterval
  if (def.rank === 'boss') return 4
  if (def.rank === 'elite') return 5
  return ctx.rng.range(7, 10)
}

function nightmareChance(world: World): number {
  const base = world.waveDef.nightmareChance ?? 0
  const bonus = world.player.form === 'nightmare' ? 0.15 : 0
  return clamp(base + bonus, 0, 0.9)
}

export function spawnEnemy(
  world: World,
  kind: EnemyKind,
  x: number,
  y: number,
  ctx: SimCtx,
  asElite = false,
  parent?: Enemy,
  fromMarker = false,
): Enemy | null {
  if (world.enemies.length >= MAX_ENEMIES) return null
  const def = ENEMIES[kind]
  if (!def) return null
  let hp = enemyHpAtWave(def, world.wave)
  let damage = enemyDamageAtWave(def, world.wave)
  let r = def.radius
  let speed = def.speed
  const elite = def.rank === 'elite' || asElite
  const boss = def.rank === 'boss'
  if (asElite && def.rank === 'basic') {
    hp *= 15
    damage *= 2
    r *= 1.6
  }
  let form: Form = def.rank === 'basic' && def.form !== 'nightmare' ? 'normal' : 'nightmare'
  if (def.rank === 'basic' && form === 'normal' && ctx.rng.chance(nightmareChance(world))) {
    form = 'nightmare'
  }
  if (form === 'nightmare') {
    hp *= 1.8
    damage *= 1.5
    speed *= 1.15
  }
  const interval = screamIntervalOf(def, ctx)
  const screamCooldown = form === 'nightmare' ? ctx.rng.range(1.5, 4) : interval
  const pos = clampToArena(world, x, y, r)
  const enemy: Enemy = {
    uid: uid(),
    kind,
    def,
    form,
    screamCooldown,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    r,
    hp,
    maxHp: hp,
    damage,
    speed,
    state: 'spawning',
    stateT: 0,
    cooldown: ctx.rng.range(0.1, 0.4),
    knock: { x: 0, y: 0 },
    burn: 0,
    burnDps: 0,
    slow: 0,
    anim: createAnim(0),
    elite,
    boss,
    phaseIndex: 0,
    aim: { x: 1, y: 0 },
    children: 0,
  }
  extras.set(enemy, {
    burnAcc: 0,
    parentUid: parent ? parent.uid : null,
    spiralAng: ctx.rng.range(0, Math.PI * 2),
    chargeLeft: 0,
    blinkWait: ctx.rng.range(3, 6),
    surgeT: 0,
    screamBurst: false,
  })
  if (boss) enemy.cooldown = 1.15
  world.enemies.push(enemy)
  byUid.set(enemy.uid, enemy)
  if (boss) world.boss = enemy
  if (parent) parent.children += 1
  ctx.render.fx.inkBloom(pos.x, pos.y, def.palette.body, r * 1.4)
  ctx.audio.play('spawn', { gain: boss ? 1 : 0.55, pitch: boss ? 0.7 : 1 })
  if (
    fromMarker &&
    form === 'nightmare' &&
    def.rank === 'basic' &&
    !elite &&
    !announcedNightmare
  ) {
    announcedNightmare = true
    ctx.ui.toast('Something came up wrong.')
    ctx.audio.play('mudRise')
  }
  return enemy
}

export function beginDeath(world: World, enemy: Enemy, ctx: SimCtx, magnet = false): void {
  if (enemy.state === 'dying') return
  enemy.state = 'dying'
  enemy.stateT = 0
  enemy.hp = 0
  enemy.anim.deathT = 0
  world.player.kills += 1
  const ex = extra(enemy)
  if (ex.parentUid !== null) {
    const parent = byUid.get(ex.parentUid)
    if (parent) parent.children = Math.max(0, parent.children - 1)
  }
  const matsRaw = enemyMaterialValue(world, enemy.def, ctx)
  const mats = enemy.form === 'nightmare' ? Math.max(1, Math.round(matsRaw * 1.5)) : matsRaw
  dropFromEnemy(world, enemy.x, enemy.y, mats, enemy.elite && !enemy.boss, ctx, magnet)
  ctx.render.fx.splat(enemy.x, enemy.y, enemy.def.palette.body, enemy.r * 1.6, enemy.boss ? 18 : 8)
  ctx.render.fx.puff(enemy.x, enemy.y, enemy.def.palette.shade, enemy.r)
  if (enemy.form === 'nightmare') ctx.audio.play('mudSquelch')
  if (enemy.boss) {
    ctx.render.fx.shockwave(enemy.x, enemy.y, 140, enemy.def.palette.accent)
    ctx.audio.play('bossDie')
    world.camera.shake = Math.min(28, world.camera.shake + 16)
  } else {
    ctx.audio.play('enemyDie', { gain: enemy.elite ? 1 : 0.7 })
    if (enemy.elite) world.camera.shake = Math.min(20, world.camera.shake + 6)
  }
}

function steerToward(e: Enemy, tx: number, ty: number, spd: number): void {
  const ang = Math.atan2(ty - e.y, tx - e.x)
  e.vx = Math.cos(ang) * spd
  e.vy = Math.sin(ang) * spd
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
}

function currentSpeed(e: Enemy): number {
  const surge = extra(e).surgeT > 0 ? 1.6 : 1
  return e.speed * (e.slow > 0 ? 0.45 : 1) * surge
}

function fireAtPlayer(world: World, e: Enemy, proj: ProjectileDef, ctx: SimCtx): void {
  const p = world.player
  const ang = Math.atan2(p.y - e.y, p.x - e.x)
  const muzzle = e.r + 6
  spawnProjectile(world, {
    x: e.x + Math.cos(ang) * muzzle,
    y: e.y + Math.sin(ang) * muzzle,
    angle: ang,
    damage: e.damage,
    crit: false,
    def: proj,
    owner: 'enemy',
    effects: [],
    knockback: 4,
    weaponUid: 0,
  })
  ctx.render.fx.hitSpark(e.x + Math.cos(ang) * muzzle, e.y + Math.sin(ang) * muzzle, ang, e.def.palette.accent)
  ctx.audio.play('shoot', { pitch: 0.85, gain: 0.55 })
}

function fireRing(world: World, e: Enemy, proj: ProjectileDef, ctx: SimCtx, count: number): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2
    spawnProjectile(world, {
      x: e.x + Math.cos(ang) * (e.r + 8),
      y: e.y + Math.sin(ang) * (e.r + 8),
      angle: ang,
      damage: e.damage,
      crit: false,
      def: proj,
      owner: 'enemy',
      effects: [],
      knockback: 3,
      weaponUid: 0,
    })
  }
  ctx.render.fx.shockwave(e.x, e.y, e.r + 30, e.def.palette.accent)
  ctx.audio.play('shoot', { pitch: 0.6, gain: 0.9 })
}

function fireSpiral(world: World, e: Enemy, proj: ProjectileDef, ctx: SimCtx): void {
  const ex = extra(e)
  ex.spiralAng += 0.46
  const ang = ex.spiralAng
  spawnProjectile(world, {
    x: e.x + Math.cos(ang) * (e.r + 8),
    y: e.y + Math.sin(ang) * (e.r + 8),
    angle: ang,
    damage: e.damage,
    crit: false,
    def: proj,
    owner: 'enemy',
    effects: [],
    knockback: 3,
    weaponUid: 0,
  })
  ctx.audio.play('shoot', { pitch: 1.1, gain: 0.4 })
}

function beginCharge(e: Enemy, world: World, ctx: SimCtx, windup: number): void {
  e.state = 'windup'
  e.stateT = windup
  const ang = Math.atan2(world.player.y - e.y, world.player.x - e.x)
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
  e.vx = 0
  e.vy = 0
  ctx.audio.play('charge', { gain: e.boss ? 1 : 0.7 })
}

function tickCharge(
  _world: World,
  e: Enemy,
  dt: number,
  ctx: SimCtx,
  speedMult: number,
  cooldown: number,
): void {
  const ex = extra(e)
  if (e.state === 'windup') {
    e.stateT -= dt
    e.anim.kick.x = (ctx.rng.next() - 0.5) * 8
    e.anim.kick.y = (ctx.rng.next() - 0.5) * 8
    if (e.stateT <= 0) {
      e.state = 'charging'
      ex.chargeLeft = 0.48 + (e.boss ? 0.18 : 0)
      e.anim.kick.x = 0
      e.anim.kick.y = 0
    }
    return
  }
  if (e.state === 'charging') {
    const spd = currentSpeed(e) * speedMult
    e.vx = e.aim.x * spd
    e.vy = e.aim.y * spd
    ex.chargeLeft -= dt
    if (ex.chargeLeft <= 0) {
      e.state = 'recover'
      e.stateT = cooldown * 0.45
      e.vx *= 0.2
      e.vy *= 0.2
    }
    return
  }
  if (e.state === 'recover') {
    e.stateT -= dt
    e.vx = damp(e.vx, 0, 6, dt)
    e.vy = damp(e.vy, 0, 6, dt)
    if (e.stateT <= 0) {
      e.state = 'idle'
      e.cooldown = cooldown
    }
  }
}

function updateBoss(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const b = e.def.behavior
  if (b.type !== 'boss') return
  const frac = e.maxHp > 0 ? e.hp / e.maxHp : 0
  let idx = b.phases.length - 1
  for (let i = 0; i < b.phases.length; i++) {
    const phase = b.phases[i]
    if (phase && frac > phase.until) {
      idx = i
      break
    }
  }
  if (idx !== e.phaseIndex) {
    e.phaseIndex = idx
    e.cooldown = 0.35
    ctx.render.fx.inkBloom(e.x, e.y, e.def.palette.accent, e.r * 1.8)
  }
  const phase = b.phases[e.phaseIndex]
  if (!phase) return

  if (e.state === 'windup' || e.state === 'charging' || e.state === 'recover') {
    tickCharge(world, e, dt, ctx, 2.6, phase.interval)
    return
  }

  steerToward(e, world.player.x, world.player.y, currentSpeed(e) * (phase.pattern === 'chase' ? 1 : 0.72))
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = phase.interval
  fireBossPattern(world, e, ctx)
}

function fireBossPattern(world: World, e: Enemy, ctx: SimCtx): void {
  const b = e.def.behavior
  if (b.type !== 'boss') return
  const phase = b.phases[e.phaseIndex]
  if (!phase) return
  if (phase.pattern === 'ring' && b.projectile) {
    fireRing(world, e, b.projectile, ctx, 14)
  } else if (phase.pattern === 'spiral' && b.projectile) {
    e.cooldown = Math.max(0.12, phase.interval * 0.08)
    fireSpiral(world, e, b.projectile, ctx)
  } else if (phase.pattern === 'charge') {
    beginCharge(e, world, ctx, 0.62)
  } else if (phase.pattern === 'summon' && b.summon) {
    const n = e.boss && world.wave >= 20 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const a = ctx.rng.range(0, Math.PI * 2)
      spawnEnemy(world, b.summon, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, ctx, false, e)
    }
    ctx.render.fx.shockwave(e.x, e.y, 70, e.def.palette.shade)
  } else {
    steerToward(e, world.player.x, world.player.y, currentSpeed(e))
  }
}

function updateBehavior(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const b = e.def.behavior
  const p = world.player
  const spd = currentSpeed(e)

  if (b.type === 'chase') {
    steerToward(e, p.x, p.y, spd)
    e.state = 'chase'
    return
  }
  if (b.type === 'wander') {
    e.stateT -= dt
    if (e.stateT <= 0) {
      if (ctx.rng.chance(0.4)) {
        e.state = 'chase'
        e.stateT = ctx.rng.range(0.5, 1.4)
      } else {
        e.state = 'idle'
        const a = ctx.rng.range(0, Math.PI * 2)
        e.aim.x = Math.cos(a)
        e.aim.y = Math.sin(a)
        e.stateT = ctx.rng.range(0.7, 1.8)
      }
    }
    if (e.state === 'chase') steerToward(e, p.x, p.y, spd)
    else {
      e.vx = e.aim.x * spd * b.drift
      e.vy = e.aim.y * spd * b.drift
    }
    return
  }
  if (b.type === 'charge') {
    if (e.state === 'windup' || e.state === 'charging' || e.state === 'recover') {
      tickCharge(world, e, dt, ctx, b.speedMult, b.cooldown)
      return
    }
    e.cooldown -= dt
    const d = dist(e.x, e.y, p.x, p.y)
    if (e.cooldown <= 0 && d < b.range) beginCharge(e, world, ctx, b.windup)
    else steerToward(e, p.x, p.y, spd)
    return
  }
  if (b.type === 'shoot') {
    const d = dist(e.x, e.y, p.x, p.y)
    if (d < b.keepDistance * 0.82) {
      const ang = Math.atan2(e.y - p.y, e.x - p.x)
      e.vx = Math.cos(ang) * spd
      e.vy = Math.sin(ang) * spd
    } else if (d > b.range * 0.92) {
      steerToward(e, p.x, p.y, spd)
    } else {
      const side = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2
      e.vx = Math.cos(side) * spd * 0.55
      e.vy = Math.sin(side) * spd * 0.55
    }
    e.cooldown -= dt
    if (e.cooldown <= 0 && d < b.range * 1.05) {
      e.cooldown = b.cooldown
      e.state = 'shooting'
      fireAtPlayer(world, e, b.projectile, ctx)
    }
    return
  }
  if (b.type === 'spawner') {
    steerToward(e, p.x, p.y, spd * 0.55)
    e.cooldown -= dt
    if (e.cooldown <= 0 && e.children < b.max) {
      e.cooldown = b.interval
      const a = ctx.rng.range(0, Math.PI * 2)
      spawnEnemy(world, b.child, e.x + Math.cos(a) * (e.r + 18), e.y + Math.sin(a) * (e.r + 18), ctx, false, e)
    }
    return
  }
  if (b.type === 'boss') updateBoss(world, e, dt, ctx)
}

function separate(world: World): void {
  const list = world.enemies
  const n = list.length
  for (let i = 0; i < n; i++) {
    const a = list[i]
    if (!a || a.state === 'dying' || a.state === 'spawning') continue
    for (let j = i + 1; j < n; j++) {
      const b = list[j]
      if (!b || b.state === 'dying' || b.state === 'spawning') continue
      const dx = a.x - b.x
      if (dx > 46 || dx < -46) continue
      const dy = a.y - b.y
      if (dy > 46 || dy < -46) continue
      const min = (a.r + b.r) * 0.82
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min || d2 < 0.01) continue
      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      const push = (min - d) * 0.46
      a.x += nx * push
      a.y += ny * push
      b.x -= nx * push
      b.y -= ny * push
    }
  }
}

const SCREAM_WINDUP = 0.35
const SCREAM_HOLD = 0.8
const SCREAM_TOTAL = SCREAM_WINDUP + SCREAM_HOLD

function canScream(e: Enemy): boolean {
  if (e.form !== 'nightmare') return false
  if (e.state === 'spawning' || e.state === 'dying' || e.state === 'charging' || e.state === 'windup') return false
  return true
}

function startScream(e: Enemy): void {
  e.state = 'screaming'
  e.stateT = 0
  e.vx = 0
  e.vy = 0
  e.anim.scream = 0
  e.anim.mouth = 0.35
  extra(e).screamBurst = false
}

function fireScreamBurst(world: World, e: Enemy, ctx: SimCtx): void {
  const glow = e.def.palette.glow ?? '#d9ff5c'
  ctx.render.fx.shockwave(e.x, e.y, 80 + e.r, glow)
  if (dist(e.x, e.y, world.player.x, world.player.y) <= 400) {
    world.camera.shake = Math.min(26, world.camera.shake + (e.boss ? 12 : 6))
  }
  ctx.audio.play(e.boss ? 'screamBig' : 'scream')
}

function poseScream(e: Enemy, ctx: SimCtx): void {
  const t = e.stateT
  if (t < SCREAM_WINDUP) {
    const u = t / SCREAM_WINDUP
    e.anim.scream = u * 0.3
    e.anim.mouth = 0.35 + u * 0.45
    e.anim.kick.x = (ctx.rng.next() - 0.5) * 6
    e.anim.kick.y = (ctx.rng.next() - 0.5) * 6
  } else {
    const u = Math.min(1, (t - SCREAM_WINDUP) / SCREAM_HOLD)
    e.anim.scream = 0.3 + u * 0.7
    e.anim.mouth = 1
    e.anim.kick.x = 0
    e.anim.kick.y = 0
  }
}

function tickScream(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  e.stateT += dt
  e.vx = 0
  e.vy = 0
  if (e.stateT >= SCREAM_WINDUP && !extra(e).screamBurst) {
    extra(e).screamBurst = true
    fireScreamBurst(world, e, ctx)
  }
  poseScream(e, ctx)
  if (e.stateT >= SCREAM_TOTAL) finishScream(world, e, ctx)
}

function finishScream(world: World, e: Enemy, ctx: SimCtx): void {
  e.state = 'idle'
  e.anim.scream = -1
  e.anim.squash = 1.12
  e.anim.kick.x = 0
  e.anim.kick.y = 0
  const interval = screamIntervalOf(e.def, ctx)
  e.screamCooldown = e.def.rank === 'basic' ? Math.max(4, interval * 0.7) : interval
  if (e.def.rank === 'basic') extra(e).surgeT = 2
  if (e.kind === 'hive' || e.def.species === 'cabbage') {
    for (let i = 0; i < 2; i++) {
      const a = ctx.rng.range(0, Math.PI * 2)
      spawnEnemy(world, 'blob', e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20), ctx, false, e)
    }
  }
  if (e.boss) {
    const p = world.player
    const dx = e.x - p.x
    const dy = e.y - p.y
    const d = Math.hypot(dx, dy) || 1
    const pull = Math.min(60, d)
    p.x += (dx / d) * pull
    p.y += (dy / d) * pull
    const c = clampToArena(world, p.x, p.y, p.r)
    p.x = c.x
    p.y = c.y
    fireBossPattern(world, e, ctx)
  }
}

export function nightmaresAlive(world: World): number {
  let n = 0
  for (const e of world.enemies) {
    if (e.form === 'nightmare' && e.state !== 'dying') n += 1
  }
  return n
}

export function updateEnemies(world: World, dt: number, ctx: SimCtx): void {
  const player = world.player
  const keep: Enemy[] = []

  for (const e of world.enemies) {
    e.anim.t += dt
    e.anim.hitFlash = Math.max(0, e.anim.hitFlash - dt * 4)
    if (e.state !== 'screaming') e.anim.squash = damp(e.anim.squash, 1, 10, dt)
    e.knock.x = damp(e.knock.x, 0, 7, dt)
    e.knock.y = damp(e.knock.y, 0, 7, dt)
    const ex = extra(e)
    if (ex.surgeT > 0) ex.surgeT = Math.max(0, ex.surgeT - dt)

    if (e.hp <= 0 && e.state !== 'dying') beginDeath(world, e, ctx)

    if (e.state === 'dying') {
      e.stateT += dt
      e.anim.deathT = Math.min(1, e.stateT / DEATH_TIME)
      e.vx = damp(e.vx, 0, 8, dt)
      e.vy = damp(e.vy, 0, 8, dt)
      e.x += (e.vx + e.knock.x) * dt
      e.y += (e.vy + e.knock.y) * dt
      if (e.anim.deathT < 1) keep.push(e)
      else byUid.delete(e.uid)
      continue
    }

    if (e.state === 'spawning') {
      e.stateT += dt
      e.anim.spawnT = Math.min(1, e.stateT / SPAWN_TIME)
      if (e.stateT >= SPAWN_TIME) {
        e.state = 'idle'
        e.anim.spawnT = 1
      }
      tickFaceAnim(e.anim, dt, ex, {
        moving: false,
        speed: 0,
        form: e.form,
        screaming: false,
        screamProgress: 0,
        flinchT: 0,
        nextBlink: () => ctx.rng.range(3, 6),
      })
      keep.push(e)
      continue
    }

    if (e.slow > 0) e.slow = Math.max(0, e.slow - dt)
    if (e.burn > 0) {
      e.burn -= dt
      ex.burnAcc += dt
      if (ex.burnAcc >= 0.5) {
        ex.burnAcc -= 0.5
        const tick = Math.max(1, Math.round(e.burnDps * 0.5))
        dealDamageToEnemy(world, e, tick, ctx, { burnTick: true, explode: false })
      }
      if (e.hp <= 0) {
        beginDeath(world, e, ctx)
        keep.push(e)
        continue
      }
    }

    if (e.state === 'screaming') {
      tickScream(world, e, dt, ctx)
    } else if (canScream(e)) {
      e.screamCooldown -= dt
      if (e.screamCooldown <= 0) startScream(e)
    }

    if (e.state === 'screaming') {
      e.vx = 0
      e.vy = 0
    } else {
      updateBehavior(world, e, dt, ctx)
    }
    e.x += (e.vx + e.knock.x) * dt
    e.y += (e.vy + e.knock.y) * dt
    const c = clampToArena(world, e.x, e.y, e.r)
    e.x = c.x
    e.y = c.y
    e.anim.moving = Math.hypot(e.vx, e.vy) > 8
    e.anim.bob = e.anim.moving ? Math.sin(e.anim.t * 10) * 2.2 : Math.sin(e.anim.t * 2) * 1.1
    e.anim.facing = e.vx >= 0 ? 1 : -1
    tickFaceAnim(e.anim, dt, ex, {
      moving: e.anim.moving,
      speed: Math.hypot(e.vx, e.vy),
      form: e.form,
      screaming: e.state === 'screaming',
      screamProgress: e.state === 'screaming' ? Math.min(1, Math.max(0, e.anim.scream)) : 0,
      flinchT: 0,
      nextBlink: () => ctx.rng.range(3, 6),
    })
    if (e.state === 'screaming') poseScream(e, ctx)

    if (player.hp > 0 && player.invuln <= 0) {
      const rad = e.r + player.r
      if (dist2(e.x, e.y, player.x, player.y) <= rad * rad) {
        damagePlayer(world, e.damage, ctx, e.form === 'nightmare' ? e.def.nightmareName : e.def.name, e)
        player.invuln = Math.max(player.invuln, CONTACT_IFRAMES)
      }
    }

    keep.push(e)
  }

  const kept = new Set(keep.map((e) => e.uid))
  for (const e of world.enemies) {
    if (!kept.has(e.uid)) keep.push(e)
  }
  world.enemies = keep
  separate(world)

  world.boss = null
  for (const e of world.enemies) {
    if (e.boss) {
      world.boss = e
      break
    }
  }
}