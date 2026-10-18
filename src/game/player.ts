import { clamp, damp, ease, uid, wrapAngle } from '../core/math.ts'
import { FEEL } from '../feel.ts'
import type {
  AnimState,
  CharacterDef,
  Form,
  ItemSpecial,
  ModelDir,
  Player,
  Stats,
  Tier,
  Vec,
  WeaponId,
  WeaponInstance,
  World,
} from '../core/types.ts'
import { ITEMS } from '../data/items.ts'
import { computeStats } from '../data/stats.ts'
import { xpForLevel } from '../data/economy.ts'
import type { SimCtx } from './world.ts'
import { debugHeroWeapons, multiArmSheet, potatoMultiArm, resetMultiArm } from '../render/multiarm.ts'
import {
  actorClipActive,
  advanceActorSheet,
  consumeHurtKick,
  notePlayerRelease,
  resolveSheet,
  restartActorClip,
  sheetKeysForPlayer,
} from '../render/sheets.ts'

const START_RICH = 40
const MOVE_ACCEL = 2100
const MOVE_FRICTION = 11
const BASE_SPEED = 210
const SQUASH_TIME = 0.22

export interface PlayerExtra {
  squashT: number
  matHeal: number
  blinkWait: number
  screamLeft: number
  flinchT: number
  wasMoving: boolean
  footAcc: number
}

const bonusByPlayer = new WeakMap<Player, Partial<Stats>>()
const extraByPlayer = new WeakMap<Player, PlayerExtra>()

export function createAnim(spawnT = 1): AnimState {
  return {
    t: 0,
    spawnT,
    deathT: -1,
    bob: 0,
    squash: 1,
    facing: 1,
    hitFlash: 0,
    kick: { x: 0, y: 0 },
    moving: false,
    mouth: 0,
    scream: -1,
    gait: 0,
    blink: -1,
  }
}

export interface FaceClock {
  blinkWait: number
}

/** Shared face/gait tick for player and enemies. */
export function tickFaceAnim(
  anim: AnimState,
  dt: number,
  clock: FaceClock,
  opts: {
    moving: boolean
    speed: number
    form: Form
    screaming: boolean
    screamProgress: number
    flinchT: number
    nextBlink: () => number
  },
): void {
  if (opts.moving && opts.speed > 8) {
    anim.gait += (opts.speed / 160) * dt
    if (anim.gait >= 1) anim.gait -= Math.floor(anim.gait)
  }

  if (opts.screaming) {
    anim.scream = opts.screamProgress
    anim.mouth = 1
    anim.blink = -1
    return
  }
  anim.scream = -1

  if (anim.blink >= 0) {
    anim.blink += dt / 0.15
    if (anim.blink >= 1) {
      anim.blink = -1
      clock.blinkWait = opts.nextBlink()
    }
  } else {
    clock.blinkWait -= dt
    if (clock.blinkWait <= 0) anim.blink = 0
  }

  if (opts.flinchT > 0) {
    anim.mouth = 0.6
    return
  }
  if (opts.form === 'nightmare') {
    anim.mouth = 0.35 + (opts.moving ? Math.sin(anim.t * 10) * 0.08 : 0)
  } else if (opts.moving) {
    anim.mouth = 0.12 + Math.sin(anim.t * 14) * 0.13
  } else {
    anim.mouth = 0.04 + Math.sin(anim.t * 2.4) * 0.03
  }
}

export function startPlayerScream(player: Player): void {
  extraState(player).screamLeft = 0.5
}

export function makeWeapon(id: WeaponId, tier: Tier, slot: number): WeaponInstance {
  return {
    uid: uid(),
    id,
    tier,
    cooldown: 0.2,
    angle: 0,
    swingT: -1,
    slot,
    targetUid: null,
    burstLeft: 0,
    burstTimer: 0,
    auraAcc: 0,
  }
}

export function syncWeaponSlots(player: Player): void {
  player.weapons.forEach((w, i) => {
    w.slot = i
  })
}

