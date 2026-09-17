import { clamp, damp, ease, uid, wrapAngle } from '../core/math.ts'
import type {
  AnimState,
  CharacterDef,
  ItemSpecial,
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

const START_RICH = 40
const MOVE_ACCEL = 2100
const MOVE_FRICTION = 11
const BASE_SPEED = 210
const SQUASH_TIME = 0.22

const bonusByPlayer = new WeakMap<Player, Partial<Stats>>()
const extraByPlayer = new WeakMap<Player, { squashT: number; matHeal: number }>()

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
  }
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

export function extraState(player: Player): { squashT: number; matHeal: number } {
  let extra = extraByPlayer.get(player)
  if (!extra) {
    extra = { squashT: 1, matHeal: 0 }
    extraByPlayer.set(player, extra)
  }
  return extra
}

export function createPlayer(character: CharacterDef): Player {
  const weapons = character.startingWeapons.map((w, i) => makeWeapon(w.id, w.tier, i))
  const items: string[] = []
  const stats = computeStats(
    character,
    items,
    {},
    weapons.map((w) => ({ id: w.id, tier: w.tier })),
  )
  const player: Player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 17,
    hp: stats.maxHp,
    stats,
    character,
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
  extraByPlayer.set(player, { squashT: 1, matHeal: 0 })
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
    ctx.render.fx.text(player.x, player.y - 36, 'LEVEL', player.character.palette.accent)
    ctx.render.fx.sparkle(player.x, player.y, player.character.palette.accent)
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

export function updatePlayer(world: World, dt: number, move: Vec, ctx: SimCtx): void {
  const player = world.player
  const anim = player.anim
  anim.t += dt
  if (anim.spawnT < 1) anim.spawnT = Math.min(1, anim.spawnT + dt / 0.4)

  if (player.hp <= 0) {
    player.vx = 0
    player.vy = 0
    anim.moving = false
    anim.bob = Math.sin(anim.t * 2) * 0.4
    anim.kick.x = damp(anim.kick.x, 0, 8, dt)
    anim.kick.y = damp(anim.kick.y, 0, 8, dt)
    if (anim.deathT < 0) anim.deathT = 0
    anim.deathT = Math.min(1, anim.deathT + dt / 0.55)
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

  const extra = extraState(player)
  if (Math.abs(player.vx) > 10) {
    const next: 1 | -1 = player.vx >= 0 ? 1 : -1
    if (next !== anim.facing) {
      anim.facing = next
      extra.squashT = 0
    }
  }

  extra.squashT = Math.min(1, extra.squashT + dt / SQUASH_TIME)
  const punch = extra.squashT < 1 ? ease.punch(extra.squashT) * 0.32 : 0
  const breathe = anim.moving ? 0 : Math.sin(anim.t * 2.1) * 0.03
  anim.squash = 1 + punch + breathe

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
}
