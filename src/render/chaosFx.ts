import { TAU, clamp, hashNoise } from '../core/math.ts'
import { CHAOS, chaosJuiceOn, chaosOn, fxOn } from '../data/chaos.ts'
import type { SpawnMarker, Vec } from '../core/types.ts'
import { drawNamedClip, restartActorClip, resolveSheet, spawnInkClip } from './sheets.ts'
import { dustFull, heroBurstAlpha, isSparkClip, nearHeroFx, registerDustCounter, registerSparkCounter, sparksFull, underHeroClip } from './sparkBudget.ts'

interface Decal {
  alive: boolean
  x: number
  y: number
  size: number
  color: string
  life: number
  max: number
  rot: number
  id: number
}

interface FunnyBurst {
  alive: boolean
  clip: string
  x: number
  y: number
  scale: number
  color: string
  t: number
  life: number
  loop: boolean
  key: string
}

const DECAL_CAP = CHAOS.juice.splatCap
const decals: Decal[] = []
const bursts: FunnyBurst[] = []
const BURST_CAP = 64
let nextId = 1

registerSparkCounter(() => {
  let n = 0
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (b && b.alive && isSparkClip(b.clip)) n++
  }
  return n
})

registerDustCounter(() => {
  let n = 0
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (b && b.alive && b.clip === 'dust') n++
  }
  return n
})

function funnyScale(clip: string, override?: number): number {
  if (override !== undefined) return override
  if (clip === 'pop') return CHAOS.sheets.popScale
  const sheet = resolveSheet([CHAOS.sheets.funny])
  return sheet?.manifest.drawScale ?? CHAOS.sheets.drawScale
}

function allocDecal(): Decal {
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i]
    if (d && !d.alive) return d
  }
  if (decals.length >= DECAL_CAP) {
    let worst = decals[0]!
    for (let i = 1; i < decals.length; i++) {
      const d = decals[i]!
      if (d.life < worst.life) worst = d
    }
    return worst
  }
  const d: Decal = {
    alive: true,
    x: 0,
    y: 0,
    size: 8,
    color: '#4a2018',
    life: 1,
    max: 1,
    rot: 0,
    id: nextId++,
  }
  decals.push(d)
  return d
}

function allocBurst(): FunnyBurst {
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (b && !b.alive) return b
  }
  if (bursts.length >= BURST_CAP) {
    const b = bursts[0]!
    b.alive = true
    return b
  }
  const b: FunnyBurst = {
    alive: true,
    clip: 'pop',
    x: 0,
    y: 0,
    scale: 0.35,
    color: '#fff',
    t: 0,
    life: 0.4,
    loop: false,
    key: 'fx:0',
  }
  bursts.push(b)
  return b
}

export function resetChaosFx(): void {
  for (const d of decals) d.alive = false
  for (const b of bursts) b.alive = false
}

export function spawnSplatDecal(x: number, y: number, color: string, size: number): void {
  if (!chaosJuiceOn() || !fxOn('telegraphs')) return
  const d = allocDecal()
  d.alive = true
  d.x = x
  d.y = y
  d.size = size
  d.color = color
  d.life = CHAOS.juice.splatLife
  d.max = CHAOS.juice.splatLife
  d.rot = (hashNoise(nextId, 3) - 0.5) * 1.4
  d.id = nextId++
}

function retireOldestBurst(clip: string): boolean {
  let oldest: FunnyBurst | null = null
  for (let i = 0; i < bursts.length; i++) {
    const live = bursts[i]
    if (!live || !live.alive || live.clip !== clip) continue
    if (!oldest || live.t > oldest.t) oldest = live
  }
  if (!oldest) return false
  oldest.alive = false
  return true
}

function countBursts(clip: string): number {
  let n = 0
  for (let i = 0; i < bursts.length; i++) {
    const live = bursts[i]
    if (live && live.alive && live.clip === clip) n++
  }
  return n
}

