import { clamp, damp, dist, dist2, uid } from '../core/math.ts'
import type {
  Enemy,
  EnemyKind,
  Form,
  ProjectileDef,
  World,
} from '../core/types.ts'
import { ENEMIES, corpseClipFor, enemyFamily, variantTone } from '../data/enemies.ts'
import { enemyDamageAtWave, enemyHpAtWave } from '../data/waves.ts'
import { damagePlayer, dealDamageToEnemy } from './combat.ts'
import { dropFromEnemy, enemyMaterialValue } from './pickups.ts'
import { farmHpMult, farmNightmareBonus } from './farm.ts'
import { createAnim, tickFaceAnim } from './player.ts'
import { spawnProjectile } from './projectiles.ts'
import { addTrauma, FEEL, requestHitStop } from '../feel.ts'
import { CHAOS, chaosJuiceOn, maxEnemies, walkPlaybackRate } from '../data/chaos.ts'
import {
  chainBurst,
  comboPitch,
  corpseClipName,
  deathClipName,
  funnyBurstClip,
  funnySplatClip,
  markKamikazeCorpse,
} from './chaosJuice.ts'
import { beginEmerge, collisionOn, emergeEvents, tickEmerge } from './emerge.ts'
import { isAirborne, isLeaping, leapEvents, maybeLeap } from './leap.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import {
  actorClipActive,
  actorClipDone,
  actorClipFraction,
  advanceActorSheet,
  clearHurtState,
  clipHasEvent,
  consumeHurtKick,
  forgetActor,
  presentActorClip,
  restartActorClip,
  sheetClipSeconds,
  type LoadedSheet,
} from '../render/sheets.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { retainSpawned } from './roster.ts'
import { clampToArena } from './world.ts'
import type { SimCtx } from './world.ts'

export { maxEnemies }
const DEATH_TIME = 0.45
const DEATH_FADE = 0.4
const CONTACT_IFRAMES = 0.5
const SEE_RANGE = 260

interface EnemyExtra {
  burnAcc: number
  parentUid: number | null
  spiralAng: number
  chargeLeft: number
  blinkWait: number
  surgeT: number
  screamBurst: boolean
  /** The attack clip's release/hit has already fired this swing. */
  attackFired: boolean
  footAcc: number
  kamikazePopped: boolean
  authoredScream: boolean
  lungeAfterScream: boolean
  sawHero: boolean
  tauntCd: number
  /** The emerge clip has been started. AI stays off until its `emerged` event. */
  emerge: boolean
}

const extras = new WeakMap<Enemy, EnemyExtra>()
const byUid = new Map<number, Enemy>()
let announcedNightmare = false

