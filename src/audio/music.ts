import type { MusicMood } from '../core/types.ts'
import type { NoiseBuffers } from './sfx.ts'

type LiveMood = Exclude<MusicMood, 'none'>

const LIVE: readonly LiveMood[] = ['title', 'wave', 'boss', 'shop']

const TITLE_PENTA = [220, 261.63, 293.66, 329.63, 392, 440]
const TITLE_MELODY = [
  0, -1, 2, -1, 4, -1, 3, 2, 4, -1, 5, 4, 2, 0, -1, -1, 1, -1, 2, 4, 3, -1, 2, -1, 0, 2, 4, 5, 4, 2, 0, -1,
]

export interface MusicEngine {
  attach(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers): void
  setMood(mood: MusicMood): void
}

interface Pad {
  stop(when: number): void
}

function fade(param: AudioParam, target: number, now: number, dur: number): void {
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(target, now + dur)
}

function pluck(ctx: AudioContext, dest: AudioNode, freq: number, t: number, gain: number, dur = 0.32): void {
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  const harm = ctx.createOscillator()
  harm.type = 'sine'
  harm.frequency.setValueAtTime(freq * 2, t)
  const g = ctx.createGain()
  const h = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, gain), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  h.gain.setValueAtTime(Math.max(0.0001, gain * 0.18), t)
  h.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7)
  osc.connect(g)
  harm.connect(h)
  g.connect(dest)
  h.connect(dest)
  osc.start(t)
  osc.stop(t + dur + 0.02)
  harm.start(t)
  harm.stop(t + dur + 0.02)
}

function kick(ctx: AudioContext, dest: AudioNode, t: number, gain: number): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, gain), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(g)
  g.connect(dest)
  osc.start(t)
  osc.stop(t + 0.2)
}

function hat(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, gain: number, dur = 0.04): void {
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.setValueAtTime(7000, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, gain), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(hp)
  hp.connect(g)
  g.connect(dest)
  const maxOff = Math.max(0, noise.duration - dur - 0.02)
  src.start(t, maxOff > 0 ? Math.random() * maxOff : 0)
  src.stop(t + dur + 0.01)
}

function bass(ctx: AudioContext, dest: AudioNode, freq: number, t: number, gain: number, type: OscillatorType, dur = 0.18): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(420, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, gain), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(lp)
  lp.connect(g)
  g.connect(dest)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function makeDistortion(ctx: AudioContext, amount: number): WaveShaperNode {
  const n = 256
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  const sh = ctx.createWaveShaper()
  sh.curve = curve
  sh.oversample = '2x'
  return sh
}

function startPad(
  ctx: AudioContext,
  dest: AudioNode,
  partials: readonly { freq: number; detune: number; gain: number; type: OscillatorType }[],
): Pad {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.4)
  g.connect(dest)
  const oscs: OscillatorNode[] = []
  for (const p of partials) {
    const o = ctx.createOscillator()
    o.type = p.type
    o.frequency.value = p.freq
    o.detune.value = p.detune
    const pg = ctx.createGain()
    pg.gain.value = p.gain
    o.connect(pg)
    pg.connect(g)
    o.start()
    oscs.push(o)
  }
  let stopped = false
  return {
    stop(when: number): void {
      if (stopped) return
      stopped = true
      try {
        g.gain.cancelScheduledValues(when)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), when)
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.15)
      } catch {
        // AudioParam may already be tearing down.
      }
      for (const o of oscs) {
        try {
          o.stop(when + 0.18)
        } catch {
          // already stopped
        }
      }
    },
  }
}

