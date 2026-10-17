import { TAU, clamp, ease, hashNoise } from '../core/math.ts'
import { CHAOS, chaosJuiceOn, chaosOn } from '../data/chaos.ts'
import type { SpawnMarker } from '../core/types.ts'
import { drawNamedClip, restartActorClip, resolveSheet, spawnInkClip } from './sheets.ts'

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
  if (!chaosJuiceOn()) return
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

export function spawnFunnyClip(
  name: string,
  x: number,
  y: number,
  opts?: { scale?: number; color?: string; loopLife?: number },
): boolean {
  if (!chaosOn()) return false
  const sheet = resolveSheet([CHAOS.sheets.funny])
  const clip = sheet?.manifest.clips[name]
  if (sheet && clip) {
    const b = allocBurst()
    const idx = bursts.indexOf(b)
    b.alive = true
    b.clip = name
    b.x = x
    b.y = y
    b.scale = funnyScale(name, opts?.scale)
    b.color = opts?.color ?? '#fff'
    b.t = 0
    b.loop = clip.loop
    let ms = 0
    for (const f of clip.frames) ms += f.ms
    b.life = opts?.loopLife ?? Math.max(0.12, ms / 1000)
    b.key = `fx:${name}:${idx}:${nextId++}`
    restartActorClip(b.key, name)
    return true
  }
  if (name === 'mud_erupt' || name === CHAOS.sheets.mudErupt) {
    if (spawnInkClip('dust', x, y + 4, { scale: opts?.scale ?? 0.5 })) return true
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
  if (!chaosOn()) return
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

export function drawChaosMarker(ctx: CanvasRenderingContext2D, m: SpawnMarker, time: number): void {
  if (!chaosOn()) return
  const u = m.life > 0 ? clamp(m.t / m.life, 0, 1) : 1
  const sheet = resolveSheet([CHAOS.sheets.funny])
  const plant = m.style === 'patch' || m.style === 'ring'
  ctx.save()
  ctx.translate(m.x, m.y)
  if (sheet) {
    const warn = plant ? (time % 0.7 < 0.35 ? 'rustle_a' : 'rustle_b') : 'mud_hole'
    const clip = sheet.manifest.clips[warn] ?? sheet.manifest.clips.mud_hole
    if (clip) {
      ctx.globalAlpha = 0.35 + 0.55 * Math.sin(u * Math.PI)
      drawNamedClip(ctx, sheet, `mark:${m.x}:${m.y}:${warn}`, warn, 0, {
        scale: funnyScale(warn),
      })
      ctx.restore()
      return
    }
  }
  const pulse = 0.35 + 0.65 * Math.sin(u * Math.PI)
  ctx.globalAlpha = pulse * 0.85
  ctx.strokeStyle = m.style === 'ring' ? '#c45a32' : m.style === 'patch' ? '#6a8f3a' : '#5a3a22'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.ellipse(0, 4, 12 + u * 16, 6 + u * 8, 0, 0, TAU)
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

export function drawFunnyBursts(ctx: CanvasRenderingContext2D, dt: number): void {
  const sheet = resolveSheet([CHAOS.sheets.funny])
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]
    if (!b || !b.alive) continue
    if (sheet?.manifest.clips[b.clip]) {
      ctx.save()
      ctx.translate(b.x, b.y)
      const painted = drawNamedClip(ctx, sheet, b.key, b.clip, dt, { scale: b.scale })
      ctx.restore()
      if (painted) continue
    }
    const u = clamp(b.t / b.life, 0, 1)
    const fade = 1 - u
    ctx.save()
    ctx.globalAlpha = fade * 0.85
    ctx.fillStyle = b.color
    const r = (18 + u * 28) * b.scale * 2
    ctx.beginPath()
    ctx.arc(b.x, b.y, r, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

export function drawComboHud(ctx: CanvasRenderingContext2D, w: number, h: number, n: number): void {
  if (n < 2 || !chaosJuiceOn()) return
  ctx.save()
  ctx.translate(w * 0.5, h * 0.18)
  const pop = 1 + ease.outBack(clamp(n / 20, 0, 1)) * 0.15
  ctx.scale(pop, pop)
  ctx.fillStyle = '#f4e8c8'
  ctx.strokeStyle = 'rgba(24, 12, 8, 0.85)'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.font = `italic ${Math.round(28 + Math.min(22, n))}px Georgia, 'Palatino Linotype', serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = `${n} chain`
  ctx.strokeText(label, 0, 0)
  ctx.fillText(label, 0, 0)
  ctx.restore()
}