export function weaponSlotCount(player: Player): number {
  if (player.character.special === 'oneWeapon') return 1
  return player.character.weaponSlots ?? 6
}

export function getLevelBonus(player: Player): Partial<Stats> {
  let bonus = bonusByPlayer.get(player)
  if (!bonus) {
    bonus = {}
    bonusByPlayer.set(player, bonus)
  }
  return bonus
}

export function extraState(player: Player): PlayerExtra {
  let extra = extraByPlayer.get(player)
  if (!extra) {
    extra = { squashT: 1, matHeal: 0, blinkWait: 4, screamLeft: 0, flinchT: 0, wasMoving: false, footAcc: 0 }
    extraByPlayer.set(player, extra)
  }
  return extra
}

export function createPlayer(character: CharacterDef, model: ModelDir = 'b'): Player {
  const debugArms = debugHeroWeapons(character.species)
  const base = debugArms ?? character.startingWeapons
  const starters =
    !debugArms && character.species === 'chili' && model === 'board' && !base.some((w) => w.id === 'knife')
      ? [{ id: 'knife' as const, tier: 1 as const }, ...base]
      : base
  const weapons = starters.map((w, i) => makeWeapon(w.id, w.tier, i))
  const items: string[] = []
  const form: Form = 'normal'
  const stats = computeStats(
    character,
    items,
    {},
    weapons.map((w) => ({ id: w.id, tier: w.tier })),
    form,
  )
  const player: Player = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    r: 17,
    hp: stats.maxHp,
    stats,
    character,
    form,
    model,
    weapons,
    items,
    materials: character.special === 'startRich' ? START_RICH : 0,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    invuln: 0,
    regenAcc: 0,
    anim: createAnim(0),
    pendingLevelUps: 0,
    facingAngle: 0,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    materialsCollected: 0,
  }
  bonusByPlayer.set(player, {})
  resetMultiArm()
  extraByPlayer.set(player, {
    squashT: 1,
    matHeal: 0,
    blinkWait: 4,
    screamLeft: 0,
    flinchT: 0,
    wasMoving: false,
    footAcc: 0,
  })
  return player
}

export function recomputeStats(player: Player): void {
  const prevMax = player.stats.maxHp
  const bonus = getLevelBonus(player)
  player.stats = computeStats(
    player.character,
    player.items,
    bonus,
    player.weapons.map((w) => ({ id: w.id, tier: w.tier })),
    player.form,
  )
  const delta = player.stats.maxHp - prevMax
  if (delta > 0) player.hp += delta
  player.hp = clamp(player.hp, 0, player.stats.maxHp)
}

export function healPlayer(world: World, amount: number, ctx: SimCtx): number {
  const player = world.player
  if (amount <= 0) return 0
  if (player.character.special === 'noHealing') return 0
  if (player.hp <= 0) return 0
  const prev = player.hp
  player.hp = Math.min(player.stats.maxHp, player.hp + amount)
  const gained = player.hp - prev
  if (gained > 0) {
    ctx.render.fx.damageNumber(player.x, player.y - 22, Math.round(gained), { heal: true })
  }
  return gained
}

export function addXp(player: Player, amount: number, ctx: SimCtx): void {
  if (amount <= 0) return
  player.xp += amount * (1 + player.stats.xpGain / 100)
  let guard = 0
  while (player.xp >= player.xpNext && guard < 40) {
    guard += 1
    player.xp -= player.xpNext
    player.level += 1
    player.pendingLevelUps += 1
    player.xpNext = xpForLevel(player.level)
    ctx.audio.play('levelUp')
    ctx.render.fx.text(player.x, player.y - 36, 'GROWTH', player.character.palette.accent)
    ctx.render.fx.sparkle(player.x, player.y, player.character.palette.accent)
    ctx.render.fx.shockwave(player.x, player.y, 90, player.character.palette.accent)
    ctx.render.fx.inkBloom(player.x, player.y, player.character.palette.accent, 42)
  }
}

