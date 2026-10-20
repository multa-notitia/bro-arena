import { clamp, dist } from '../core/math.ts'
import type { Enemy, World } from '../core/types.ts'
import { CHAOS } from '../data/chaos.ts'
import { enemyFamily, variantTone } from '../data/enemies.ts'
import { hasClip, resolveEnemySheet } from '../render/chaosSheets.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import { actorClipDone, drawNamedClip, restartActorClip, resolveSheet } from '../render/sheets.ts'
import { drawGardenPeaBush } from './garden.ts'
import type { SimCtx } from './world.ts'

type BurrowPhase = 'none' | 'burrow' | 'under' | 'warn' | 'rise' | 'peel'

interface DirtPuff {
  x: number
  y: number
  a: number
}

interface FamilyLive {
  hidden: boolean
  untargetable: boolean
  peeled: boolean
  gasFired: boolean
  phase: BurrowPhase
  burrowCd: number
  warnT: number
  warnX: number
  warnY: number
  trail: DirtPuff[]
  bush: { x: number; y: number; a: number } | null
  tickAcc: number
  pendingHit: boolean
}

interface GasCloud {
  x: number
  y: number
  r: number
  life: number
  max: number
  mud: boolean
  key: string
  sheet: string
}

const live = new WeakMap<Enemy, FamilyLive>()
const clouds: GasCloud[] = []
let gasT = 0
let gasMud = false
let nextGas = 1

function fam(e: Enemy): FamilyLive {
  let x = live.get(e)
  if (!x) {
    x = {
      hidden: false,
      untargetable: false,
      peeled: false,
      gasFired: false,
      phase: 'none',
      burrowCd: 2.4,
      warnT: 0,
      warnX: 0,
      warnY: 0,
      trail: [],
      bush: null,
      tickAcc: 0,
      pendingHit: false,
    }
    live.set(e, x)
  }
  return x
}

export function resetFamilies(): void {
  clouds.length = 0
  gasT = 0
  gasMud = false
}

export function familyHidden(e: Enemy): boolean {
  return live.get(e)?.hidden === true
}

export function familyUntargetable(e: Enemy): boolean {
  const x = live.get(e)
  return !!x && (x.hidden || x.untargetable)
}

export function familyPeeled(e: Enemy): boolean {
  return live.get(e)?.peeled === true
}

export function takeFamilyHit(e: Enemy): boolean {
  const x = live.get(e)
  if (!x?.pendingHit) return false
  x.pendingHit = false
  return true
}

export function familyBush(e: Enemy): { x: number; y: number; a: number } | null {
  return live.get(e)?.bush ?? null
}

export function playerGasSlow(): number {
  return gasT > 0 ? CHAOS.families.onion.slow : 1
}

export function markPeaBush(e: Enemy): void {
  if (enemyFamily(e.kind) !== 'pea') return
  fam(e).bush = { x: e.x, y: e.y, a: 1 }
}

export function familyClip(e: Enemy, clip: string | null): string | null {
  if (!clip) return clip
  const x = live.get(e)
  if (!x) return clip
  if (x.phase === 'burrow') return 'burrow'
  if (x.phase === 'rise') return 'resurface'
  if (x.phase === 'peel') return 'peel'
  if (x.hidden) return null
  if (x.peeled) {
    if (clip === 'idle') return 'idle_peeled'
    if (clip === 'walk') return 'walk_peeled'
    if (clip === 'hurt') return 'hurt_peeled'
    if (clip === 'turn') {
      const sheet = resolveEnemySheet(e.kind, e.form)
      if (hasClip(sheet, 'turn_peeled')) return 'turn_peeled'
    }
    if (clip === 'death' || clip === 'death_slice' || clip === 'death_smash') {
      const peeled = `${clip}_peeled`
      const sheet = resolveEnemySheet(e.kind, e.form)
      if (hasClip(sheet, peeled)) return peeled
    }
  }
  return clip
}

export function armOnionGas(e: Enemy): void {
  fam(e).gasFired = false
}