export function spawnFunnyClip(
  name: string,
  x: number,
  y: number,
  opts?: { scale?: number; color?: string; loopLife?: number },
): boolean {
  if (!chaosOn()) return false
  // Pale death ghosts (and the white circle fallback) read as enemy silhouettes.
  if (name === 'ghost') return false
  const sheet = resolveSheet([CHAOS.sheets.funny])
  const clip = sheet?.manifest.clips[name]
  if (sheet && clip) {
    if (isSparkClip(name) && sparksFull()) {
      let oldest: FunnyBurst | null = null
      for (let i = 0; i < bursts.length; i++) {
        const live = bursts[i]
        if (!live || !live.alive || !isSparkClip(live.clip)) continue
        if (!oldest || live.t > oldest.t) oldest = live
      }
      if (oldest) oldest.alive = false
      else return false
    }
    if (name === 'pop' || name === CHAOS.sheets.pop) {
      if (countBursts('pop') >= CHAOS.read.popCap && !retireOldestBurst('pop')) return false
    }
    if (name === 'dust' && dustFull() && !retireOldestBurst('dust')) return false
    const b = allocBurst()
    const idx = bursts.indexOf(b)
    b.alive = true
    b.clip = name
    b.x = x
    b.y = y
    const size = funnyScale(name, opts?.scale)
    b.scale = name === 'dust' ? size * CHAOS.read.dustSize : size
    b.color = opts?.color ?? '#fff'
    b.t = 0
    b.loop = clip.loop
    let ms = 0
    for (const f of clip.frames) ms += f.ms
    const lifeScale = isSparkClip(name) ? CHAOS.read.sparkLife : 1
    let life = opts?.loopLife ?? Math.max(0.12, (ms / 1000) * lifeScale)
    if (name === 'dust') life = Math.min(life, CHAOS.read.dustLife)
    b.life = life
    b.key = `fx:${name}:${idx}:${nextId++}`
    restartActorClip(b.key, name)
    if (name === 'pop' || name === CHAOS.sheets.pop) {
      while (countBursts('pop') > CHAOS.read.popCap) retireOldestBurst('pop')
    }
    if (name === 'dust') {
      while (countBursts('dust') > CHAOS.read.dustCap) retireOldestBurst('dust')
    }
    return true
  }
  if (name === 'dust' || name === 'mud_erupt' || name === CHAOS.sheets.mudErupt) {
    const scale = opts?.scale ?? (name === 'dust' ? CHAOS.read.dustScale : 0.5)
    if (spawnInkClip('dust', x, y + 4, { scale })) return true
  }
  if (name === 'pop' || name.startsWith('veg_burst')) {
    if (spawnInkClip('inkBurst', x, y, { scale: opts?.scale ?? 0.5 })) return true
  }
  if (name.startsWith('splat')) {
    spawnSplatDecal(x, y, opts?.color ?? '#6a2a22', 18 * (opts?.scale ?? 1))
    return true
  }
  return false
}

export function tickChaosFx(dt: number): void {
  const dlt = Math.min(0.05, Math.max(0, dt))
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i]
    if (!d || !d.alive) continue
    d.life -= dlt * CHAOS.juice.splatFade
    if (d.life <= 0) d.alive = false
  }
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (!b || !b.alive) continue
    b.t += dlt
    if (b.t >= b.life) b.alive = false
  }
}