export function countSpecial(player: Player, special: ItemSpecial): number {
  let n = 0
  for (const id of player.items) {
    const def = ITEMS[id]
    if (!def || def.special !== special) continue
    n += 1
    if (def.maxStacks !== undefined && n >= def.maxStacks) return def.maxStacks
  }
  return n
}

function stepPlayerSheet(world: World, dt: number, ctx: SimCtx): void {
  const player = world.player
  const armed = potatoMultiArm(player.character.species)
  const sheet = armed ? multiArmSheet(player.character.species) : resolveSheet(sheetKeysForPlayer(player.character.species, player.model))
  if (!sheet) return
  const anim = player.anim
  const swinging = player.weapons.some((w) => w.swingT >= 0)
  const dead = anim.deathT >= 0 || player.hp <= 0
  const hurtClip = !dead && !!sheet.manifest.clips.hurt
  const hurtPlaying = hurtClip && actorClipActive('player', 'hurt')
  const kicked = hurtClip && consumeHurtKick('player')
  // Cream is only the first hurt cell. A second hit during the recovery must not rewind it.
  if (kicked && !hurtPlaying) restartActorClip('player', 'hurt')
  // The potato's attack lives on each arm. The body stays on walk / idle / hurt / death.
  const attacking = !armed && !!sheet.manifest.clips.attack && (swinging || actorClipActive('player', 'attack'))
  const hurt = hurtPlaying || kicked
  const clip = dead
    ? sheet.manifest.clips.death
      ? 'death'
      : null
    : hurt
      ? 'hurt'
      : attacking
        ? 'attack'
        : anim.moving && sheet.manifest.clips.walk
          ? 'walk'
          : sheet.manifest.clips.idle
            ? 'idle'
            : null
  const flash = (events: string[], from: string) => {
    if (!events.includes('spawnFx')) return
    if (from === 'death') ctx.render.fx.inkBurst(player.x, player.y, player.r * 1.6)
    else {
      const ang = player.facingAngle
      ctx.render.fx.muzzleFlash(player.x + Math.cos(ang) * 16, player.y + Math.sin(ang) * 10, ang)
    }
  }
  if (hurt && attacking) {
    const ev = advanceActorSheet('player', sheet, 'attack', dt)
    flash(ev, 'attack')
    if (ev.includes('release')) notePlayerRelease()
  }
  if (clip) {
    // Walk keeps the phase it had before idle, hurt, or attack. Rate matches
    // travel speed so the feet don't skate at a crawl or a sprint.
    const spd = Math.hypot(player.vx, player.vy)
    const cruise = BASE_SPEED * (1 + player.stats.speed / 100)
    const walkRate = clamp(cruise > 1 ? spd / cruise : 1, 0.45, 1.7)
    const ev = advanceActorSheet('player', sheet, clip, dt, walkRate)
    flash(ev, clip)
    if (clip === 'attack' && ev.includes('release')) notePlayerRelease()
  }
  anim.bob = 0
  anim.squash = 1
}