export function maybePeel(e: Enemy): void {
  if (enemyFamily(e.kind) !== 'onion') return
  if (variantTone(e.kind) !== 'light') return
  const x = fam(e)
  if (x.peeled || x.phase === 'peel') return
  if (e.hp / Math.max(1, e.maxHp) > CHAOS.families.onion.peelAt) return
  const sheet = resolveEnemySheet(e.kind, e.form)
  if (!hasClip(sheet, 'peel')) {
    x.peeled = true
    e.speed = CHAOS.pace.enemy.onionPeeled ?? 100
    return
  }
  x.phase = 'peel'
  x.tickAcc = 0
  e.state = 'peeling'
  e.vx = 0
  e.vy = 0
  restartActorClip(`e:${e.uid}`, 'peel')
}

export function familyEvents(_world: World, e: Enemy, clip: string, events: readonly string[], _ctx: SimCtx): void {
  const family = enemyFamily(e.kind)
  const x = fam(e)
  if (family === 'beetroot') {
    if (events.includes('burrow')) x.untargetable = true
    if (events.includes('burrowed')) {
      x.hidden = true
      x.untargetable = true
      x.phase = 'under'
    }
    if (clip === 'resurface' && events.includes('hit')) x.pendingHit = true
    if (clip === 'resurface' && events.includes('emerged')) {
      x.hidden = false
      x.untargetable = false
      x.phase = 'none'
      e.state = 'chase'
    }
  }
  if (family === 'onion') {
    if (events.includes('peel')) spawnFunnyClip('dust', e.x, e.y + 4, { scale: 0.18 })
    if (events.includes('gas')) spawnOnionGas(e)
  }
}

function spawnOnionGas(e: Enemy): void {
  const x = fam(e)
  if (x.gasFired) return
  x.gasFired = true
  const mud = variantTone(e.kind) === 'mud'
  const sheetId = `enemy-${e.kind}`
  const key = `gas:${nextGas++}`
  restartActorClip(key, 'gas_cloud')
  clouds.push({
    x: e.x,
    y: e.y,
    r: CHAOS.families.onion.gasR,
    life: CHAOS.families.onion.gasLife,
    max: CHAOS.families.onion.gasLife,
    mud,
    key,
    sheet: sheetId,
  })
}

