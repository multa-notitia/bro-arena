import { clamp, damp, dist, dist2, uid } from '../core/math.ts'
import type {
  Enemy,
  EnemyKind,
  Form,
  ProjectileDef,
  World,
} from '../core/types.ts'
import { ENEMIES, corpseClipFor, enemyFamily, paintedEnemyKind, variantTone } from '../data/enemies.ts'
import { enemyDamageAtWave, enemyHpAtWave } from '../data/waves.ts'
import { damagePlayer, dealDamageToEnemy } from './combat.ts'
import { dropFromEnemy, enemyMaterialValue } from './pickups.ts'
import { farmHpMult, farmNightmareBonus } from './farm.ts'
import { createAnim, tickFaceAnim } from './player.ts'
import { spawnProjectile } from './projectiles.ts'
import { addTrauma, FEEL, requestHitStop } from '../feel.ts'
import { CHAOS, chaosJuiceOn, maxEnemies, paceEnemySpeed, walkPlaybackRate } from '../data/chaos.ts'
import {
  chainBurst,
  comboPitch,
  corpseClipName,
  deathClipName,
  markKamikazeCorpse,
} from './chaosJuice.ts'
import { beginEmerge, collisionOn, emergeEvents, tickEmerge } from './emerge.ts'
import {
  familyClip,
  consumeGasMudTick,
  familyEvents,
  armOnionGas,
  familyHidden,
  takeFamilyHit,
  tickFamily,
  tickGas,
} from './families.ts'
import { tickFacing, turnClip } from './facing.ts'
import { isAirborne, isLeaping, maybeLeap, onSpecialEvents, pinLeapSquash, screamIsLeapTell, specialClip, specialOwns } from './leap.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import { spawnOnionPuff, spawnSmashSplat } from '../render/smashVfx.ts'
import {
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
import { pushGardenSolids } from './gardenSolids.ts'
import type { SimCtx } from './world.ts'

export { maxEnemies }
const DEATH_TIME = 0.45
const DEATH_FADE = 0.4
const CONTACT_IFRAMES = 0.5
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
  /** Seconds of idle before the attack clip, so attack_hit lands on the AI windup. */
  attackHold: number
  footAcc: number
  kamikazePopped: boolean
  authoredScream: boolean
  lungeAfterScream: boolean
  sawHero: boolean
  tauntCd: number
  /** The emerge clip has been started. AI stays off until its `emerged` event. */
  emerge: boolean
  /** This spawn hangs from a plant and plays `emerge_vine` when the sheet has it. */
  dropFromPlant: boolean
  /** Chosen once the sheet is loaded. Empty until then. */
  spawnClip: string
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
      attackHold: 0,
      footAcc: 0,
      kamikazePopped: false,
      authoredScream: false,
      lungeAfterScream: false,
      sawHero: false,
      tauntCd: 3,
      emerge: false,
      dropFromPlant: false,
      spawnClip: '',
    }
    extras.set(e, x)
  }
  return x
}

const PLANT_REACH = 150

function dropsFromPlant(world: World, x: number, y: number): boolean {
  for (const tree of world.trees) {
    if (dist(tree.x, tree.y, x, y) <= PLANT_REACH) return true
  }
  return false
}

/** Clip the spawner chose. Draw uses this so the vine drop and the mud emerge stay apart. */
export function enemySpawnClip(e: Enemy): string | null {
  const name = extras.get(e)?.spawnClip
  return name ? name : null
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
  if (world.enemies.length >= maxEnemies(world.wave)) return null
  kind = paintedEnemyKind(kind)
  const def = ENEMIES[kind]
  if (!def) return null
  let hp = enemyHpAtWave(def, world.wave)
  let damage = enemyDamageAtWave(def, world.wave)
  let r = def.radius
    const famName = enemyFamily(kind)
    let speed = paceEnemySpeed(famName, def.speed)
    if (variantTone(kind) === 'mud') {
      speed = CHAOS.pace.enemy[`${famName}Mud`] ?? Math.max(8, Math.round(speed * 0.9))
    }
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
    prevX: pos.x,
    prevY: pos.y,
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
    attackHold: 0,
    footAcc: 0,
    kamikazePopped: false,
    authoredScream: false,
    lungeAfterScream: false,
    sawHero: false,
    tauntCd: 3,
    emerge: false,
    dropFromPlant: dropsFromPlant(world, pos.x, pos.y),
    spawnClip: '',
  })
  if (boss) enemy.cooldown = 1.15
  world.enemies.push(enemy)
  byUid.set(enemy.uid, enemy)
  if (boss) world.boss = enemy
  if (parent) parent.children += 1
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
function leaveSpawn(_world: World, e: Enemy, _ctx: SimCtx): void {
  e.state = 'chase'
  e.anim.spawnT = 1
}

