import { TAU, clamp, ease, hashNoise, lerp } from '../core/math.ts'
import type { DamageNumberOpts, FxApi } from '../core/types.ts'
import { n01, parseRgb, wobbleBlob } from './watercolor.ts'

const MAX_PARTICLES = 600
const MAX_STAINS = 80
const STAIN_LIFE = 2.55

type Kind = 'splat' | 'bloom' | 'spark' | 'slash' | 'thrust' | 'shock' | 'dmg' | 'text' | 'sparkle' | 'puff' | 'stain'

interface Particle {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  angle: number
  arc: number
  length: number
  color: string
  text: string
  rot: number
  id: number
  crit: boolean
  heal: boolean
  dodge: boolean
  burn: boolean
}

interface WipeBlob {
  x: number
  y: number
  r: number
  seed: number
  delay: number
}

interface Transition {
  kind: 'inkWipe' | 'fade'
  t: number
  dur: number
  onMid?: () => void
  onDone?: () => void
  midFired: boolean
  blobs: WipeBlob[]
}

function fresh(): Particle {
  return {
    kind: 'puff',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 4,
    angle: 0,
    arc: 0,
    length: 0,
    color: '#000',
    text: '',
    rot: 0,
    id: 0,
    crit: false,
    heal: false,
    dodge: false,
    burn: false,
  }
}

function reset(p: Particle): void {
  p.vx = 0
  p.vy = 0
  p.size = 4
  p.angle = 0
  p.arc = 0
  p.length = 0
  p.text = ''
  p.rot = 0
  p.crit = false
  p.heal = false
  p.dodge = false
  p.burn = false
}