export function drawChaosFloor(ctx: CanvasRenderingContext2D): void {
  if (!chaosOn() || !fxOn('telegraphs')) return
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i]
    if (!d || !d.alive) continue
    const u = 1 - clamp(d.life / d.max, 0, 1)
    const fade = (1 - u) * (u < 0.08 ? u / 0.08 : 1)
    ctx.globalAlpha = 0.62 * fade
    ctx.fillStyle = d.color
    ctx.beginPath()
    ctx.ellipse(d.x, d.y, d.size, d.size * 0.55, d.rot, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.32 * fade
    ctx.beginPath()
    ctx.ellipse(d.x + d.size * 0.18, d.y + 3, d.size * 0.45, d.size * 0.28, d.rot * 0.5, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function drawChaosMarker(ctx: CanvasRenderingContext2D, m: SpawnMarker, _time: number): void {
  if (!chaosOn() || !fxOn('telegraphs')) return
  const u = m.life > 0 ? clamp(m.t / m.life, 0, 1) : 1
  const look = CHAOS.telegraphLook
  const fade = Math.sin(u * Math.PI)
  ctx.save()
  ctx.translate(m.x, m.y)
  ctx.globalAlpha = look.alpha * fade
  ctx.strokeStyle = m.style === 'ring' ? '#8a4a2a' : m.style === 'patch' ? '#4a6230' : '#4a3424'
  ctx.lineWidth = look.line
  ctx.beginPath()
  ctx.ellipse(0, 3, look.rx, look.ry, 0, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = look.alpha * fade * 0.85
  ctx.beginPath()
  const cracks = look.crack
  for (let i = 0; i < cracks; i++) {
    const a = (i / cracks) * TAU + u * 0.2
    ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 1.1 + 3)
    ctx.lineTo(Math.cos(a) * look.rx, Math.sin(a) * look.ry + 3)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawLeapShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  footprint: number,
  height: number,
): void {
  if (height <= 0.5) return
  const u = clamp(height / 22, 0, 1)
  ctx.save()
  ctx.globalAlpha = 0.28 * (1 - u * 0.55)
  ctx.fillStyle = '#1a120c'
  ctx.beginPath()
  ctx.ellipse(x, y + 6, footprint * (0.55 + u * 0.25), footprint * (0.22 + u * 0.08), 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function drawFunnyBursts(
  ctx: CanvasRenderingContext2D,
  dt: number,
  hero?: Vec,
  layer?: 'near' | 'far',
): void {
  const sheet = resolveSheet([CHAOS.sheets.funny])
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (!b || !b.alive) continue
    const spark = isSparkClip(b.clip)
    const under = underHeroClip(b.clip)
    if (b.clip === 'ghost') continue
    if (hero && layer) {
      const close = nearHeroFx(b.x, b.y, hero.x, hero.y)
      if (under) {
        if (layer === 'near' && !close) continue
        if (layer === 'far' && close) continue
      } else if (layer === 'near') {
        continue
      }
    }
    const ground = b.clip.startsWith('splat') || b.clip.startsWith('veg_burst') || b.clip === 'mud_erupt' || b.clip === 'mud_hole' || b.clip.startsWith('rustle')
    if (ground && !fxOn('telegraphs')) continue
    let dim = hero && spark ? heroBurstAlpha(b.x, b.y, hero.x, hero.y) : 1
    const u = clamp(b.t / Math.max(0.001, b.life), 0, 1)
    if (b.clip === 'dust') dim *= 1 - u
    const step = spark ? dt / Math.max(0.2, CHAOS.read.sparkLife) : dt
    if (sheet?.manifest.clips[b.clip]) {
      ctx.save()
      ctx.translate(b.x, b.y)
      const painted = drawNamedClip(ctx, sheet, b.key, b.clip, step, { scale: b.scale, alpha: dim })
      ctx.restore()
      if (painted) continue
    }
    // Missing clip: skip. A white/pale fill here used to look like an enemy body.
  }
}

export function drawComboHud(ctx: CanvasRenderingContext2D, w: number, _h: number, n: number): void {
  if (n < 2 || !chaosJuiceOn() || !fxOn('combo')) return
  ctx.save()
  ctx.translate(w - 18, 86)
  ctx.fillStyle = '#efe4c8'
  ctx.strokeStyle = 'rgba(24, 12, 8, 0.7)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.font = `italic 13px Georgia, 'Palatino Linotype', serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  const label = `${n} chain`
  ctx.strokeText(label, 0, 0)
  ctx.fillText(label, 0, 0)
  ctx.restore()
}