const LEAD_S = 0.16
const LEAD_CAP = 28
/** Charge / bite / leap stand-still after the hit. The next chase starts inside this. */
const RECOVER_CAP = 0.38

function predictPlayer(world: World): { x: number; y: number } {
  const p = world.player
  let lx = p.vx * LEAD_S
  let ly = p.vy * LEAD_S
  const mag = Math.hypot(lx, ly)
  if (mag > LEAD_CAP) {
    const s = LEAD_CAP / mag
    lx *= s
    ly *= s
  }
  return { x: p.x + lx, y: p.y + ly }
}

function steerToward(e: Enemy, tx: number, ty: number, spd: number): void {
  const ang = Math.atan2(ty - e.y, tx - e.x)
  e.vx = Math.cos(ang) * spd
  e.vy = Math.sin(ang) * spd
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
}

function steerAtPlayer(world: World, e: Enemy, spd: number): void {
  const t = predictPlayer(world)
  steerToward(e, t.x, t.y, spd)
}

function clampVel(e: Enemy, spd: number): void {
  const m = Math.hypot(e.vx, e.vy)
  if (m > spd && m > 0.001) {
    e.vx = (e.vx / m) * spd
    e.vy = (e.vy / m) * spd
  }
}

/**
 * Hold 60–80% of attack range. Outside the band, close. Inside it, a small
 * radial correction plus a light strafe — not a full-speed orbit.
 */
function steerRanged(world: World, e: Enemy, spd: number, range: number): void {
  const p = world.player
  const dx = p.x - e.x
  const dy = p.y - e.y
  const d = Math.hypot(dx, dy) || 1
  const near = range * 0.6
  const far = range * 0.8
  const mid = range * 0.7
  const ang = Math.atan2(dy, dx)
  const side = (e.uid & 1) === 0 ? 1 : -1
  const tx = Math.cos(ang + Math.PI / 2) * side
  const ty = Math.sin(ang + Math.PI / 2) * side
  let radial = 1
  let strafe = 0.08
  if (d < near) {
    radial = -0.35
    strafe = 0.16
  } else if (d <= far) {
    radial = Math.max(-0.4, Math.min(0.55, (d - mid) / Math.max(8, (far - near) * 0.5)))
    strafe = 0.18
  }
  e.vx = Math.cos(ang) * spd * radial + tx * spd * strafe
  e.vy = Math.sin(ang) * spd * radial + ty * spd * strafe
  clampVel(e, spd)
  const aim = predictPlayer(world)
  const a = Math.atan2(aim.y - e.y, aim.x - e.x)
  e.aim.x = Math.cos(a)
  e.aim.y = Math.sin(a)
}