export function createFx(): FxApi & { drawFloor(ctx: CanvasRenderingContext2D): void } {
  const ps: Particle[] = []
  const stains: Particle[] = []
  let nextId = 1
  let trans: Transition | null = null
  let flashColor = '#fff6e8'
  let flashA = 0

  function alloc(): Particle {
    if (ps.length >= MAX_PARTICLES) {
      let oi = 0
      let ob = ps[0]?.id ?? 0
      for (let i = 1; i < ps.length; i++) {
        const id = ps[i]?.id ?? 0
        if (id < ob) {
          ob = id
          oi = i
        }
      }
      const slot = ps[oi] ?? fresh()
      if (!ps[oi]) ps[oi] = slot
      reset(slot)
      slot.id = nextId++
      return slot
    }
    const p = fresh()
    p.id = nextId++
    ps.push(p)
    return p
  }

  const api = {
    splat(x, y, color, size, count = 8) {
      const death = count >= 8
      const n = death ? Math.max(count, 10) : Math.max(1, count)
      for (let i = 0; i < n; i++) {
        const p = alloc()
        p.kind = 'splat'
        const a = n01(i + nextId, 4) * TAU
        const spd = (0.3 + n01(i, 5) * 1.1) * size * 1.6
        p.x = x
        p.y = y
        p.vx = Math.cos(a) * spd
        p.vy = Math.sin(a) * spd
        p.size = size * (death ? 0.12 + n01(i, 6) * 0.22 : 0.08 + n01(i, 6) * 0.2)
        p.color = color
        p.life = 0.32 + n01(i, 7) * 0.5
        p.maxLife = p.life
        p.rot = (n01(i, 8) - 0.5) * 1.2
      }
      if (death) {
        if (stains.length >= MAX_STAINS) {
          let oi = 0
          let ob = stains[0]?.id ?? 0
          for (let i = 1; i < stains.length; i++) {
            const id = stains[i]?.id ?? 0
            if (id < ob) {
              ob = id
              oi = i
            }
          }
          const slot = stains[oi] ?? fresh()
          if (!stains[oi]) stains[oi] = slot
          reset(slot)
          slot.id = nextId++
          slot.kind = 'stain'
          slot.x = x
          slot.y = y
          slot.size = size * 0.95
          slot.color = color
          slot.life = STAIN_LIFE
          slot.maxLife = STAIN_LIFE
        } else {
          const s = fresh()
          s.id = nextId++
          s.kind = 'stain'
          s.x = x
          s.y = y
          s.size = size * 0.95
          s.color = color
          s.life = STAIN_LIFE
          s.maxLife = STAIN_LIFE
          stains.push(s)
        }
        const rgb = parseRgb(color)
        if (rgb.r + rgb.g + rgb.b < 220) {
          const bloom = alloc()
          bloom.kind = 'bloom'
          bloom.x = x
          bloom.y = y
          bloom.size = size * 1.35
          bloom.color = '#d9ff5c'
          bloom.life = 0.38
          bloom.maxLife = 0.38
          const puff = alloc()
          puff.kind = 'puff'
          puff.x = x
          puff.y = y
          puff.size = size * 0.9
          puff.color = '#d9ff5c'
          puff.life = 0.28
          puff.maxLife = 0.28
        }
      }
    },
    inkBloom(x, y, color, size) {
      const p = alloc()
      p.kind = 'bloom'
      p.x = x
      p.y = y
      p.size = size
      p.color = color
      p.life = 0.42
      p.maxLife = 0.42
    },
    hitSpark(x, y, angle, color) {
      for (let i = 0; i < 6; i++) {
        const p = alloc()
        p.kind = 'spark'
        const a = angle + (n01(i, 11) - 0.5) * 0.9
        const spd = 80 + n01(i, 12) * 140
        p.x = x
        p.y = y
        p.vx = Math.cos(a) * spd
        p.vy = Math.sin(a) * spd
        p.size = 3 + n01(i, 13) * 5
        p.angle = a
        p.color = color
        p.life = 0.14 + n01(i, 14) * 0.16
        p.maxLife = p.life
      }
    },
    slash(x, y, angle, arc, radius, color) {
      const p = alloc()
      p.kind = 'slash'
      p.x = x
      p.y = y
      p.angle = angle
      p.arc = arc
      p.size = radius
      p.color = color
      p.life = 0.22
      p.maxLife = 0.22
    },
    thrust(x, y, angle, length, color) {
      const p = alloc()
      p.kind = 'thrust'
      p.x = x
      p.y = y
      p.angle = angle
      p.length = length
      p.color = color
      p.life = 0.18
      p.maxLife = 0.18
    },
    shockwave(x, y, radius, color) {
      const p = alloc()
      p.kind = 'shock'
      p.x = x
      p.y = y
      p.size = radius
      p.color = color
      p.life = 0.38
      p.maxLife = 0.38
    },
    damageNumber(x, y, amount, opts?: DamageNumberOpts) {
      const p = alloc()
      p.kind = 'dmg'
      p.x = x + (hashNoise(nextId, 20) - 0.5) * 10
      p.y = y
      p.vy = -46 - (opts?.crit ? 12 : 0)
      p.vx = (hashNoise(nextId, 21) - 0.5) * 18
      p.color = '#2a221c'
      p.life = 0.85
      p.maxLife = 0.85
      p.rot = ((hashNoise(nextId, 22) - 0.5) * 12 * Math.PI) / 180
      p.crit = !!opts?.crit
      p.heal = !!opts?.heal
      p.dodge = !!opts?.dodge
      p.burn = !!opts?.burn
      if (p.dodge) p.text = 'dodge'
      else if (p.heal) p.text = `+${Math.round(amount)}`
      else p.text = String(Math.round(amount))
      p.size = p.crit ? 22 : p.dodge ? 14 : 15
    },
    text(x, y, text, color) {
      const p = alloc()
      p.kind = 'text'
      p.x = x
      p.y = y
      p.vy = -28
      p.text = text
      p.color = color
      p.life = 1.05
      p.maxLife = 1.05
      p.rot = ((hashNoise(nextId, 24) - 0.5) * 10 * Math.PI) / 180
      p.size = 15
    },
    sparkle(x, y, color) {
      const p = alloc()
      p.kind = 'sparkle'
      p.x = x
      p.y = y
      p.color = color
      p.life = 0.45
      p.maxLife = 0.45
      p.size = 5 + hashNoise(nextId, 25) * 4
      p.rot = hashNoise(nextId, 26) * TAU
    },
    puff(x, y, color, size) {
      const p = alloc()
      p.kind = 'puff'
      p.x = x
      p.y = y
      p.color = color
      p.size = size
      p.life = 0.4
      p.maxLife = 0.4
      p.vx = (hashNoise(nextId, 27) - 0.5) * 12
      p.vy = -8 - hashNoise(nextId, 28) * 16
    },
    transition(kind, onMid, onDone) {
      const blobs: WipeBlob[] = []
      if (kind === 'inkWipe') {
        for (let i = 0; i < 22; i++) {
          blobs.push({
            x: lerp(-0.15, 1.12, i / 21),
            y: n01(i, 40) * 1.05 - 0.02,
            r: 0.16 + n01(i, 41) * 0.28,
            seed: 90 + i * 17,
            delay: i * 0.012,
          })
        }
      }
      trans = {
        kind,
        t: 0,
        dur: kind === 'inkWipe' ? 1.05 : 0.7,
        onMid,
        onDone,
        midFired: false,
        blobs,
      }
    },
    flash(color, strength) {
      flashColor = color
      flashA = clamp(Math.max(flashA, strength), 0, 1)
    },
    update(dt) {
      const d = Math.min(0.05, Math.max(0, dt))
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]
        if (!p) continue
        p.life -= d
        p.x += p.vx * d
        p.y += p.vy * d
        if (p.kind === 'splat' || p.kind === 'puff') {
          p.vx *= 0.92
          p.vy *= 0.92
        }
        if (p.kind === 'dmg' || p.kind === 'text') {
          p.vy *= 0.96
        }
        if (p.life <= 0) {
          const last = ps.pop()
          if (last && last !== p) ps[i] = last
        }
      }
      for (let i = stains.length - 1; i >= 0; i--) {
        const s = stains[i]
        if (!s) continue
        s.life -= d
        if (s.life <= 0) {
          const last = stains.pop()
          if (last && last !== s) stains[i] = last
        }
      }
      flashA = Math.max(0, flashA - d * 3.2)
      if (trans) {
        trans.t += d / trans.dur
        if (!trans.midFired && trans.t >= 0.48) {
          trans.midFired = true
          trans.onMid?.()
        }
        if (trans.t >= 1) {
          const done = trans.onDone
          trans = null
          done?.()
        }
      }
    },
    drawFloor(ctx: CanvasRenderingContext2D) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      for (let i = 0; i < stains.length; i++) {
        const p = stains[i]
        if (!p) continue
        const u = 1 - clamp(p.life / p.maxLife, 0, 1)
        const fade = (1 - u) * (u < 0.12 ? u / 0.12 : 1)
        ctx.globalAlpha = 0.55 * fade
        ctx.fillStyle = p.color
        ctx.fill(wobbleBlob(p.x, p.y + 2, p.size * 0.9, p.size * 0.52, p.id, { n: 8, wobble: 0.34 }))
        ctx.globalAlpha = 0.35 * fade
        ctx.fill(wobbleBlob(p.x + p.size * 0.2, p.y + 5, p.size * 0.42, p.size * 0.28, p.id + 3, { n: 6, wobble: 0.3 }))
      }
      ctx.restore()
    },
    drawWorld(ctx) {
      ctx.save()
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        if (!p) continue
        const u = 1 - clamp(p.life / p.maxLife, 0, 1)
        const fade = 1 - u
        if (p.kind === 'splat') {
          ctx.globalAlpha = fade * 0.75
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size * (1 + u * 0.4), p.size * 0.75, p.rot, 0, TAU)
          ctx.fill()
        } else if (p.kind === 'bloom') {
          const r = p.size * (0.35 + ease.outCubic(u) * 1.1)
          ctx.globalAlpha = fade * 0.45
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = fade * 0.2
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 1.35, 0, TAU)
          ctx.fill()
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = fade
          ctx.strokeStyle = p.color
          ctx.lineWidth = 1.4
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - Math.cos(p.angle) * p.size, p.y - Math.sin(p.angle) * p.size)
          ctx.stroke()
        } else if (p.kind === 'slash') {
          ctx.globalAlpha = fade * 0.55
          ctx.strokeStyle = p.color
          ctx.lineWidth = 9 * fade
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, p.angle - p.arc * 0.5, p.angle - p.arc * 0.5 + p.arc * (0.35 + u * 0.65))
          ctx.stroke()
        } else if (p.kind === 'thrust') {
          const dx = Math.cos(p.angle)
          const dy = Math.sin(p.angle)
          const len = p.length * (0.4 + u * 0.7)
          ctx.globalAlpha = fade * 0.7
          ctx.strokeStyle = p.color
          ctx.lineWidth = 5 * fade
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + dx * len, p.y + dy * len)
          ctx.stroke()
        } else if (p.kind === 'shock') {
          const r = p.size * ease.outCubic(u)
          ctx.globalAlpha = fade * 0.55
          ctx.strokeStyle = p.color
          ctx.lineWidth = 3.2 * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, TAU)
          ctx.stroke()
        } else if (p.kind === 'puff') {
          const r = p.size * (0.6 + u * 0.9)
          ctx.globalAlpha = fade * 0.35
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, r, r * 0.75, p.rot, 0, TAU)
          ctx.fill()
        } else if (p.kind === 'sparkle') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot + u * 0.8)
          ctx.globalAlpha = fade
          ctx.strokeStyle = p.color
          ctx.lineWidth = 1.2
          const s = p.size * (1 - u * 0.3)
          ctx.beginPath()
          ctx.moveTo(-s, 0)
          ctx.lineTo(s, 0)
          ctx.moveTo(0, -s)
          ctx.lineTo(0, s)
          ctx.stroke()
          ctx.restore()
        } else if (p.kind === 'dmg' || p.kind === 'text') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.globalAlpha = fade
          let fill = p.color
          if (p.kind === 'dmg') {
            if (p.dodge) fill = '#7a7368'
            else if (p.heal) fill = '#3d7a48'
            else if (p.burn) fill = '#d06030'
            else if (p.crit) fill = '#d45a28'
            else fill = '#2a221c'
          }
          ctx.fillStyle = fill
          ctx.font = `${p.crit ? 'bold ' : 'italic '}${p.size}px Georgia, 'Palatino Linotype', 'Times New Roman', serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineJoin = 'round'
          ctx.miterLimit = 2
          ctx.strokeStyle = 'rgba(18, 12, 8, 0.88)'
          ctx.lineWidth = p.crit ? 4.2 : 3.4
          ctx.strokeText(p.text, 0, 0)
          ctx.fillText(p.text, 0, 0)
          ctx.restore()
        }
      }
      ctx.restore()
    },
    drawScreen(ctx, w, h) {
      if (flashA > 0.01) {
        ctx.save()
        ctx.globalAlpha = flashA * 0.55
        ctx.fillStyle = flashColor
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
      if (!trans) return
      const t = clamp(trans.t, 0, 1)
      if (trans.kind === 'fade') {
        const a = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = '#1a1410'
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
        return
      }
      ctx.save()
      const cover = t < 0.5 ? ease.outCubic(t / 0.5) : 1
      const exit = t < 0.5 ? 0 : ease.inQuad((t - 0.5) / 0.5)
      for (let i = 0; i < trans.blobs.length; i++) {
        const b = trans.blobs[i]
        if (!b) continue
        const local = clamp((cover - b.delay) / 0.55, 0, 1)
        if (local <= 0) continue
        const cx = (b.x + (t * 0.08 - 0.02) - exit * 0.15) * w
        const cy = b.y * h + Math.sin((t + i) * 3) * 8
        const r = b.r * Math.max(w, h) * (0.55 + local * 0.7)
        ctx.globalAlpha = (t < 0.5 ? 0.92 : 1 - exit) * 0.95
        ctx.fillStyle = i % 3 === 0 ? '#241c16' : i % 3 === 1 ? '#1a1410' : '#2c2218'
        ctx.fill(wobbleBlob(cx, cy, r, r * 0.82, b.seed, { n: 8, wobble: 0.22, rotation: t * 0.4 }))
      }
      ctx.restore()
    },
    clear() {
      ps.length = 0
      stains.length = 0
      trans = null
      flashA = 0
    },
  }

  return api
}