function extra(e: Enemy): EnemyExtra {
  let x = extras.get(e)
  if (!x) {
    x = {
      burnAcc: 0,
      parentUid: null,
      spiralAng: 0,
      chargeLeft: 0,
      blinkWait: 4,
      surgeT: 0,
      screamBurst: false,
      attackFired: false,
      footAcc: 0,
      kamikazePopped: false,
      authoredScream: false,
      lungeAfterScream: false,
      sawHero: false,
      tauntCd: 3,
      emerge: false,
    }
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
  return clamp((world.waveDef.nightmareChance ?? 0) + farmNightmareBonus(world.farm), 0, 0.92)
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
  if (world.enemies.length >= maxEnemies()) return null
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
  hp = Math.max(1, Math.round(hp * farmHpMult(world.farm)))
  let form: Form = def.rank === 'basic' && def.form !== 'nightmare' ? 'normal' : 'nightmare'
  // Light and mud are the sheet variants. A second nightmare form would ask for a sheet that is not there.
  if (!variantTone(kind) && def.rank === 'basic' && form === 'normal' && ctx.rng.chance(nightmareChance(world))) {
    form = 'nightmare'
  }
  if (form === 'nightmare') {
    hp *= 1.8
    damage *= 1.5
    speed *= 1.15
    if (kind === 'tomato') r = Math.round(r * (17 / 14))
    if (kind === 'bean') r = Math.round(r * (19 / 17))
  }
  const interval = screamIntervalOf(def, ctx)
  const screamCooldown = form === 'nightmare' ? ctx.rng.range(0.7, 2.1) : interval
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
    sliced: false,
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
    attackFired: false,
    footAcc: 0,
    kamikazePopped: false,
    authoredScream: false,
    lungeAfterScream: false,
    sawHero: false,
    tauntCd: 3,
    emerge: false,
  })
  if (boss) enemy.cooldown = 1.15
  world.enemies.push(enemy)
  byUid.set(enemy.uid, enemy)
  if (boss) world.boss = enemy
  if (parent) parent.children += 1
  ctx.render.fx.inkBloom(pos.x, pos.y, def.palette.body, r * 1.4)
  ctx.audio.play('spawn', { gain: boss ? 1 : 0.55, pitch: boss ? 0.7 : 1 })
  beginEmerge(enemy)
  if (boss) {
    ctx.render.fx.shockwave(pos.x, pos.y, 160, def.palette.accent)
    ctx.render.fx.inkBurst(pos.x, pos.y, r * 2.2)
    addTrauma(world, FEEL.shake.bossEnter, 0, 1)
  }
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
  enemy.anim.hitFlash = 0
  const playKey = enemyKey(enemy)
  clearHurtState(playKey)
  world.player.kills += 1
  const ex = extra(enemy)
  if (ex.parentUid !== null) {
    const parent = byUid.get(ex.parentUid)
    if (parent) parent.children = Math.max(0, parent.children - 1)
  }
  const matsRaw = enemyMaterialValue(world, enemy.def, ctx)
  const mats = enemy.form === 'nightmare' ? Math.max(1, Math.round(matsRaw * 1.5)) : matsRaw
  dropFromEnemy(world, enemy.x, enemy.y, mats, enemy.elite && !enemy.boss, ctx, magnet, enemy)
  enemy.anim.squash = 0.35
  const pal = enemy.def.palette
  const deathSheet = enemySheet(enemy)
  const kamikazeKeep = ex.kamikazePopped
  if (kamikazeKeep) {
    enemy.corpse = 'attack'
  } else {
    const wanted = enemy.corpse && deathSheet?.manifest.clips[enemy.corpse] ? enemy.corpse : deathClipName(enemy) ?? corpseClipFor(undefined)
    enemy.corpse = deathSheet?.manifest.clips[wanted] ? wanted : 'death'
    if (deathSheet?.manifest.clips[enemy.corpse]) restartActorClip(playKey, enemy.corpse)
  }
  const authoredDeath = kamikazeKeep || !!deathSheet?.manifest.clips[enemy.corpse ?? '']
  const authoredBurst =
    kamikazeKeep || (!!deathSheet && authoredDeath && enemy.corpse && clipHasEvent(deathSheet, enemy.corpse, 'spawnFx'))
  if (!authoredBurst) ctx.render.fx.inkBurst(enemy.x, enemy.y, enemy.r * FEEL.kill.inkSize)
  // Painted death and the ink burst are the corpse. A body-colored splat or a
  // cream chunk highlight would sit on the soil after the clip as a white fill.
  if (!authoredDeath) {
    ctx.render.fx.chunks(
      enemy.x,
      enemy.y,
      { body: pal.body, shade: pal.shade, accent: pal.accent },
      enemy.r * FEEL.kill.chunkScale,
      true,
    )
    ctx.render.fx.splat(enemy.x, enemy.y, pal.body, enemy.r * 1.55, enemy.boss ? 16 : 9)
    ctx.render.fx.puff(enemy.x, enemy.y, pal.shade, enemy.r * 1.1)
  }
  if (enemy.form === 'nightmare') ctx.audio.play('mudSquelch')
  const dx = enemy.x - world.player.x
  const dy = enemy.y - world.player.y
  if (enemy.boss) {
    ctx.render.fx.shockwave(enemy.x, enemy.y, 140, pal.accent)
    ctx.audio.play('bossDie')
    addTrauma(world, FEEL.shake.bossKill, dx, dy)
    requestHitStop('bossKill')
  } else {
    ctx.audio.play('enemyDie', { gain: enemy.elite ? 1 : 0.7, pitch: comboPitch() })
    if (!chaosJuiceOn()) {
      addTrauma(world, enemy.elite ? FEEL.shake.eliteKill : FEEL.shake.kill, dx, dy)
      requestHitStop(enemy.elite ? 'eliteKill' : 'kill')
    }
  }
}