export function tickFamily(world: World, e: Enemy, dt: number, ctx: SimCtx): boolean {
  const family = enemyFamily(e.kind)
  const x = fam(e)
  if (x.bush) {
    if (e.state !== 'spawning') x.bush.a = Math.max(0, x.bush.a - dt / CHAOS.families.pea.bushFade)
    if (x.bush.a <= 0) x.bush = null
  }
  if (family === 'onion' && x.phase === 'peel') {
    x.tickAcc += dt
    e.vx = 0
    e.vy = 0
    e.state = 'peeling'
    if (actorClipDone(`e:${e.uid}`, 'peel') || x.tickAcc > 0.9) {
      x.phase = 'none'
      x.peeled = true
      x.tickAcc = 0
      e.state = 'chase'
      e.speed = CHAOS.pace.enemy.onionPeeled ?? 100
    }
    return true
  }
  if (family !== 'beetroot') return false
  if (e.state === 'spawning' || e.state === 'dying' || e.state === 'screaming') return false
  if (e.state === 'windup' || e.state === 'charging' || e.state === 'shooting') return false

  const p = world.player
  const cfg = CHAOS.families.beetroot
  if (x.phase === 'burrow') {
    x.tickAcc += dt
    e.vx = 0
    e.vy = 0
    if ((actorClipDone(`e:${e.uid}`, 'burrow') && x.phase === 'burrow') || x.tickAcc > 1.1) {
      x.hidden = true
      x.untargetable = true
      x.phase = 'under'
      x.tickAcc = 0
    }
    return true
  }
  if (x.phase === 'under') {
    x.tickAcc += dt
    const ang = Math.atan2(p.y - e.y, p.x - e.x)
    const spd = cfg.underSpeed
    e.x += Math.cos(ang) * spd * dt
    e.y += Math.sin(ang) * spd * dt
    e.vx = 0
    e.vy = 0
    x.trail.push({ x: e.x, y: e.y, a: 1 })
    if (x.trail.length > 18) x.trail.shift()
    for (const puff of x.trail) puff.a -= dt * 1.4
    x.trail = x.trail.filter((t) => t.a > 0)
    const close = dist(e.x, e.y, p.x, p.y) < 22
    if (close || x.tickAcc > 2.4) {
      x.phase = 'warn'
      x.warnT = close ? cfg.warn : Math.min(0.35, cfg.warn)
      x.warnX = p.x
      x.warnY = p.y
      x.tickAcc = 0
    }
    return true
  }
  if (x.phase === 'warn') {
    e.vx = 0
    e.vy = 0
    x.warnT -= dt
    x.warnX += (p.x - x.warnX) * Math.min(1, dt * 6)
    x.warnY += (p.y - x.warnY) * Math.min(1, dt * 6)
    if (x.warnT <= 0) {
      e.x = x.warnX
      e.y = x.warnY
      x.hidden = false
      x.phase = 'rise'
      x.tickAcc = 0
      e.state = 'resurfacing'
      restartActorClip(`e:${e.uid}`, 'resurface')
    }
    return true
  }
  if (x.phase === 'rise') {
    x.tickAcc += dt
    e.vx = 0
    e.vy = 0
    e.state = 'resurfacing'
    if (actorClipDone(`e:${e.uid}`, 'resurface') || x.tickAcc > 1.2) {
      x.phase = 'none'
      x.hidden = false
      x.untargetable = false
      x.tickAcc = 0
      e.state = 'chase'
      x.burrowCd = ctx.rng.range(cfg.interval[0], cfg.interval[1])
    }
    return true
  }

  x.burrowCd -= dt
  const melee = dist(e.x, e.y, p.x, p.y) <= e.r + p.r + 28
  if (!melee && x.burrowCd <= 0) {
    const sheet = resolveEnemySheet(e.kind, e.form)
    if (hasClip(sheet, 'burrow')) {
      x.phase = 'burrow'
      x.tickAcc = 0
      x.burrowCd = ctx.rng.range(cfg.interval[0], cfg.interval[1])
      e.state = 'burrowing'
      e.vx = 0
      e.vy = 0
      restartActorClip(`e:${e.uid}`, 'burrow')
      return true
    }
  }
  return false
}

let mudNeedTick = false

export function tickGas(world: World, dt: number): void {
  const p = world.player
  let inside = false
  let mud = false
  const keep: GasCloud[] = []
  for (const c of clouds) {
    c.life -= dt
    if (c.life <= 0) continue
    keep.push(c)
    if (p.hp <= 0) continue
    if (dist(c.x, c.y, p.x, p.y) <= c.r + p.r) {
      inside = true
      if (c.mud) mud = true
    }
  }
  clouds.length = 0
  clouds.push(...keep)
  if (inside) {
    gasT = CHAOS.families.onion.gasLife
    gasMud = mud
  } else {
    gasT = Math.max(0, gasT - dt)
    if (gasT <= 0) gasMud = false
  }
  mudNeedTick = inside && mud && p.hp > 0 && gasMudTick(dt)
}

export function consumeGasMudTick(): boolean {
  if (!mudNeedTick) return false
  mudNeedTick = false
  return true
}

let mudAcc = 0
function gasMudTick(dt: number): boolean {
  mudAcc += dt
  if (mudAcc < 0.5) return false
  mudAcc = 0
  return true
}