export function updatePlayer(world: World, dt: number, move: Vec, ctx: SimCtx): void {
  const player = world.player
  const anim = player.anim
  anim.t += dt
  if (anim.spawnT < 1) anim.spawnT = Math.min(1, anim.spawnT + dt / 0.4)

  const extra = extraState(player)
  extra.flinchT = Math.max(0, extra.flinchT - dt)
  if (extra.screamLeft > 0) extra.screamLeft = Math.max(0, extra.screamLeft - dt)

  if (player.hp <= 0) {
    player.vx = 0
    player.vy = 0
    anim.moving = false
    anim.bob = 0
    anim.kick.x = damp(anim.kick.x, 0, 8, dt)
    anim.kick.y = damp(anim.kick.y, 0, 8, dt)
    if (anim.deathT < 0) anim.deathT = 0
    anim.deathT = Math.min(1, anim.deathT + dt / 0.55)
    anim.scream = -1
    anim.mouth = 0.2
    stepPlayerSheet(world, dt, ctx)
    return
  }

  player.invuln = Math.max(0, player.invuln - dt)
  anim.hitFlash = Math.max(0, anim.hitFlash - dt * 4)

  const maxSpeed = BASE_SPEED * (1 + player.stats.speed / 100)
  const mag = Math.hypot(move.x, move.y)
  if (mag > 0.08) {
    const nx = move.x / mag
    const ny = move.y / mag
    player.vx += nx * MOVE_ACCEL * dt
    player.vy += ny * MOVE_ACCEL * dt
    const spd = Math.hypot(player.vx, player.vy)
    if (spd > maxSpeed) {
      const s = maxSpeed / spd
      player.vx *= s
      player.vy *= s
    }
  } else {
    player.vx = damp(player.vx, 0, MOVE_FRICTION, dt)
    player.vy = damp(player.vy, 0, MOVE_FRICTION, dt)
  }

  player.x += player.vx * dt
  player.y += player.vy * dt
  player.x = clamp(player.x, -world.arenaHalfW + player.r, world.arenaHalfW - player.r)
  player.y = clamp(player.y, -world.arenaHalfH + player.r, world.arenaHalfH - player.r)

  const spd = Math.hypot(player.vx, player.vy)
  anim.moving = spd > 18
  if (anim.moving) {
    player.facingAngle = Math.atan2(player.vy, player.vx)
    anim.bob = Math.sin(anim.t * 13) * 3.6
  } else {
    anim.bob = Math.sin(anim.t * 2.3) * 1.4
  }

  if (anim.moving && !extra.wasMoving) {
    extra.squashT = 0
    ctx.render.fx.dust(player.x, player.y + player.r * 0.55, -player.vx * 0.12, -player.vy * 0.08)
  } else if (!anim.moving && extra.wasMoving) {
    extra.squashT = 0
    ctx.render.fx.dust(player.x, player.y + player.r * 0.5, player.vx * 0.08, -8)
  }
  extra.wasMoving = anim.moving

  if (Math.abs(player.vx) > 10) {
    const next: 1 | -1 = player.vx >= 0 ? 1 : -1
    if (next !== anim.facing) {
      anim.facing = next
      extra.squashT = 0
      ctx.render.fx.dust(player.x, player.y + player.r * 0.5, -player.vx * 0.1, 0)
    }
  }

  if (anim.moving && spd > FEEL.motion.dustSpeed) {
    extra.footAcc += dt
    if (extra.footAcc >= FEEL.motion.footEvery) {
      extra.footAcc = 0
      const side = anim.gait > 0.5 ? 1 : -1
      ctx.render.fx.footprint(player.x + side * 5 * anim.facing, player.y + player.r * 0.55)
    }
  } else {
    extra.footAcc = 0
  }

  extra.squashT = Math.min(1, extra.squashT + dt / SQUASH_TIME)
  const punch = extra.squashT < 1 ? ease.punch(extra.squashT) * 0.42 : 0
  const runStretch = anim.moving ? 0.06 : 0
  const breathe = anim.moving ? 0 : Math.sin(anim.t * 2.1) * 0.03
  anim.squash = 1 + punch + breathe + runStretch

  anim.kick.x = damp(anim.kick.x, 0, 9, dt)
  anim.kick.y = damp(anim.kick.y, 0, 9, dt)

  if (player.stats.hpRegen > 0 && player.hp < player.stats.maxHp) {
    const interval = Math.max(0.5, 5 - player.stats.hpRegen * 0.25)
    player.regenAcc += dt
    if (player.regenAcc >= interval) {
      player.regenAcc -= interval
      healPlayer(world, 1, ctx)
    }
  }

  player.facingAngle = wrapAngle(player.facingAngle)

  stepPlayerSheet(world, dt, ctx)

  const screaming = extra.screamLeft > 0
  tickFaceAnim(anim, dt, extra, {
    moving: anim.moving,
    speed: spd,
    form: player.form,
    screaming,
    screamProgress: screaming ? 1 - extra.screamLeft / 0.5 : 0,
    flinchT: extra.flinchT,
    nextBlink: () => ctx.rng.range(3, 6),
  })
}