/** Onion gas sits on the body. 80% of this range is still inside the cloud. */
function onionRange(p: { r: number }): number {
  return (CHAOS.families.onion.gasR + p.r + 4) / 0.8
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
  const p = predictPlayer(world)
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

function aimCharge(e: Enemy, world: World): void {
  const t = predictPlayer(world)
  const ang = Math.atan2(t.y - e.y, t.x - e.x)
  e.aim.x = Math.cos(ang)
  e.aim.y = Math.sin(ang)
}

function beginCharge(e: Enemy, world: World, ctx: SimCtx, windup: number): void {
  e.state = 'windup'
  e.stateT = windup
  aimCharge(e, world)
  e.vx = 0
  e.vy = 0
  if (enemySheet(e)?.manifest.clips.attack) beginAuthoredAttack(e, windup)
  ctx.audio.play('charge', { gain: e.boss ? 1 : 0.7 })
}

function startDash(e: Enemy, world: World): void {
  if (e.state !== 'windup') return
  e.state = 'charging'
  aimCharge(e, world)
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
  world: World,
  e: Enemy,
  dt: number,
  ctx: SimCtx,
  speedMult: number,
  cooldown: number,
): void {
  const ex = extra(e)
  const sheeted = !!enemySheet(e)?.manifest.clips.attack
  if (e.state === 'windup') {
    aimCharge(e, world)
    e.vx = 0
    e.vy = 0
    if (sheeted) {
      // The attack clip is the telegraph. The dash starts on its release frame.
      e.anim.kick.x = 0
      e.anim.kick.y = 0
      if (ex.attackHold <= 0 && !ex.attackFired && actorClipDone(enemyKey(e), 'attack')) startDash(e, world)
    } else {
      e.stateT -= dt
      e.anim.kick.x = (ctx.rng.next() - 0.5) * 8
      e.anim.kick.y = (ctx.rng.next() - 0.5) * 8
      if (e.stateT <= 0) startDash(e, world)
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
      e.stateT = Math.min(RECOVER_CAP, cooldown)
    }
    return
  }
  if (e.state === 'recover') {
    e.stateT -= dt
    steerAtPlayer(world, e, currentSpeed(e))
    if (e.stateT <= 0) {
      e.state = 'chase'
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

  steerAtPlayer(world, e, currentSpeed(e))
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
    steerAtPlayer(world, e, currentSpeed(e))
  }
}

const BLOB_REACH = 18
const ELITE_SLAM_RANGE = 220
/** Telegraph plus slam. The v3 clip is 885 ms; the windup holds the last cell out to this. */
const ELITE_SLAM_WINDUP = 0.975
const ELITE_SLAM_GAP = 3.6
/** attack_hit is 165 ms into the painted lunge. */
const ATTACK_HIT_AT = 0.165

function beginAuthoredAttack(e: Enemy, windup = 0): void {
  const ex = extra(e)
  ex.attackFired = false
  ex.attackHold = Math.max(0, windup - ATTACK_HIT_AT)
  if (ex.attackHold <= 0) restartActorClip(enemyKey(e), 'attack')
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
  steerAtPlayer(world, e, currentSpeed(e))
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

function tickAuthoredScream(e: Enemy, dt: number): void {
  e.stateT += dt
  const sheet = enemySheet(e)
  const done = e.stateT >= RECOVER_CAP || !hasClip(sheet, 'scream') || actorClipDone(enemyKey(e), 'scream')
  if (!done) {
    e.vx = 0
    e.vy = 0
    return
  }
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
  e.state = 'chase'
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
    if (actorClipDone(enemyKey(e), 'attack') || e.stateT > 0.45) e.state = 'chase'
    else e.stateT += dt
    return
  }
  e.stateT = 0
  steerAtPlayer(world, e, spd)
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
    const t = predictPlayer(world)
    const ang = Math.atan2(t.y - e.y, t.x - e.x)
    e.aim.x = Math.cos(ang)
    e.aim.y = Math.sin(ang)
    e.vx = 0
    e.vy = 0
    if (actorClipDone(enemyKey(e), 'attack') || e.stateT > 0.45) e.state = 'chase'
    else e.stateT += dt
    return
  }
  e.stateT = 0
  steerAtPlayer(world, e, spd)
  e.state = 'chase'
  e.cooldown -= dt
  const reach = e.r + p.r + BLOB_REACH
  if (e.cooldown <= 0 && dist(e.x, e.y, p.x, p.y) <= reach + 8) {
    e.state = 'windup'
    e.stateT = 0
    e.cooldown = 0.72
    e.vx = 0
    e.vy = 0
    beginAuthoredAttack(e)
  }
}

function updateOnion(world: World, e: Enemy, dt: number, _ctx: SimCtx): void {
  const p = world.player
  const spd = currentSpeed(e)
  const range = onionRange(p)
  const d = dist(e.x, e.y, p.x, p.y)
  steerRanged(world, e, spd, range)
  if (e.state === 'windup') {
    if (actorClipDone(enemyKey(e), 'attack') || e.stateT > 0.45) e.state = 'chase'
    else e.stateT += dt
    return
  }
  e.state = 'chase'
  e.stateT = 0
  e.cooldown -= dt
  if (e.cooldown <= 0 && d <= range) {
    e.state = 'windup'
    e.stateT = 0
    e.cooldown = 0.85
    armOnionGas(e)
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
  steerAtPlayer(world, e, currentSpeed(e))
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
    beginAuthoredAttack(e, ELITE_SLAM_WINDUP)
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

function sheetEvents(world: World, e: Enemy, clip: string, events: readonly string[], ctx: SimCtx): void {
  if (!events.length) return
  const ex = extra(e)
  const b = e.def.behavior
  const strike = events.includes('attack_hit') || events.includes('hit')
  if (events.includes('release') && !ex.attackFired) {
    if (b.type === 'shoot' && e.state === 'shooting') {
      ex.attackFired = true
      fireAtPlayer(world, e, b.projectile, ctx, true)
    } else if (b.type === 'charge' && e.state === 'windup') {
      ex.attackFired = true
      startDash(e, world)
    } else if (b.type === 'kamikaze' && e.form !== 'nightmare') {
      ex.attackFired = true
      popKamikaze(world, e, ctx)
    }
  }
  if (events.includes('scream') && !ex.screamBurst && !screamIsLeapTell(e)) {
    ex.screamBurst = true
    fireScreamBurst(world, e, ctx)
    mudRumble(world, e, ctx)
  }
  if (strike && !ex.attackFired) {
    const fam = enemyFamily(e.kind)
    if ((fam === 'blob' || fam === 'beetle' || fam === 'beetroot' || fam === 'onion') && e.state === 'windup') {
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
    } else if (b.type === 'charge' && e.state === 'windup') {
      ex.attackFired = true
      startDash(e, world)
    }
  }
  if (events.includes('release') && !ex.attackFired && enemyFamily(e.kind) === 'onion' && e.state === 'windup') {
    ex.attackFired = true
    blobMelee(world, e, ctx)
  }
  if (events.includes('splat') && (clip === 'death_smash' || clip.startsWith('death_smash'))) {
    spawnSmashSplat(e, ctx.rng.int(0, 1e6))
  }
  if (events.includes('gas_puff')) spawnOnionPuff(e)
  if (events.includes('emerge_fx') || events.includes('emerged')) emergeEvents(e, events, ctx)
  if (
    events.includes('takeoff') ||
    events.includes('leap_takeoff') ||
    events.includes('land') ||
    events.includes('leap_land') ||
    events.includes('leap_done') ||
    events.includes('bite_hit') ||
    events.includes('bite_done') ||
    events.includes('attack_hit') ||
    events.includes('hit')
  ) {
    onSpecialEvents(world, e, events, ctx)
  }
  if (events.includes('spawnFx')) {
    if (clip === 'death' || clip === 'death_slice' || clip === 'death_smash' || clip === 'attack') {
      spawnFunnyClip(CHAOS.sheets.pop, e.x, e.y, { scale: CHAOS.sheets.popScale })
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
  const ex = extra(e)
  if (ex.attackHold > 0 && attacking && !dead) {
    ex.attackHold -= dt
    if (ex.attackHold <= 0) {
      ex.attackHold = 0
      if (sheet.manifest.clips.attack) restartActorClip(key, 'attack')
    }
  }
  // Hurt frame 0 is a cream flash drawn over the body. Never play the clip.
  consumeHurtKick(key)
  const corpseName = dead ? corpseClipName(e) ?? (e.corpse && sheet.manifest.clips[e.corpse] ? e.corpse : 'death') : null
  const emerging = e.state === 'spawning' && hasClip(sheet, 'emerge')
  const leaping = isLeaping(e) && hasClip(sheet, 'leap')
  const screamingClip = e.state === 'screaming' && hasClip(sheet, 'scream')
  const performing = !dead && e.perform && sheet.manifest.clips[e.perform] ? e.perform : ''
  const playAttack = attacking && sheet.manifest.clips.attack && ex.attackHold <= 0
  const posedClip = !dead && !emerging ? specialClip(e) ?? turnClip(e) : null
  const clipRaw = dead
    ? corpseName && sheet.manifest.clips[corpseName]
      ? corpseName
      : null
    : emerging
      ? 'emerge'
      : posedClip && sheet.manifest.clips[posedClip]
        ? posedClip
        : leaping
          ? 'leap'
          : screamingClip
            ? 'scream'
            : performing
              ? performing
              : playAttack
                ? 'attack'
                : e.anim.moving && sheet.manifest.clips.walk
                  ? 'walk'
                  : sheet.manifest.clips.idle
                    ? 'idle'
                    : sheet.manifest.clips.walk
                      ? 'walk'
                      : null
  const clip = familyClip(e, clipRaw)
  if (!clip) return
  presentActorClip(key, clip)
  const walkRate = walkPlaybackRate(Math.hypot(e.vx, e.vy), Math.max(40, e.speed))
  const events = advanceActorSheet(enemyKey(e), sheet, clip, dt, walkRate)
  if (clip === 'emerge') e.anim.spawnT = actorClipFraction(key, 'emerge')
  if (
    clip === 'attack' ||
    clip.startsWith('death') ||
    clip === 'emerge' ||
    clip === 'leap' ||
    clip === 'bite' ||
    clip === 'taunt' ||
    clip === 'scream' ||
    clip === 'burrow' ||
    clip === 'resurface' ||
    clip === 'peel' ||
    clip === e.perform
  ) {
    sheetEvents(world, e, clip, events, ctx)
    familyEvents(world, e, clip, events, ctx)
    if (takeFamilyHit(e)) {
      const pad = CHAOS.families.beetroot.hitPad
      if (dist(e.x, e.y, world.player.x, world.player.y) <= e.r + world.player.r + pad) {
        damagePlayer(world, e.damage, ctx, e.form === 'nightmare' ? e.def.nightmareName : e.def.name, e)
      }
    }
  }
  if (e.perform && clip === e.perform && actorClipDone(enemyKey(e), e.perform)) e.perform = undefined
}

function updateBehavior(world: World, e: Enemy, dt: number, ctx: SimCtx): void {
  const b = e.def.behavior
  const p = world.player
  const spd = currentSpeed(e)
  if (specialOwns(e)) {
    maybeLeap(world, e, dt, ctx)
    return
  }
  if (tickFamily(world, e, dt, ctx)) return
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
    if (fam === 'onion') {
      updateOnion(world, e, dt, ctx)
      return
    }
    if ((fam === 'blob' || fam === 'beetle' || fam === 'beetroot') && enemySheet(e)?.manifest.clips.attack) {
      updateBlobMelee(world, e, dt, ctx)
      return
    }
    steerAtPlayer(world, e, spd)
    e.state = 'chase'
    return
  }
  if (b.type === 'wander') {
    steerAtPlayer(world, e, spd)
    e.state = 'chase'
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
    else {
      steerAtPlayer(world, e, spd)
      e.state = 'chase'
    }
    return
  }
  if (b.type === 'shoot') {
    const sheeted = !!enemySheet(e)?.manifest.clips.attack
    const d = dist(e.x, e.y, p.x, p.y)
    steerRanged(world, e, spd, b.range)
    if (e.state === 'shooting' && sheeted) {
      if (actorClipDone(enemyKey(e), 'attack') || e.stateT > 0.45) {
        if (!extra(e).attackFired) {
          extra(e).attackFired = true
          fireAtPlayer(world, e, b.projectile, ctx, false)
        }
        e.state = 'chase'
        e.stateT = 0
      } else e.stateT += dt
      return
    }
    e.state = 'chase'
    e.cooldown -= dt
    if (e.cooldown <= 0 && d < b.range) {
      e.cooldown = b.cooldown
      if (sheeted) {
        e.state = 'shooting'
        e.stateT = 0
        beginAuthoredAttack(e)
      } else {
        fireAtPlayer(world, e, b.projectile, ctx)
      }
    }
    return
  }
  if (b.type === 'spawner') {
    steerAtPlayer(world, e, spd)
    e.state = 'chase'
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

function canSeparate(e: Enemy): boolean {
  if (e.state === 'dying' || e.state === 'spawning' || e.state === 'charging') return false
  if (isAirborne(e)) return false
  return true
}

function cellKey(cx: number, cy: number): number {
  return ((cx + 512) << 16) | ((cy + 512) & 0xffff)
}

const sepBuckets = new Map<number, number[]>()
let sepX = new Float64Array(0)
let sepY = new Float64Array(0)

export function overlappingEnemyPairs(world: World, frac: number): number {
  const list = world.enemies
  const n = list.length
  let hits = 0
  for (let i = 0; i < n; i++) {
    const a = list[i]
    if (!a || a.state === 'dying' || a.state === 'spawning') continue
    for (let j = i + 1; j < n; j++) {
      const b = list[j]
      if (!b || b.state === 'dying' || b.state === 'spawning') continue
      const min = (a.r + b.r) * frac
      const dx = a.x - b.x
      const dy = a.y - b.y
      if (dx * dx + dy * dy < min * min) hits += 1
    }
  }
  return hits
}

export interface OverlapProbe {
  frames: number
  preSep: number
  postSep: number
  preStack: number
  postStack: number
}

export const overlapProbe: OverlapProbe = {
  frames: 0,
  preSep: 0,
  postSep: 0,
  preStack: 0,
  postStack: 0,
}

export function resetOverlapProbe(): void {
  overlapProbe.frames = 0
  overlapProbe.preSep = 0
  overlapProbe.postSep = 0
  overlapProbe.preStack = 0
  overlapProbe.postStack = 0
}

export function overlapAverages(): { sepBefore: number; sepAfter: number; stackBefore: number; stackAfter: number; frames: number } {
  const n = Math.max(1, overlapProbe.frames)
  return {
    frames: overlapProbe.frames,
    sepBefore: overlapProbe.preSep / n,
    sepAfter: overlapProbe.postSep / n,
    stackBefore: overlapProbe.preStack / n,
    stackAfter: overlapProbe.postStack / n,
  }
}

function separate(world: World): void {
  const list = world.enemies
  const n = list.length
  const cell = CHAOS.read.separateCell
  const hitFrac = CHAOS.read.separateHit
  const pushK = CHAOS.read.separatePush
  const cap = CHAOS.read.separateCap
  overlapProbe.frames += 1
  overlapProbe.preSep += overlappingEnemyPairs(world, hitFrac)
  overlapProbe.preStack += overlappingEnemyPairs(world, 0.35)

  if (sepX.length < n) {
    sepX = new Float64Array(n)
    sepY = new Float64Array(n)
  } else {
    sepX.fill(0, 0, n)
    sepY.fill(0, 0, n)
  }
  sepBuckets.clear()
  const active: number[] = []
  for (let i = 0; i < n; i++) {
    const e = list[i]
    if (!e || !canSeparate(e)) continue
    active.push(i)
    const k = cellKey(Math.floor(e.x / cell), Math.floor(e.y / cell))
    let bucket = sepBuckets.get(k)
    if (!bucket) {
      bucket = []
      sepBuckets.set(k, bucket)
    }
    bucket.push(i)
  }
  for (let a = 0; a < active.length; a++) {
    const i = active[a]!
    const ea = list[i]
    if (!ea) continue
    const cx = Math.floor(ea.x / cell)
    const cy = Math.floor(ea.y / cell)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = sepBuckets.get(cellKey(cx + ox, cy + oy))
        if (!bucket) continue
        for (let b = 0; b < bucket.length; b++) {
          const j = bucket[b]!
          if (j <= i) continue
          const eb = list[j]
          if (!eb || !canSeparate(eb)) continue
          const dx = ea.x - eb.x
          const dy = ea.y - eb.y
          const min = (ea.r + eb.r) * hitFrac
          const d2 = dx * dx + dy * dy
          if (d2 >= min * min || d2 < 0.0001) continue
          const d = Math.sqrt(d2)
          const push = Math.min(cap, (min - d) * pushK)
          const inv = push / d
          sepX[i] = (sepX[i] ?? 0) + dx * inv
          sepY[i] = (sepY[i] ?? 0) + dy * inv
          sepX[j] = (sepX[j] ?? 0) - dx * inv
          sepY[j] = (sepY[j] ?? 0) - dy * inv
        }
      }
    }
  }

  const hero = world.player
  const ring = hero.r + CHAOS.read.heroClear
  for (let a = 0; a < active.length; a++) {
    const i = active[a]!
    const ea = list[i]
    if (!ea) continue
    let px = sepX[i] ?? 0
    let py = sepY[i] ?? 0
    const hx = ea.x - hero.x
    const hy = ea.y - hero.y
    const hd = Math.hypot(hx, hy)
    if (hd > ring && hd > 0.001) {
      const radial = (px * hx + py * hy) / hd
      if (radial > 0) {
        const cut = radial * 0.85
        px -= (hx / hd) * cut
        py -= (hy / hd) * cut
      }
    }
    const mag = Math.hypot(px, py)
    if (mag > 1.6) {
      const s = 1.6 / mag
      px *= s
      py *= s
    }
    ea.x += px
    ea.y += py
  }

  overlapProbe.postSep += overlappingEnemyPairs(world, hitFrac)
  overlapProbe.postStack += overlappingEnemyPairs(world, 0.35)
  pushFromHero(world)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __overlap?: ReturnType<typeof overlapAverages> }).__overlap = overlapAverages()
  }
}

/** Soft ring so a pack cannot sit on the potato. Dying / airborne stay put. */
function pushFromHero(world: World): void {
  const p = world.player
  const min = p.r + CHAOS.read.heroClear
  const min2 = min * min
  const cap = CHAOS.read.heroClearCap
  const k = CHAOS.read.heroClearPush
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i]
    if (!e || e.state === 'dying') continue
    if (isAirborne(e)) continue
    let dx = e.x - p.x
    let dy = e.y - p.y
    let d2 = dx * dx + dy * dy
    if (d2 >= min2) continue
    if (d2 < 0.0001) {
      dx = e.uid % 2 === 0 ? 1 : -1
      dy = 0.15
      d2 = dx * dx + dy * dy
    }
    const d = Math.sqrt(d2)
    const push = Math.min(cap, (min - d) * k)
    const inv = push / d
    const pos = clampToArena(world, e.x + dx * inv, e.y + dy * inv, e.r)
    e.x = pos.x
    e.y = pos.y
  }
}

