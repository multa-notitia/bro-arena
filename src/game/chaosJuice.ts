import { clamp, dist2 } from '../core/math.ts'
import { CHAOS, chaosJuiceOn, type DeathStyle } from '../data/chaos.ts'
import type { Enemy, JuiceFamily, World } from '../core/types.ts'
import { addTrauma, juiceScale, requestHitStopMs } from '../feel.ts'
import { spawnFunnyClip, spawnSplatDecal } from '../render/chaosFx.ts'
import { pickDeathClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import type { SimCtx } from './world.ts'

export function juiceFamilyOf(enemy: Enemy): JuiceFamily {
  if (enemy.form === 'nightmare' && enemy.def.juiceFamily !== 'red' && enemy.def.juiceFamily !== 'orange') {
    return enemy.def.juiceFamily ?? 'mud'
  }
  if (enemy.kind === 'tomato' || enemy.kind === 'crab') return 'red'
  if (enemy.kind === 'charger') return 'orange'
  return enemy.def.juiceFamily ?? 'green'
}

export function funnyBurstClip(enemy: Enemy): string {
  const fam = juiceFamilyOf(enemy)
  if (fam === 'red') return 'veg_burst_red'
  if (fam === 'orange') return 'veg_burst_orange'
  return 'veg_burst'
}

export function funnySplatClip(enemy: Enemy): string {
  if (enemy.form === 'nightmare') return 'splat_mud'
  const fam = juiceFamilyOf(enemy)
  if (fam === 'red') return 'splat_red'
  if (fam === 'orange') return 'splat_orange'
  if (fam === 'mud') return 'splat_mud'
  return 'splat_green'
}

interface ComboState {
  count: number
  t: number
  best: number
}

const combo: ComboState = { count: 0, t: 0, best: 0 }
const deathStyle = new WeakMap<Enemy, DeathStyle>()
const kamikazeCorpse = new WeakSet<Enemy>()

export function resetChaosJuice(): void {
  combo.count = 0
  combo.t = 0
  combo.best = 0
}

export function tickChaosJuice(dt: number): void {
  if (combo.t <= 0) return
  combo.t -= dt
  if (combo.t <= 0) combo.count = 0
}

export function comboCount(): number {
  return combo.count
}

export function comboPitch(): number {
  if (!chaosJuiceOn() || combo.count <= 1) return 1
  return Math.min(CHAOS.juice.comboPitchMax, 1 + (combo.count - 1) * CHAOS.juice.comboPitch)
}

export function rememberDeathStyle(enemy: Enemy, style: DeathStyle): void {
  deathStyle.set(enemy, style)
}

export function deathStyleOf(enemy: Enemy): DeathStyle {
  return deathStyle.get(enemy) ?? 'normal'
}

export function deathClipName(enemy: Enemy): string | null {
  if (!CHAOS.death.enabled) {
    const sheet = resolveEnemySheet(enemy.kind, enemy.form)
    return sheet?.manifest.clips.death ? 'death' : null
  }
  return pickDeathClip(resolveEnemySheet(enemy.kind, enemy.form), deathStyleOf(enemy))
}

/** Tomato-light pop keeps the attack clip as the corpse. */
export function markKamikazeCorpse(enemy: Enemy): void {
  kamikazeCorpse.add(enemy)
}

export function isKamikazeCorpse(enemy: Enemy): boolean {
  return kamikazeCorpse.has(enemy)
}

export function corpseClipName(enemy: Enemy): string | null {
  if (kamikazeCorpse.has(enemy)) return 'attack'
  return deathClipName(enemy)
}

export function juiceColorOf(enemy: Enemy): string {
  return enemy.def.juiceColor ?? enemy.def.palette.body
}

/** 30–60 ms freeze, replaced (not stacked) so 200-enemy volleys stay at 60. */
export function juiceHitStop(damage: number, killed: boolean): void {
  if (!chaosJuiceOn()) return
  const j = CHAOS.juice
  const t = clamp(damage / 28, 0, 1)
  let ms = j.hitStopMin + (j.hitStopMax - j.hitStopMin) * t
  if (killed) ms = Math.min(j.hitStopMax, ms + 0.012)
  requestHitStopMs(ms * juiceScale(), j.hitStopReplace)
}

export function juiceHitFeel(
  world: World,
  enemy: Enemy,
  damage: number,
  kx: number,
  ky: number,
  crit: boolean,
): void {
  if (!chaosJuiceOn()) return
  const j = CHAOS.juice
  enemy.anim.squash = Math.min(enemy.anim.squash, j.squash * (crit ? 0.88 : 1))
  const trauma = (crit ? j.traumaHit * 1.6 : j.traumaHit) * (0.55 + clamp(damage / 24, 0, 1) * 0.45)
  addTrauma(world, trauma * 16, kx, ky)
  spawnSplatDecal(enemy.x, enemy.y + 4, juiceColorOf(enemy), Math.min(16, 5 + damage * 0.35))
  spawnFunnyClip(funnySplatClip(enemy), enemy.x, enemy.y + 4, { scale: CHAOS.sheets.drawScale * 0.7 })
}

export function juiceOnKill(world: World, enemy: Enemy, ctx: SimCtx, damage: number): void {
  if (!chaosJuiceOn()) return
  const j = CHAOS.juice
  combo.count += 1
  combo.t = j.comboWindow
  if (combo.count > combo.best) combo.best = combo.count
  const elite = enemy.elite || enemy.boss
  const trauma = enemy.boss ? j.traumaBoss : elite ? j.traumaElite : j.traumaKill
  addTrauma(world, trauma * 16, enemy.x - world.player.x, enemy.y - world.player.y)
  const color = juiceColorOf(enemy)
  spawnSplatDecal(enemy.x, enemy.y + 6, color, enemy.r * 1.4)
  spawnFunnyClip(CHAOS.sheets.pop, enemy.x, enemy.y, { scale: CHAOS.sheets.popScale, color })
  spawnFunnyClip(funnyBurstClip(enemy), enemy.x, enemy.y, { scale: CHAOS.sheets.drawScale, color })
  spawnFunnyClip(funnySplatClip(enemy), enemy.x, enemy.y + 4, { scale: CHAOS.sheets.drawScale, color })
  spawnFunnyClip('ghost', enemy.x, enemy.y - 4, { scale: CHAOS.sheets.drawScale, color })
  const big = elite || enemy.maxHp >= j.bigKillHp || damage >= 22
  if (big) {
    spawnFunnyClip('stars', enemy.x, enemy.y, { scale: CHAOS.sheets.drawScale, color })
    ctx.render.fx.shockwave(enemy.x, enemy.y, j.bigKillRadius * (enemy.boss ? 1.4 : 1), color)
  }
}

export function chainBurst(world: World, enemy: Enemy, ctx: SimCtx, sourceDamage: number): void {
  if (!chaosJuiceOn()) return
  const def = enemy.def.burst
  const kamikaze = !!(def?.kamikaze || (enemy.def.behavior.type === 'chase' && enemy.kind === 'brute'))
  const burstingKind = !!def || kamikaze || enemy.kind === 'spitter' || enemy.kind === 'hive'
  if (!burstingKind) return
  const radius = def?.radius ?? CHAOS.juice.chainRadius * (enemy.elite ? 1.35 : 1)
  const splash = Math.max(3, Math.round(sourceDamage * (def?.damageFrac ?? CHAOS.juice.chainFrac)))
  const color = juiceColorOf(enemy)
  ctx.render.fx.shockwave(enemy.x, enemy.y, radius, color)
  spawnFunnyClip(CHAOS.sheets.pop, enemy.x, enemy.y, { scale: CHAOS.sheets.popScale, color })
  spawnFunnyClip(funnyBurstClip(enemy), enemy.x, enemy.y, { scale: CHAOS.sheets.drawScale, color })
  spawnSplatDecal(enemy.x, enemy.y, color, radius * 0.22)
  ctx.audio.play('hit', { pitch: 0.62, gain: 0.85 })
  for (const other of world.enemies) {
    if (other === enemy || other.state === 'dying' || other.state === 'spawning') continue
    if (dist2(enemy.x, enemy.y, other.x, other.y) > radius * radius) continue
    other.hp -= splash
    other.anim.hitFlash = 1
    other.anim.squash = CHAOS.juice.squash
    other.knock.x += (other.x - enemy.x) * 0.35
    other.knock.y += (other.y - enemy.y) * 0.35
    ctx.render.fx.damageNumber(other.x, other.y - other.r - 4, splash)
    if (other.hp <= 0) other.hp = 0
  }
}