export function createMusic(): MusicEngine {
  let ctx: AudioContext | null = null
  let noise: NoiseBuffers | null = null
  let gains: Record<LiveMood, GainNode> | null = null
  let bossBass: AudioNode | null = null
  let mood: MusicMood = 'none'
  let pending: MusicMood | null = null
  let waveBpm = 120
  let sawWave = false
  let nextTime = 0
  let step = 0
  let hiddenSkip = false
  let timer = 0
  let pads: Pad | null = null

  function bpmFor(m: LiveMood): number {
    if (m === 'title') return 80
    if (m === 'wave') return waveBpm
    if (m === 'boss') return 138
    return 88
  }

  function startPads(m: LiveMood): void {
    if (!ctx || !gains) return
    pads?.stop(ctx.currentTime + 1.05)
    pads = null
    if (m === 'title') {
      pads = startPad(ctx, gains.title, [
        { freq: 110, detune: -6, gain: 0.045, type: 'sine' },
        { freq: 164.81, detune: 5, gain: 0.032, type: 'sine' },
        { freq: 220, detune: 0, gain: 0.028, type: 'triangle' },
      ])
    } else if (m === 'shop') {
      pads = startPad(ctx, gains.shop, [
        { freq: 130.81, detune: -4, gain: 0.03, type: 'sine' },
        { freq: 196, detune: 7, gain: 0.02, type: 'sine' },
      ])
    } else if (m === 'boss') {
      pads = startPad(ctx, gains.boss, [
        { freq: 55, detune: -11, gain: 0.05, type: 'sawtooth' },
        { freq: 55, detune: 13, gain: 0.05, type: 'sawtooth' },
      ])
    }
  }

  function scheduleTitle(t: number, s: number): void {
    if (!ctx || !gains) return
    const dest = gains.title
    const idx = TITLE_MELODY[s % TITLE_MELODY.length]!
    if (idx >= 0 && s % 2 === 0) {
      pluck(ctx, dest, TITLE_PENTA[idx]!, t, 0.09, 0.4)
    }
  }

  function scheduleWave(t: number, s: number): void {
    if (!ctx || !gains || !noise) return
    const dest = gains.wave
    const pos = s % 16
    if (pos === 0 || pos === 8) kick(ctx, dest, t, 0.28)
    if (pos % 2 === 0) hat(ctx, dest, noise.white, t, pos % 4 === 0 ? 0.035 : 0.055, 0.035)
    const bassPat = [65.41, 0, 0, 0, 65.41, 0, 0, 98, 65.41, 0, 49, 0, 87.31, 0, 65.41, 0]
    const bf = bassPat[pos]!
    if (bf > 0) bass(ctx, dest, bf, t, 0.16, 'triangle', 0.16)
    if ((pos === 4 || pos === 12) && s % 32 < 16) {
      const wavePenta = [261.63, 293.66, 329.63, 392, 440]
      pluck(ctx, dest, wavePenta[(s >> 3) % wavePenta.length]!, t, 0.055, 0.22)
    }
  }

  function scheduleBoss(t: number, s: number): void {
    if (!ctx || !gains || !noise) return
    const dest = gains.boss
    const arp = [220, 261.63, 329.63, 440]
    pluck(ctx, dest, arp[s % 4]!, t, 0.045, 0.14)
    if (s % 2 === 0) hat(ctx, dest, noise.white, t, 0.03, 0.028)
    const bassDest = bossBass ?? dest
    if (s % 16 === 0 || s % 16 === 8) {
      bass(ctx, bassDest, 55, t, 0.22, 'sawtooth', 0.28)
    } else if (s % 16 === 4 || s % 16 === 12) {
      bass(ctx, bassDest, 73.42, t, 0.14, 'sawtooth', 0.16)
    }
  }

  function scheduleShop(t: number, s: number): void {
    if (!ctx || !gains) return
    const dest = gains.shop
    const pos = s % 12
    const waltz = [261.63, 0, 0, 0, 329.63, 0, 0, 0, 392, 0, 329.63, 0]
    const f = waltz[pos]!
    if (f > 0) pluck(ctx, dest, f, t, pos === 0 ? 0.1 : 0.07, 0.45)
    if (pos === 0) bass(ctx, dest, 130.81, t, 0.1, 'sine', 0.4)
  }

  function scheduleStep(t: number, s: number, m: LiveMood): void {
    if (m === 'title') scheduleTitle(t, s)
    else if (m === 'wave') scheduleWave(t, s)
    else if (m === 'boss') scheduleBoss(t, s)
    else scheduleShop(t, s)
  }

  function tick(): void {
    timer = window.setTimeout(tick, 100)
    if (!ctx || mood === 'none' || !gains) return
    if (document.hidden) {
      hiddenSkip = true
      return
    }
    const now = ctx.currentTime
    if (hiddenSkip || nextTime < now - 0.04) {
      nextTime = now
      hiddenSkip = false
    }
    const live = mood
    const horizon = now + 0.2
    while (nextTime < horizon) {
      const human = live === 'wave' || live === 'boss' ? (Math.random() - 0.5) * 0.008 : 0
      scheduleStep(nextTime + human, step, live)
      nextTime += 60 / bpmFor(live) / 4
      step++
    }
  }

  function applyMood(next: MusicMood): void {
    if (!ctx || !gains) {
      pending = next
      return
    }
    if (next === 'wave') {
      if (sawWave) waveBpm = Math.min(150, waveBpm + 2)
      sawWave = true
    }
    if (next === mood) return
    const now = ctx.currentTime
    for (const m of LIVE) {
      fade(gains[m].gain, m === next ? 1 : 0, now, 1)
    }
    if (next === 'none') {
      pads?.stop(now + 1.05)
      pads = null
    } else {
      startPads(next)
      step = 0
      nextTime = now + 0.03
    }
    mood = next
  }

  return {
    attach(audioCtx: AudioContext, dest: AudioNode, buffers: NoiseBuffers): void {
      if (ctx) return
      ctx = audioCtx
      noise = buffers
      const gTitle = audioCtx.createGain()
      const gWave = audioCtx.createGain()
      const gBoss = audioCtx.createGain()
      const gShop = audioCtx.createGain()
      gTitle.gain.value = 0
      gWave.gain.value = 0
      gBoss.gain.value = 0
      gShop.gain.value = 0
      gTitle.connect(dest)
      gWave.connect(dest)
      gBoss.connect(dest)
      gShop.connect(dest)
      gains = { title: gTitle, wave: gWave, boss: gBoss, shop: gShop }
      const dist = makeDistortion(audioCtx, 12)
      const lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 380
      dist.connect(lp)
      lp.connect(gBoss)
      bossBass = dist
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) hiddenSkip = true
      })
      nextTime = audioCtx.currentTime
      if (!timer) timer = window.setTimeout(tick, 100)
      if (pending !== null) {
        const m = pending
        pending = null
        applyMood(m)
      }
    },
    setMood(next: MusicMood): void {
      applyMood(next)
    },
  }
}