function canScream(e: Enemy): boolean {
  if (e.form !== 'nightmare') return false
  if (e.kind === 'tomato' || e.kind === 'bean') return false
  if (e.state === 'spawning' || e.state === 'dying' || e.state === 'charging' || e.state === 'windup') return false
  return true
}

function fireScreamBurst(world: World, e: Enemy, ctx: SimCtx): void {
  const glow = e.def.palette.glow ?? '#d9ff5c'
  ctx.render.fx.shockwave(e.x, e.y, 80 + e.r, glow)
  if (dist(e.x, e.y, world.player.x, world.player.y) <= 400) {
    addTrauma(world, e.boss ? FEEL.shake.scream * 1.6 : FEEL.shake.scream, e.x - world.player.x, e.y - world.player.y)
  }
  ctx.audio.play(e.boss ? 'screamBig' : 'scream')
}

function finishScream(world: World, e: Enemy, ctx: SimCtx): void {
  fireScreamBurst(world, e, ctx)
  e.state = 'chase'
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
      spawnEnemy(world, 'blob-light', e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20), ctx, false, e)
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

export function aiOverlayOn(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get('ai') === '1'
}

export function aiOverlayText(e: Enemy): string {
  if (specialOwns(e)) return specialClip(e) || 'special'
  if (familyHidden(e)) return 'burrow'
  return e.state
}