/** Spawn clip finished (or the old timed pop, when the sheet has no emerge). */
function leaveSpawn(world: World, e: Enemy, ctx: SimCtx): void {
  e.state = 'idle'
  e.anim.spawnT = 1
  if (e.kind === 'tomato' || e.kind === 'bean') return
  const tone = variantTone(e.kind)
  if (tone === 'mud') {
    // charger-mud's attack clip already screams. A scream clip in front of it
    // would play the mouth twice.
    if (enemyFamily(e.kind) !== 'charger') beginPerform(e, 'scream')
    if (dist(e.x, e.y, world.player.x, world.player.y) < SEE_RANGE) extra(e).sawHero = true
  } else if (tone === 'light') {
    extra(e).tauntCd = ctx.rng.range(2.4, 4.8)
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

function enemyKey(e: Enemy): string {
  return `e:${e.uid}`
}

function enemySheet(e: Enemy): LoadedSheet | null {
  return resolveEnemySheet(e.kind, e.form)
}

function fireAtPlayer(world: World, e: Enemy, proj: ProjectileDef, ctx: SimCtx, silent = false): void {
  const p = world.player
  const ang = Math.atan2(p.y - e.y, p.x - e.x)
  const muzzle = e.r + 6
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
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
  if (!silent) {
    ctx.render.fx.muzzleFlash(e.x + Math.cos(ang) * muzzle, e.y + Math.sin(ang) * muzzle, ang, e.def.palette.accent)
  }
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
  const sheet = enemySheet(e)
  if (sheet?.manifest.clips.attack) {
    extra(e).attackFired = false
    restartActorClip(enemyKey(e), 'attack')
  }
  ctx.audio.play('charge', { gain: e.boss ? 1 : 0.7 })
}

function startDash(e: Enemy): void {
  if (e.state !== 'windup') return
  e.state = 'charging'
  extra(e).chargeLeft = 0.48 + (e.boss ? 0.18 : 0)
  e.anim.kick.x = 0
  e.anim.kick.y = 0
  const b = e.def.behavior
  const mult = b.type === 'charge' ? b.speedMult : e.boss ? 2.6 : 3
  const spd = currentSpeed(e) * mult
  e.vx = e.aim.x * spd
  e.vy = e.aim.y * spd
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
  const sheeted = !!enemySheet(e)?.manifest.clips.attack
  if (e.state === 'windup') {
    e.vx = 0
    e.vy = 0
    if (sheeted) {
      // The attack clip is the telegraph. The dash starts on its release frame.
      e.anim.kick.x = 0
      e.anim.kick.y = 0
      if (!ex.attackFired && actorClipDone(enemyKey(e), 'attack')) startDash(e)
    } else {
      e.stateT -= dt
      e.anim.kick.x = (ctx.rng.next() - 0.5) * 8
      e.anim.kick.y = (ctx.rng.next() - 0.5) * 8
      if (e.stateT <= 0) startDash(e)
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

const BLOB_REACH = 18
const ELITE_SLAM_RANGE = 220
/** Telegraph plus slam. The v3 clip is 885 ms; the windup holds the last cell out to this. */
const ELITE_SLAM_WINDUP = 0.975
const ELITE_SLAM_GAP = 3.6

function beginAuthoredAttack(e: Enemy): void {
  extra(e).attackFired = false
  restartActorClip(enemyKey(e), 'attack')
}

function popKamikaze(world: World, e: Enemy, ctx: SimCtx): void {
  const ex = extra(e)
  if (ex.kamikazePopped) return
  ex.kamikazePopped = true
  markKamikazeCorpse(e)
  const b = e.def.behavior
  const radius = b.type === 'kamikaze' ? b.radius : (e.def.burst?.radius ?? 70)
  const p = world.player
  if (p.hp > 0 && dist(e.x, e.y, p.x, p.y) <= radius + p.r) {
    damagePlayer(world, e.damage, ctx, e.form === 'nightmare' ? e.def.nightmareName : e.def.name, e)
  }
  spawnFunnyClip(CHAOS.sheets.pop, e.x, e.y, { scale: CHAOS.sheets.popScale })
  chainBurst(world, e, ctx, Math.max(e.damage, 4))
  addTrauma(world, FEEL.shake.kill, e.x - p.x, e.y - p.y)
  beginDeath(world, e, ctx)
}

function updateKamikaze(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const b = e.def.behavior
  if (b.type !== 'kamikaze') return
  const p = world.player
  if (e.state === 'windup') {
    e.vx = 0
    e.vy = 0
    const ang = Math.atan2(p.y - e.y, p.x - e.x)
    e.aim.x = Math.cos(ang)
    e.aim.y = Math.sin(ang)
    if (actorClipDone(enemyKey(e), 'attack') && !extra(e).attackFired) {
      extra(e).attackFired = true
      popKamikaze(world, e, ctx)
    }
    return
  }
  steerToward(e, p.x, p.y, currentSpeed(e))
  e.state = 'chase'
  e.cooldown -= dt
  if (e.cooldown <= 0 && dist(e.x, e.y, p.x, p.y) < b.range) {
    e.cooldown = b.cooldown
    e.vx = 0
    e.vy = 0
    if (enemySheet(e)?.manifest.clips.attack) {
      e.state = 'windup'
      beginAuthoredAttack(e)
    } else {
      popKamikaze(world, e, ctx)
    }
  }
}

function beginAuthoredScream(e: Enemy): void {
  const ex = extra(e)
  e.state = 'screaming'
  e.stateT = 0
  e.vx = 0
  e.vy = 0
  e.anim.scream = 1
  e.anim.mouth = 1
  ex.screamBurst = false
  ex.authoredScream = true
  if (hasClip(enemySheet(e), 'scream')) restartActorClip(enemyKey(e), 'scream')
}

function tickAuthoredScream(e: Enemy): void {
  e.vx = 0
  e.vy = 0
  const sheet = enemySheet(e)
  const done = !hasClip(sheet, 'scream') || actorClipDone(enemyKey(e), 'scream')
  if (!done) return
  const ex = extra(e)
  ex.authoredScream = false
  e.anim.scream = -1
  if (ex.lungeAfterScream) {
    ex.lungeAfterScream = false
    e.state = 'windup'
    e.vx = 0
    e.vy = 0
    beginAuthoredAttack(e)
    return
  }
  e.state = 'idle'
}

function updateTomatoMud(world: World, e: Enemy, dt: number, _ctx: SimCtx): void {
  const p = world.player
  const spd = currentSpeed(e)
  if (e.state === 'windup') {
    e.vx = 0
    e.vy = 0
    const ang = Math.atan2(p.y - e.y, p.x - e.x)
    e.aim.x = Math.cos(ang)
    e.aim.y = Math.sin(ang)
    if (actorClipDone(enemyKey(e), 'attack')) e.state = 'chase'
    return
  }
  steerToward(e, p.x, p.y, spd)
  e.state = 'chase'
  e.cooldown -= dt
  const reach = e.r + p.r + 28
  if (e.cooldown <= 0 && dist(e.x, e.y, p.x, p.y) <= reach + 16) {
    const b = e.def.behavior
    e.cooldown = b.type === 'kamikaze' ? b.cooldown : 1.15
    e.vx = 0
    e.vy = 0
    extra(e).lungeAfterScream = true
    if (hasClip(enemySheet(e), 'scream')) beginAuthoredScream(e)
    else {
      extra(e).lungeAfterScream = false
      e.state = 'windup'
      beginAuthoredAttack(e)
    }
  }
}

function blobMelee(world: World, e: Enemy, ctx: SimCtx): void {
  const p = world.player
  const reach = e.r + p.r + BLOB_REACH
  ctx.render.fx.hitSpark(e.x + e.aim.x * e.r * 0.6, e.y + e.aim.y * e.r * 0.4, Math.atan2(e.aim.y, e.aim.x), e.def.palette.accent)
  if (dist(e.x, e.y, p.x, p.y) <= reach) {
    damagePlayer(world, e.damage, ctx, e.form === 'nightmare' ? e.def.nightmareName : e.def.name, e)
  }
}

function updateBlobMelee(world: World, e: Enemy, dt: number, _ctx: SimCtx): void {
  const p = world.player
  const spd = currentSpeed(e)
  if (e.state === 'windup') {
    e.vx = 0
    e.vy = 0
    if (actorClipDone(enemyKey(e), 'attack')) e.state = 'chase'
    return
  }
  steerToward(e, p.x, p.y, spd)
  e.state = 'chase'
  e.cooldown -= dt
  const reach = e.r + p.r + BLOB_REACH
  if (e.cooldown <= 0 && dist(e.x, e.y, p.x, p.y) <= reach + 8) {
    e.state = 'windup'
    e.cooldown = 0.72
    e.vx = 0
    e.vy = 0
    beginAuthoredAttack(e)
  }
}

function updateEliteSlam(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const p = world.player
  if (e.state === 'windup') {
    const ang = Math.atan2(p.y - e.y, p.x - e.x)
    e.aim.x = Math.cos(ang)
    e.aim.y = Math.sin(ang)
    e.vx = 0
    e.vy = 0
    e.stateT -= dt
    if (e.stateT <= 0) {
      e.state = 'chase'
      e.cooldown = ELITE_SLAM_GAP
    }
    return
  }
  steerToward(e, p.x, p.y, currentSpeed(e))
  e.state = 'chase'
  e.cooldown -= dt
  if (e.cooldown <= 0 && dist(e.x, e.y, p.x, p.y) < ELITE_SLAM_RANGE) {
    const ang = Math.atan2(p.y - e.y, p.x - e.x)
    e.aim.x = Math.cos(ang)
    e.aim.y = Math.sin(ang)
    e.state = 'windup'
    e.stateT = ELITE_SLAM_WINDUP
    e.vx = 0
    e.vy = 0
    beginAuthoredAttack(e)
    ctx.audio.play('charge', { gain: 0.85, pitch: 0.7 })
  }
}

function mudRumble(world: World, e: Enemy, ctx: SimCtx): void {
  const dx = e.x - world.player.x
  const dy = e.y - world.player.y
  addTrauma(world, 3.4, dx, dy)
  ctx.audio.play('scream', { pitch: 0.42, gain: 0.34 })
  ctx.audio.play('mudSquelch', { pitch: 0.62, gain: 0.7 })
}

function beginPerform(e: Enemy, name: 'taunt' | 'scream'): void {
  const sheet = enemySheet(e)
  if (!sheet?.manifest.clips[name]) return
  e.perform = name
  e.vx = 0
  e.vy = 0
  restartActorClip(enemyKey(e), name)
}

function sheetEvents(world: World, e: Enemy, clip: string, events: readonly string[], ctx: SimCtx): void {
  if (!events.length) return
  const ex = extra(e)
  const b = e.def.behavior
  if (events.includes('release') && !ex.attackFired) {
    if (b.type === 'shoot' && e.state === 'shooting') {
      ex.attackFired = true
      fireAtPlayer(world, e, b.projectile, ctx, true)
    } else if (b.type === 'charge' && e.state === 'windup') {
      ex.attackFired = true
      startDash(e)
    } else if (b.type === 'kamikaze' && e.form !== 'nightmare') {
      ex.attackFired = true
      popKamikaze(world, e, ctx)
    }
  }
  if (events.includes('scream') && !ex.screamBurst) {
    ex.screamBurst = true
    fireScreamBurst(world, e, ctx)
    mudRumble(world, e, ctx)
  }
  if (events.includes('hit') && !ex.attackFired) {
    const fam = enemyFamily(e.kind)
    if ((fam === 'blob' || fam === 'beetle') && e.state === 'windup') {
      ex.attackFired = true
      blobMelee(world, e, ctx)
    } else if (e.kind === 'eliteBlob' && e.state === 'windup') {
      ex.attackFired = true
    } else if (e.kind === 'tomato' && e.form === 'nightmare' && e.state === 'windup') {
      ex.attackFired = true
      blobMelee(world, e, ctx)
    } else if (e.kind === 'bean' && e.state === 'windup') {
      ex.attackFired = true
      blobMelee(world, e, ctx)
    }
  }
  if (events.includes('emerge_fx') || events.includes('emerged')) emergeEvents(e, events, ctx)
  if (events.includes('takeoff') || events.includes('land')) leapEvents(e, events, ctx)
  if (events.includes('spawnFx')) {
    if (clip === 'death' || clip === 'death_slice' || clip === 'death_smash' || clip === 'attack') {
      spawnFunnyClip(funnyBurstClip(e), e.x, e.y, { scale: CHAOS.sheets.drawScale })
      spawnFunnyClip(funnySplatClip(e), e.x, e.y + 4, { scale: CHAOS.sheets.drawScale })
    } else if (clip.startsWith('death') || (events.includes('hit') && e.kind === 'eliteBlob')) {
      ctx.render.fx.inkBurst(e.x, e.y, e.r * (clip.startsWith('death') ? FEEL.kill.inkSize : 1.4))
    } else if (enemyFamily(e.kind) === 'charger') {
      ctx.render.fx.dust(e.x, e.y + e.r * 0.45, e.aim.x * 36, e.aim.y * 12)
    } else {
      const ang = Math.atan2(e.aim.y, e.aim.x)
      const muzzle = e.r + 6
      ctx.render.fx.muzzleFlash(e.x + Math.cos(ang) * muzzle, e.y + Math.sin(ang) * muzzle, ang, e.def.palette.accent)
    }
  }
}

function stepEnemySheet(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const sheet = enemySheet(e)
  if (!sheet) return
  const dead = e.state === 'dying' || e.anim.deathT >= 0
  const attacking = e.state === 'windup' || e.state === 'charging' || e.state === 'shooting'
  const key = enemyKey(e)
  // A killing blow queues a hurt replay before death starts. Swallow it so the
  // cream hurt cell cannot replace, or restart, the death clip.
  if (dead) consumeHurtKick(key)
  const hurtClip = !dead && !!sheet.manifest.clips.hurt
  // The first hurt cell is a solid cream flash (40 ms). Restarting on every
  // hit — multi-arm swings, burn ticks — holds that cell, so the blob reads
  // as a white shape. Let the recovery frames play out.
  const hurtPlaying = hurtClip && actorClipActive(key, 'hurt')
  const kicked = hurtClip && consumeHurtKick(key)
  if (kicked && !hurtPlaying) restartActorClip(key, 'hurt')
  const hurt = hurtPlaying || kicked
  const corpseName = dead ? corpseClipName(e) ?? (e.corpse && sheet.manifest.clips[e.corpse] ? e.corpse : 'death') : null
  const emerging = e.state === 'spawning' && hasClip(sheet, 'emerge')
  const leaping = isLeaping(e) && hasClip(sheet, 'leap')
  const screamingClip = e.state === 'screaming' && hasClip(sheet, 'scream')
  const performing = !dead && e.perform && sheet.manifest.clips[e.perform] ? e.perform : ''
  const clip = dead
    ? corpseName && sheet.manifest.clips[corpseName]
      ? corpseName
      : null
    : emerging
      ? 'emerge'
      : leaping
        ? 'leap'
        : screamingClip
          ? 'scream'
          : performing
            ? performing
            : hurt
              ? 'hurt'
              : attacking && sheet.manifest.clips.attack
                ? 'attack'
                : e.anim.moving && sheet.manifest.clips.walk
                  ? 'walk'
                  : sheet.manifest.clips.idle
                    ? 'idle'
                    : sheet.manifest.clips.walk
                      ? 'walk'
                      : null
  // Hurt is painted on top, but the attack or scream clock keeps running.
  if (hurt && attacking && sheet.manifest.clips.attack && clip !== 'attack') {
    const ev = advanceActorSheet(enemyKey(e), sheet, 'attack', dt)
    sheetEvents(world, e, 'attack', ev, ctx)
  }
  if (hurt && performing && clip !== performing) {
    const ev = advanceActorSheet(enemyKey(e), sheet, performing, dt)
    sheetEvents(world, e, performing, ev, ctx)
    if (actorClipDone(enemyKey(e), performing)) e.perform = undefined
  }
  if (!clip) return
  presentActorClip(key, clip, dt)
  const walkRate = clip === 'walk' ? walkPlaybackRate(Math.hypot(e.vx, e.vy), Math.max(40, e.speed)) : 1
  const events = advanceActorSheet(enemyKey(e), sheet, clip, dt, walkRate)
  if (clip === 'emerge') e.anim.spawnT = actorClipFraction(key, 'emerge')
  if (
    clip === 'attack' ||
    clip.startsWith('death') ||
    clip === 'emerge' ||
    clip === 'leap' ||
    clip === 'scream' ||
    clip === e.perform
  ) {
    sheetEvents(world, e, clip, events, ctx)
  }
  if (e.perform && clip === e.perform && actorClipDone(enemyKey(e), e.perform)) e.perform = undefined
}

function updateBehavior(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const b = e.def.behavior
  const p = world.player
  const spd = currentSpeed(e)
  if (maybeLeap(world, e, dt, ctx)) return

  if (b.type === 'kamikaze') {
    if (e.kind === 'tomato' && e.form === 'nightmare') {
      updateTomatoMud(world, e, dt, ctx)
      return
    }
    updateKamikaze(world, e, dt, ctx)
    return
  }
  if (b.type === 'chase') {
    if (e.kind === 'eliteBlob' && enemySheet(e)?.manifest.clips.attack) {
      updateEliteSlam(world, e, dt, ctx)
      return
    }
    const fam = enemyFamily(e.kind)
    if ((fam === 'blob' || fam === 'beetle') && enemySheet(e)?.manifest.clips.attack) {
      updateBlobMelee(world, e, dt, ctx)
      return
    }
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
    const sheeted = !!enemySheet(e)?.manifest.clips.attack
    const d = dist(e.x, e.y, p.x, p.y)
    if (e.state === 'shooting' && sheeted) {
      e.vx = damp(e.vx, 0, 8, dt)
      e.vy = damp(e.vy, 0, 8, dt)
      const ang = Math.atan2(p.y - e.y, p.x - e.x)
      e.aim.x = Math.cos(ang)
      e.aim.y = Math.sin(ang)
      if (actorClipDone(enemyKey(e), 'attack')) {
        if (!extra(e).attackFired) {
          extra(e).attackFired = true
          fireAtPlayer(world, e, b.projectile, ctx, false)
        }
        e.state = 'idle'
      }
      return
    }
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
      if (sheeted) {
        const ang = Math.atan2(p.y - e.y, p.x - e.x)
        e.aim.x = Math.cos(ang)
        e.aim.y = Math.sin(ang)
        beginAuthoredAttack(e)
      } else {
        fireAtPlayer(world, e, b.projectile, ctx)
      }
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
    if (!a || a.state === 'dying' || a.state === 'spawning' || isAirborne(a)) continue
    for (let j = i + 1; j < n; j++) {
      const b = list[j]
      if (!b || b.state === 'dying' || b.state === 'spawning' || isAirborne(b)) continue
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
  if (e.kind === 'tomato' || e.kind === 'bean') return false
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
    addTrauma(world, e.boss ? FEEL.shake.scream * 1.6 : FEEL.shake.scream, e.x - world.player.x, e.y - world.player.y)
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
  const roster = new Set(world.enemies)
  const keep: Enemy[] = []

  for (const e of world.enemies) {
    e.anim.t += dt
    e.anim.hitFlash = Math.max(0, e.anim.hitFlash - dt * 4)
    if (e.state !== 'screaming') e.anim.squash = damp(e.anim.squash, 1, 10, dt)
    e.knock.x = damp(e.knock.x, 0, CHAOS.smooth.knockDamp, dt)
    e.knock.y = damp(e.knock.y, 0, CHAOS.smooth.knockDamp, dt)
    const ex = extra(e)
    if (ex.surgeT > 0) ex.surgeT = Math.max(0, ex.surgeT - dt)

    if (e.hp <= 0 && e.state !== 'dying') beginDeath(world, e, ctx)

    if (e.state === 'dying') {
      e.stateT += dt
      const sheet = enemySheet(e)
      const kamikazeBody = extra(e).kamikazePopped
      const keepAttack = kamikazeBody && sheet && !actorClipDone(enemyKey(e), 'attack')
      const corpseName = corpseClipName(e) ?? (e.corpse && sheet?.manifest.clips[e.corpse] ? e.corpse : 'death')
      const authored = !!sheet?.manifest.clips[corpseName ?? '']
      const dur = authored && sheet && corpseName ? sheetClipSeconds(sheet, corpseName) : DEATH_TIME
      const deathDur = dur > 0 ? dur : DEATH_TIME
      const fade = authored && !kamikazeBody ? DEATH_FADE : 0
      e.anim.deathT = keepAttack
        ? Math.min(0.92, e.stateT / Math.max(0.4, deathDur))
        : authored
          ? e.stateT <= deathDur
            ? 0
            : Math.min(1, (e.stateT - deathDur) / fade)
          : Math.min(1, e.stateT / deathDur)
      if (sheet) stepEnemySheet(world, e, dt, ctx)
      e.vx = damp(e.vx, 0, 8, dt)
      e.vy = damp(e.vy, 0, 8, dt)
      e.x += (e.vx + e.knock.x) * dt
      e.y += (e.vy + e.knock.y) * dt
      if (keepAttack || e.stateT < deathDur + fade) keep.push(e)
      else {
        forgetActor(enemyKey(e))
        byUid.delete(e.uid)
      }
      continue
    }

    if (e.state === 'spawning') {
      const still = tickEmerge(e, dt, ctx)
      if (enemySheet(e)) stepEnemySheet(world, e, dt, ctx)
      if (still && e.state === 'spawning' && !actorClipDone(enemyKey(e), 'emerge')) {
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
      if (e.state === 'spawning') leaveSpawn(world, e, ctx)
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

    const tone = variantTone(e.kind)
    if (!e.perform && tone === 'mud' && !ex.sawHero && dist(e.x, e.y, player.x, player.y) < SEE_RANGE) {
      ex.sawHero = true
      // charger-mud's attack clip already contains the scream. Don't play one in front of it.
      if (enemyFamily(e.kind) !== 'charger' && e.kind !== 'tomato' && e.kind !== 'bean') beginPerform(e, 'scream')
    }
    if (
      !e.perform &&
      tone === 'light' &&
      e.state !== 'windup' &&
      e.state !== 'charging' &&
      e.state !== 'shooting'
    ) {
      ex.tauntCd -= dt
      if (ex.tauntCd <= 0) {
        ex.tauntCd = ctx.rng.range(4.2, 7.5)
        if (ctx.rng.chance(0.7)) beginPerform(e, 'taunt')
      }
    }

    if (e.state === 'screaming') {
      if (ex.authoredScream) tickAuthoredScream(e)
      else tickScream(world, e, dt, ctx)
    } else if (canScream(e)) {
      e.screamCooldown -= dt
      if (e.screamCooldown <= 0) startScream(e)
    }

    if (e.perform || e.state === 'screaming') {
      e.vx = 0
      e.vy = 0
    } else {
      updateBehavior(world, e, dt, ctx)
    }
    if (enemySheet(e)) stepEnemySheet(world, e, dt, ctx)
    e.x += (e.vx + e.knock.x) * dt
    e.y += (e.vy + e.knock.y) * dt
    const c = clampToArena(world, e.x, e.y, e.r)
    e.x = c.x
    e.y = c.y
    e.anim.moving = Math.hypot(e.vx, e.vy) > 8
    const posed = enemySheet(e)
    if (posed) {
      // Authored clips already bob. Hit-squash is juice, so don't pin it to 1 on a flash.
      e.anim.bob = 0
      if (e.anim.hitFlash < 0.05 && !isAirborne(e)) {
        e.anim.squash = damp(e.anim.squash, 1, CHAOS.juice.squashRecover, dt)
      }
      if (e.state === 'windup' || e.state === 'shooting' || e.state === 'charging') {
        if (Math.abs(e.aim.x) + Math.abs(e.aim.y) > 0.01) e.anim.facing = e.aim.x >= 0 ? 1 : -1
      } else if (Math.abs(e.vx) > 8) {
        e.anim.facing = e.vx >= 0 ? 1 : -1
      }
      if (e.anim.moving && e.state !== 'windup' && e.state !== 'shooting') {
        ex.footAcc += dt
        if (ex.footAcc >= FEEL.motion.footEvery) {
          ex.footAcc = 0
          ctx.render.fx.dust(e.x, e.y + e.r * 0.55, -e.vx * 0.08, 0)
        }
      } else {
        ex.footAcc = 0
      }
    } else {
      e.anim.bob = e.anim.moving ? Math.sin(e.anim.t * 10) * 2.2 : Math.sin(e.anim.t * 2) * 1.1
      e.anim.facing = e.vx >= 0 ? 1 : -1
    }
    tickFaceAnim(e.anim, dt, ex, {
      moving: e.anim.moving,
      speed: Math.hypot(e.vx, e.vy),
      form: e.form,
      screaming: e.state === 'screaming',
      screamProgress: e.state === 'screaming' ? Math.min(1, Math.max(0, e.anim.scream)) : 0,
      flinchT: 0,
      nextBlink: () => ctx.rng.range(3, 6),
    })
    if (e.state === 'screaming' && !ex.authoredScream) poseScream(e, ctx)
    if (posed) {
      e.anim.kick.x = 0
      e.anim.kick.y = 0
      e.anim.bob = 0
      if (e.anim.hitFlash < 0.05 && !isAirborne(e)) {
        e.anim.squash = damp(e.anim.squash, 1, CHAOS.juice.squashRecover, dt)
      }
    }

    const fam = enemyFamily(e.kind)
    const sheetStrike = posed && (((fam === 'blob' || fam === 'beetle') && e.state === 'windup') || (e.kind === 'eliteBlob' && (e.state === 'windup' || e.state === 'recover')))
    const kamikazeWindup = e.def.behavior.type === 'kamikaze' && e.form !== 'nightmare' && e.state === 'windup'
    if (!sheetStrike && !kamikazeWindup && player.hp > 0 && player.invuln <= 0 && collisionOn(e) && !isAirborne(e)) {
      const rad = e.r + player.r
      if (dist2(e.x, e.y, player.x, player.y) <= rad * rad) {
        damagePlayer(world, e.damage, ctx, e.form === 'nightmare' ? e.def.nightmareName : e.def.name, e)
        player.invuln = Math.max(player.invuln, CONTACT_IFRAMES)
      }
    }

    keep.push(e)
  }

  // A finished death is left out of `keep` on purpose. Putting every missing
  // uid back resurrected the corpse, and the fresh playhead was the cream
  // first cell of the death clip. Only actors spawned during this pass join.
  world.enemies = retainSpawned(roster, world.enemies, keep)
  separate(world)

  world.boss = null
  for (const e of world.enemies) {
    if (e.boss) {
      world.boss = e
      break
    }
  }
}