export function drawFamilyGround(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const x = live.get(e)
  if (!x) return
  if (x.bush && x.bush.a > 0.02) {
    if (!drawGardenPeaBush(ctx, x.bush.x, x.bush.y, x.bush.a, e.uid)) {
      const sheet = resolveEnemySheet(e.kind, e.form)
      if (sheet && hasClip(sheet, 'prop_bush')) {
        ctx.save()
        ctx.translate(x.bush.x, x.bush.y)
        ctx.globalAlpha = x.bush.a
        drawNamedClip(ctx, sheet, `bush:${e.uid}`, 'prop_bush', 0, { scale: 0.25, alpha: 1 })
        ctx.restore()
      }
    }
  }
  const moundSheet = resolveEnemySheet(e.kind, e.form)
  const mound = moundSheet && hasClip(moundSheet, 'prop_mound')
  for (const puff of x.trail) {
    if (mound && moundSheet) {
      ctx.save()
      ctx.translate(puff.x, puff.y + 4)
      ctx.globalAlpha = 0.55 * puff.a
      drawNamedClip(ctx, moundSheet, `mound:${e.uid}:${Math.round(puff.x)}:${Math.round(puff.y)}`, 'prop_mound', 0, {
        scale: 0.25,
        alpha: 1,
      })
      ctx.restore()
    } else {
      ctx.save()
      ctx.globalAlpha = 0.28 * puff.a
      ctx.fillStyle = '#5a3a22'
      ctx.beginPath()
      ctx.ellipse(puff.x, puff.y + 4, 9 + puff.a * 4, 4.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  if (x.phase === 'warn' || (x.phase === 'rise' && x.warnT > -0.2)) {
    if (mound && moundSheet) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 14)
      ctx.save()
      ctx.translate(x.warnX, x.warnY + 6)
      ctx.globalAlpha = 0.85 * pulse
      drawNamedClip(ctx, moundSheet, `mound-warn:${e.uid}`, 'prop_mound', 0, { scale: 0.25, alpha: 1 })
      ctx.restore()
    } else {
      const pulse = 0.45 + 0.25 * Math.sin(time * 14)
      ctx.save()
      ctx.globalAlpha = 0.55 * pulse
      ctx.fillStyle = '#6a4424'
      ctx.beginPath()
      ctx.ellipse(x.warnX, x.warnY + 6, 14, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c4a070'
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.7 * pulse
      ctx.stroke()
      ctx.restore()
    }
  }
}

const GAS_CAP = 0.45
const GAS_NEAR = 0.25
const GAS_NEAR_PX = 70

export function drawGasClouds(ctx: CanvasRenderingContext2D, dt: number, heroX: number, heroY: number): void {
  for (const c of clouds) {
    const sheet = resolveSheet([c.sheet])
    if (!sheet || !sheet.manifest.clips.gas_cloud) continue
    const lifeA = Math.min(GAS_CAP, clamp(c.life / Math.max(0.2, c.max), 0, 1) * GAS_CAP)
    const d = dist(c.x, c.y, heroX, heroY)
    const t = clamp(d / GAS_NEAR_PX, 0, 1)
    const a = lifeA * t + GAS_NEAR * (1 - t)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.globalAlpha = a
    if (c.mud) ctx.filter = 'hue-rotate(70deg) saturate(1.2)'
    drawNamedClip(ctx, sheet, c.key, 'gas_cloud', dt, { scale: 0.22, alpha: 1 })
    ctx.filter = 'none'
    ctx.restore()
  }
}

export function drawGasOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (gasT <= 0) return
  const u = clamp(gasT / CHAOS.families.onion.gasLife, 0, 1)
  const mud = gasMud
  ctx.save()
  ctx.globalAlpha = 0.22 * u
  ctx.fillStyle = mud ? 'rgba(40, 90, 28, 1)' : 'rgba(210, 200, 160, 1)'
  const band = 28
  ctx.fillRect(0, 0, w, band)
  ctx.fillRect(0, h - band, w, band)
  ctx.fillRect(0, 0, band, h)
  ctx.fillRect(w - band, 0, band, h)
  ctx.globalAlpha = 0.35 * u
  ctx.strokeStyle = mud ? '#7dff6a' : '#f4efe0'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  for (let i = 0; i < 18; i++) {
    const t = i / 17
    const jagged = Math.sin(t * 22 + gasT * 18) * 10
    ctx.moveTo(t * w, 4 + jagged)
    ctx.lineTo(t * w + 8, 18 + jagged * 0.4)
  }
  ctx.stroke()
  ctx.restore()
}