interface StallHit {
  kind: string
  state: string
  dist: number
  wave: number
}

const stallRows = new WeakMap<Enemy, { best: number; since: number; logged: boolean }>()
const stallHits: StallHit[] = []

function inStrikeBand(e: Enemy, d: number, p: World['player']): boolean {
  const b = e.def.behavior
  if (b.type === 'shoot') return d <= b.range * 0.85
  if (b.type === 'charge') return d <= b.range
  if (b.type === 'kamikaze') return d <= b.range + 8
  if (enemyFamily(e.kind) === 'onion') return d <= onionRange(p)
  return d <= e.r + p.r + 36
}

function stallExempt(e: Enemy, d: number, p: World['player']): boolean {
  if (e.state === 'dying' || e.state === 'spawning') return true
  if (e.state === 'windup' || e.state === 'charging' || e.state === 'shooting') return true
  if (e.state === 'burrowing' || e.state === 'resurfacing' || e.state === 'peeling' || e.state === 'screaming') return true
  if (specialOwns(e) || isAirborne(e) || familyHidden(e)) return true
  return inStrikeBand(e, d, p)
}

function noteStall(world: World, e: Enemy, dt: number): void {
  if (!import.meta.env.DEV) return
  const p = world.player
  const d = dist(e.x, e.y, p.x, p.y)
  let row = stallRows.get(e)
  if (!row) {
    row = { best: d, since: 0, logged: false }
    stallRows.set(e, row)
  }
  if (stallExempt(e, d, p)) {
    row.best = d
    row.since = 0
    return
  }
  if (d < row.best - 6) {
    row.best = d
    row.since = 0
    row.logged = false
    return
  }
  row.since += dt
  if (row.since < 3 || row.logged) return
  row.logged = true
  const hit: StallHit = { kind: e.kind, state: aiOverlayText(e), dist: Math.round(d), wave: world.wave }
  stallHits.push(hit)
  console.warn(`[ai] ${hit.kind} stalled ${row.since.toFixed(1)}s at ${hit.dist}px state=${hit.state} wave=${hit.wave}`)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __aiStalls?: StallHit[] }).__aiStalls = stallHits
  }
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
      const corpse = pushGardenSolids(e.x, e.y, e.r)
      e.x = corpse.x
      e.y = corpse.y
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
      const emergeStuck = e.stateT > 3.2
      if (still && e.state === 'spawning' && !actorClipDone(enemyKey(e), 'emerge') && !emergeStuck) {
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

    if (e.perform) e.perform = undefined

    if (e.state === 'screaming' && ex.authoredScream) {
      tickAuthoredScream(e, dt)
    } else {
      if (e.state === 'screaming') {
        e.state = 'chase'
        e.anim.scream = -1
      } else if (canScream(e) && !specialOwns(e)) {
        e.screamCooldown -= dt
        if (e.screamCooldown <= 0) finishScream(world, e, ctx)
      }
      updateBehavior(world, e, dt, ctx)
    }
    noteStall(world, e, dt)
    if (enemySheet(e)) {
      const attackAim =
        !specialOwns(e) && (e.state === 'windup' || e.state === 'shooting' || e.state === 'charging')
      tickFacing(e, dt, attackAim)
      if (pinLeapSquash(e)) e.anim.squash = 1
      stepEnemySheet(world, e, dt, ctx)
    }
    if (familyHidden(e)) {
      e.knock.x = 0
      e.knock.y = 0
    } else {
      e.x += (e.vx + e.knock.x) * dt
      e.y += (e.vy + e.knock.y) * dt
    }
    const nudged = pushGardenSolids(e.x, e.y, e.r)
    const c = clampToArena(world, nudged.x, nudged.y, e.r)
    e.x = c.x
    e.y = c.y
    e.anim.moving = Math.hypot(e.vx, e.vy) > 8
    const posed = enemySheet(e)
    if (posed) {
      // Authored clips already bob. Hit-squash is juice, so don't pin it to 1 on a flash.
      e.anim.bob = 0
      if (pinLeapSquash(e)) e.anim.squash = 1
      else if (e.anim.hitFlash < 0.05 && !isAirborne(e)) {
        e.anim.squash = damp(e.anim.squash, 1, CHAOS.juice.squashRecover, dt)
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
    if (posed) {
      e.anim.kick.x = 0
      e.anim.kick.y = 0
      e.anim.bob = 0
      if (pinLeapSquash(e)) e.anim.squash = 1
      else if (e.anim.hitFlash < 0.05 && !isAirborne(e)) {
        e.anim.squash = damp(e.anim.squash, 1, CHAOS.juice.squashRecover, dt)
      }
    }

    const fam = enemyFamily(e.kind)
    const sheetStrike = posed && (((fam === 'blob' || fam === 'beetle' || fam === 'beetroot' || fam === 'onion') && e.state === 'windup') || (e.kind === 'eliteBlob' && (e.state === 'windup' || e.state === 'recover')))
    const kamikazeWindup = e.def.behavior.type === 'kamikaze' && e.form !== 'nightmare' && e.state === 'windup'
    if (!sheetStrike && !kamikazeWindup && player.hp > 0 && player.invuln <= 0 && collisionOn(e) && !isAirborne(e) && !familyHidden(e)) {
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
  tickGas(world, dt)
  if (consumeGasMudTick()) damagePlayer(world, CHAOS.families.onion.mudTick, ctx, 'toxic gas')
  separate(world)

  world.boss = null
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const p = world.player
    ;(window as unknown as { __aiSnap?: { kind: string; state: string; d: number }[] }).__aiSnap = world.enemies
      .filter((e) => e.state !== 'dying')
      .slice(0, 24)
      .map((e) => ({ kind: e.kind, state: aiOverlayText(e), d: Math.round(dist(e.x, e.y, p.x, p.y)) }))
  }
  for (const e of world.enemies) {
    if (e.boss) {
      world.boss = e
      break
    }
  }
}