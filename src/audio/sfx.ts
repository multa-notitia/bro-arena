import type { SfxName } from '../core/types.ts'

export interface NoiseBuffers {
  white: AudioBuffer
  brown: AudioBuffer
}

type Synth = (
  ctx: AudioContext,
  dest: AudioNode,
  noise: NoiseBuffers,
  t0: number,
  pitch: number,
  vol: number,
) => number

function makeColoredNoise(ctx: AudioContext, seconds: number, color: 'white' | 'brown'): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'white') {
      data[i] = w
    } else {
      last += 0.02 * w
      last /= 1.02
      const v = last * 3.5
      data[i] = v > 1 ? 1 : v < -1 ? -1 : v
    }
  }
  return buf
}

export function createNoiseBuffers(ctx: AudioContext): NoiseBuffers {
  return {
    white: makeColoredNoise(ctx, 1.4, 'white'),
    brown: makeColoredNoise(ctx, 1.4, 'brown'),
  }
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  opts: {
    type?: OscillatorType
    freq: number
    freqEnd?: number
    dur: number
    gain: number
    attack?: number
    detune?: number
    filter?: BiquadFilterType
    filterFreq?: number
    filterFreqEnd?: number
    filterQ?: number
  },
): void {
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  const f0 = Math.max(1, opts.freq)
  osc.frequency.setValueAtTime(f0, t0)
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur)
  }
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0)
  const g = ctx.createGain()
  const atk = Math.max(0.003, opts.attack ?? 0.006)
  const peak = Math.max(0.0001, opts.gain)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  let head: AudioNode = osc
  if (opts.filter && opts.filterFreq) {
    const bp = ctx.createBiquadFilter()
    bp.type = opts.filter
    bp.Q.value = opts.filterQ ?? 1
    bp.frequency.setValueAtTime(Math.max(1, opts.filterFreq), t0)
    if (opts.filterFreqEnd) {
      bp.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterFreqEnd), t0 + opts.dur)
    }
    osc.connect(bp)
    head = bp
  }
  head.connect(g)
  g.connect(dest)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.02)
}

function burst(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  t0: number,
  opts: {
    dur: number
    gain: number
    attack?: number
    filter?: BiquadFilterType
    filterFreq?: number
    filterFreqEnd?: number
    filterQ?: number
  },
): void {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const g = ctx.createGain()
  const atk = Math.max(0.002, opts.attack ?? 0.008)
  const peak = Math.max(0.0001, opts.gain)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  let head: AudioNode = src
  if (opts.filter && opts.filterFreq) {
    const bp = ctx.createBiquadFilter()
    bp.type = opts.filter
    bp.Q.value = opts.filterQ ?? 1
    bp.frequency.setValueAtTime(Math.max(1, opts.filterFreq), t0)
    if (opts.filterFreqEnd) {
      bp.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterFreqEnd), t0 + opts.dur)
    }
    src.connect(bp)
    head = bp
  }
  head.connect(g)
  g.connect(dest)
  const maxOff = Math.max(0, buffer.duration - opts.dur - 0.03)
  src.start(t0, maxOff > 0 ? Math.random() * maxOff : 0)
  src.stop(t0 + opts.dur + 0.02)
}

function sSwing(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.2
  burst(ctx, dest, noise.white, t0, {
    dur,
    gain: 0.32 * vol,
    attack: 0.012,
    filter: 'bandpass',
    filterFreq: 380 * pitch,
    filterFreqEnd: 2100 * pitch,
    filterQ: 5,
  })
  return dur
}

function sStab(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.white, t0, {
    dur: 0.04,
    gain: 0.28 * vol,
    attack: 0.002,
    filter: 'highpass',
    filterFreq: 1800 * pitch,
    filterQ: 0.7,
  })
  tone(ctx, dest, t0, {
    type: 'triangle',
    freq: 760 * pitch,
    freqEnd: 220 * pitch,
    dur: 0.09,
    gain: 0.22 * vol,
    attack: 0.003,
  })
  return 0.1
}

function sShoot(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.1
  tone(ctx, dest, t0, {
    type: 'square',
    freq: 880 * pitch,
    freqEnd: 210 * pitch,
    dur,
    gain: 0.14 * vol,
    attack: 0.004,
    filter: 'lowpass',
    filterFreq: 2400,
  })
  return dur
}

function sShotgun(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.22
  burst(ctx, dest, noise.white, t0, {
    dur,
    gain: 0.4 * vol,
    attack: 0.003,
    filter: 'lowpass',
    filterFreq: 900 * pitch,
    filterFreqEnd: 220 * pitch,
    filterQ: 0.8,
  })
  burst(ctx, dest, noise.brown, t0, {
    dur: 0.16,
    gain: 0.28 * vol,
    attack: 0.002,
    filter: 'lowpass',
    filterFreq: 280 * pitch,
  })
  return dur
}

function sBolt(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.14
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 420 * pitch,
    freqEnd: 1680 * pitch,
    dur,
    gain: 0.22 * vol,
    attack: 0.008,
  })
  return dur
}

function sZap(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.18
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(480 * pitch, t0)
  osc.frequency.exponentialRampToValueAtTime(160 * pitch, t0 + dur)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.Q.value = 4
  filt.frequency.setValueAtTime(1100 * pitch, t0)
  filt.frequency.exponentialRampToValueAtTime(500 * pitch, t0 + dur)
  const g = ctx.createGain()
  const peak = Math.max(0.0001, 0.16 * vol)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006)
  for (let i = 1; i <= 7; i++) {
    const t = t0 + i * 0.02
    g.gain.exponentialRampToValueAtTime(0.012 * vol + 0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak * (1 - i * 0.1), t + 0.008)
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(filt)
  filt.connect(g)
  g.connect(dest)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
  return dur
}

function sHit(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.14
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 140 * pitch,
    freqEnd: 48 * pitch,
    dur,
    gain: 0.42 * vol,
    attack: 0.004,
  })
  burst(ctx, dest, noise.brown, t0, {
    dur: 0.08,
    gain: 0.18 * vol,
    attack: 0.002,
    filter: 'lowpass',
    filterFreq: 200 * pitch,
  })
  return dur
}

function sCrit(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  sHit(ctx, dest, noise, t0, pitch, vol * 0.9)
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 1320 * pitch,
    freqEnd: 1980 * pitch,
    dur: 0.16,
    gain: 0.16 * vol,
    attack: 0.004,
  })
  tone(ctx, dest, t0 + 0.03, {
    type: 'triangle',
    freq: 1760 * pitch,
    dur: 0.1,
    gain: 0.08 * vol,
  })
  return 0.18
}

function sEnemyDie(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.28
  burst(ctx, dest, noise.white, t0, {
    dur: 0.16,
    gain: 0.3 * vol,
    attack: 0.004,
    filter: 'bandpass',
    filterFreq: 700 * pitch,
    filterFreqEnd: 180 * pitch,
    filterQ: 1.4,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 280 * pitch,
    freqEnd: 70 * pitch,
    dur,
    gain: 0.28 * vol,
    attack: 0.01,
  })
  return dur
}

function sBossDie(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 1.15
  burst(ctx, dest, noise.brown, t0, {
    dur,
    gain: 0.45 * vol,
    attack: 0.02,
    filter: 'lowpass',
    filterFreq: 140 * pitch,
    filterFreqEnd: 50 * pitch,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 70 * pitch,
    freqEnd: 28 * pitch,
    dur: 0.9,
    gain: 0.35 * vol,
    attack: 0.03,
  })
  sEnemyDie(ctx, dest, noise, t0 + 0.08, pitch, vol)
  sEnemyDie(ctx, dest, noise, t0 + 0.28, pitch * 0.85, vol * 0.7)
  burst(ctx, dest, noise.white, t0 + 0.5, {
    dur: 0.22,
    gain: 0.22 * vol,
    filter: 'bandpass',
    filterFreq: 400 * pitch,
    filterFreqEnd: 120 * pitch,
    filterQ: 1.2,
  })
  return dur
}

function sPlayerHurt(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.32
  tone(ctx, dest, t0, {
    type: 'sawtooth',
    freq: 190 * pitch,
    freqEnd: 42 * pitch,
    dur,
    gain: 0.18 * vol,
    attack: 0.01,
    filter: 'lowpass',
    filterFreq: 500,
    filterFreqEnd: 120,
  })
  burst(ctx, dest, noise.white, t0, {
    dur: 0.14,
    gain: 0.16 * vol,
    attack: 0.004,
    filter: 'bandpass',
    filterFreq: 500 * pitch,
    filterQ: 1,
  })
  return dur
}

function sDodge(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.18
  burst(ctx, dest, noise.white, t0, {
    dur,
    gain: 0.2 * vol,
    attack: 0.01,
    filter: 'highpass',
    filterFreq: 900 * pitch,
    filterFreqEnd: 4200 * pitch,
    filterQ: 0.8,
  })
  return dur
}

function sPickup(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.28
  tone(ctx, dest, t0, {
    type: 'triangle',
    freq: 523 * pitch,
    freqEnd: 784 * pitch,
    dur: 0.14,
    gain: 0.16 * vol,
    attack: 0.004,
  })
  tone(ctx, dest, t0 + 0.07, {
    type: 'sine',
    freq: 784 * pitch,
    dur: 0.16,
    gain: 0.05 * vol,
    attack: 0.004,
  })
  tone(ctx, dest, t0 + 0.14, {
    type: 'sine',
    freq: 988 * pitch,
    dur: 0.12,
    gain: 0.025 * vol,
  })
  return dur
}

function sFruit(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.white, t0, {
    dur: 0.05,
    gain: 0.12 * vol,
    attack: 0.002,
    filter: 'highpass',
    filterFreq: 1200 * pitch,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 420 * pitch,
    freqEnd: 280 * pitch,
    dur: 0.09,
    gain: 0.14 * vol,
    attack: 0.003,
  })
  return 0.1
}

function sChest(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.brown, t0, {
    dur: 0.07,
    gain: 0.35 * vol,
    attack: 0.002,
    filter: 'bandpass',
    filterFreq: 420 * pitch,
    filterQ: 2.5,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 180 * pitch,
    dur: 0.08,
    gain: 0.12 * vol,
    attack: 0.002,
  })
  tone(ctx, dest, t0 + 0.05, {
    type: 'sine',
    freq: 2480 * pitch,
    freqEnd: 3200 * pitch,
    dur: 0.28,
    gain: 0.07 * vol,
    attack: 0.01,
  })
  return 0.34
}

function sLevelUp(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const notes = [523.25, 659.25, 783.99]
  for (let i = 0; i < notes.length; i++) {
    tone(ctx, dest, t0 + i * 0.11, {
      type: 'triangle',
      freq: notes[i]! * pitch,
      dur: 0.22,
      gain: 0.14 * vol,
      attack: 0.008,
    })
    tone(ctx, dest, t0 + i * 0.11, {
      type: 'sine',
      freq: notes[i]! * 2 * pitch,
      dur: 0.16,
      gain: 0.04 * vol,
    })
  }
  return 0.46
}

function sWaveStart(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.white, t0, {
    dur: 0.12,
    gain: 0.28 * vol,
    attack: 0.004,
    filter: 'bandpass',
    filterFreq: 240 * pitch,
    filterFreqEnd: 900 * pitch,
    filterQ: 1.2,
  })
  tone(ctx, dest, t0 + 0.02, {
    type: 'sine',
    freq: 196 * pitch,
    freqEnd: 392 * pitch,
    dur: 0.32,
    gain: 0.14 * vol,
    attack: 0.02,
  })
  return 0.36
}

function sWaveEnd(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  tone(ctx, dest, t0, {
    type: 'triangle',
    freq: 392 * pitch,
    dur: 0.28,
    gain: 0.14 * vol,
    attack: 0.01,
  })
  tone(ctx, dest, t0 + 0.2, {
    type: 'triangle',
    freq: 523.25 * pitch,
    dur: 0.32,
    gain: 0.16 * vol,
    attack: 0.01,
  })
  return 0.54
}

function sBuy(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 1860 * pitch,
    dur: 0.08,
    gain: 0.12 * vol,
    attack: 0.002,
  })
  tone(ctx, dest, t0 + 0.03, {
    type: 'sine',
    freq: 2480 * pitch,
    dur: 0.12,
    gain: 0.1 * vol,
    attack: 0.002,
  })
  return 0.16
}

function sSell(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 2480 * pitch,
    freqEnd: 1860 * pitch,
    dur: 0.14,
    gain: 0.1 * vol,
    attack: 0.07,
  })
  tone(ctx, dest, t0 + 0.05, {
    type: 'sine',
    freq: 1480 * pitch,
    dur: 0.1,
    gain: 0.07 * vol,
    attack: 0.05,
  })
  return 0.18
}

function sReroll(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const hits = [0, 0.045, 0.1, 0.16]
  for (let i = 0; i < hits.length; i++) {
    burst(ctx, dest, noise.white, t0 + hits[i]!, {
      dur: 0.05,
      gain: (0.16 - i * 0.02) * vol,
      attack: 0.003,
      filter: 'bandpass',
      filterFreq: (1400 + i * 420) * pitch,
      filterQ: 2.2,
    })
  }
  return 0.24
}

function sLock(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.brown, t0, {
    dur: 0.045,
    gain: 0.28 * vol,
    attack: 0.002,
    filter: 'bandpass',
    filterFreq: 820 * pitch,
    filterQ: 4,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 210 * pitch,
    dur: 0.05,
    gain: 0.1 * vol,
    attack: 0.002,
  })
  return 0.08
}

function sCombine(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  tone(ctx, dest, t0, {
    type: 'sawtooth',
    freq: 180 * pitch,
    freqEnd: 720 * pitch,
    dur: 0.28,
    gain: 0.08 * vol,
    attack: 0.02,
    filter: 'lowpass',
    filterFreq: 1600,
  })
  tone(ctx, dest, t0 + 0.16, {
    type: 'sine',
    freq: 1568 * pitch,
    dur: 0.28,
    gain: 0.14 * vol,
    attack: 0.006,
  })
  tone(ctx, dest, t0 + 0.22, {
    type: 'sine',
    freq: 2093 * pitch,
    dur: 0.22,
    gain: 0.08 * vol,
  })
  return 0.48
}

function sUiHover(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 1720 * pitch,
    dur: 0.035,
    gain: 0.035 * vol,
    attack: 0.003,
  })
  return 0.04
}

function sUiClick(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.white, t0, {
    dur: 0.03,
    gain: 0.08 * vol,
    attack: 0.002,
    filter: 'highpass',
    filterFreq: 900 * pitch,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 620 * pitch,
    freqEnd: 380 * pitch,
    dur: 0.07,
    gain: 0.1 * vol,
    attack: 0.003,
  })
  return 0.08
}

function sGameOver(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const notes = [440, 349.23, 329.63, 261.63]
  for (let i = 0; i < notes.length; i++) {
    tone(ctx, dest, t0 + i * 0.28, {
      type: 'triangle',
      freq: notes[i]! * pitch,
      dur: i === notes.length - 1 ? 0.7 : 0.4,
      gain: 0.16 * vol,
      attack: 0.02,
    })
  }
  return 1.45
}

function sVictory(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const notes = [261.63, 329.63, 392, 523.25, 659.25]
  const at = [0, 0.14, 0.28, 0.44, 0.66]
  for (let i = 0; i < notes.length; i++) {
    tone(ctx, dest, t0 + at[i]!, {
      type: 'triangle',
      freq: notes[i]! * pitch,
      dur: i === notes.length - 1 ? 0.7 : 0.28,
      gain: (0.12 + i * 0.012) * vol,
      attack: 0.01,
    })
    tone(ctx, dest, t0 + at[i]!, {
      type: 'sine',
      freq: notes[i]! * 2 * pitch,
      dur: 0.22,
      gain: 0.04 * vol,
    })
  }
  return 1.4
}

function sBurn(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.36
  burst(ctx, dest, noise.white, t0, {
    dur,
    gain: 0.14 * vol,
    attack: 0.02,
    filter: 'bandpass',
    filterFreq: 1800 * pitch,
    filterFreqEnd: 900 * pitch,
    filterQ: 3.5,
  })
  burst(ctx, dest, noise.white, t0 + 0.05, {
    dur: 0.28,
    gain: 0.08 * vol,
    filter: 'highpass',
    filterFreq: 3200 * pitch,
  })
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  const peak = Math.max(0.0001, 0.12 * vol)
  for (let i = 0; i < 8; i++) {
    const t = t0 + i * 0.04
    g.gain.exponentialRampToValueAtTime(peak * (0.4 + Math.random() * 0.6), t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.01 * vol + 0.0001, t + 0.03)
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  const src = ctx.createBufferSource()
  src.buffer = noise.white
  src.loop = true
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2500 * pitch
  src.connect(hp)
  hp.connect(g)
  g.connect(dest)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
  return dur
}

function sCharge(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.48
  tone(ctx, dest, t0, {
    type: 'sawtooth',
    freq: 55 * pitch,
    freqEnd: 140 * pitch,
    dur,
    gain: 0.16 * vol,
    attack: 0.06,
    filter: 'lowpass',
    filterFreq: 200,
    filterFreqEnd: 700,
  })
  burst(ctx, dest, noise.brown, t0, {
    dur,
    gain: 0.12 * vol,
    attack: 0.08,
    filter: 'lowpass',
    filterFreq: 180 * pitch,
    filterFreqEnd: 400 * pitch,
  })
  return dur
}

function sSpawn(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.22
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 240 * pitch,
    freqEnd: 96 * pitch,
    dur,
    gain: 0.2 * vol,
    attack: 0.01,
  })
  tone(ctx, dest, t0, {
    type: 'sine',
    freq: 520 * pitch,
    freqEnd: 180 * pitch,
    dur: 0.16,
    gain: 0.08 * vol,
    attack: 0.008,
  })
  return dur
}

function sBossRoar(ctx: AudioContext, dest: AudioNode, _n: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  const dur = 0.55
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(420, t0)
  lp.frequency.exponentialRampToValueAtTime(180, t0 + dur)
  lp.connect(dest)
  for (const [freq, det] of [
    [68, -14],
    [74, 11],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq * pitch, t0)
    osc.detune.setValueAtTime(det, t0)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(5.5, t0)
    const lfoG = ctx.createGain()
    lfoG.gain.value = 7 * pitch
    lfo.connect(lfoG)
    lfoG.connect(osc.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.14 * vol, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(lp)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
    lfo.start(t0)
    lfo.stop(t0 + dur + 0.02)
  }
  return dur
}

function sTreeBreak(ctx: AudioContext, dest: AudioNode, noise: NoiseBuffers, t0: number, pitch: number, vol: number): number {
  burst(ctx, dest, noise.white, t0, {
    dur: 0.06,
    gain: 0.32 * vol,
    attack: 0.002,
    filter: 'bandpass',
    filterFreq: 1400 * pitch,
    filterQ: 3,
  })
  tone(ctx, dest, t0, {
    type: 'triangle',
    freq: 320 * pitch,
    freqEnd: 90 * pitch,
    dur: 0.1,
    gain: 0.14 * vol,
    attack: 0.002,
  })
  burst(ctx, dest, noise.white, t0 + 0.03, {
    dur: 0.28,
    gain: 0.16 * vol,
    attack: 0.01,
    filter: 'highpass',
    filterFreq: 2200 * pitch,
    filterQ: 0.7,
  })
  return 0.34
}

const SYNTHS: Record<SfxName, Synth> = {
  swing: sSwing,
  stab: sStab,
  shoot: sShoot,
  shotgun: sShotgun,
  bolt: sBolt,
  zap: sZap,
  hit: sHit,
  crit: sCrit,
  enemyDie: sEnemyDie,
  bossDie: sBossDie,
  playerHurt: sPlayerHurt,
  dodge: sDodge,
  pickup: sPickup,
  fruit: sFruit,
  chest: sChest,
  levelUp: sLevelUp,
  waveStart: sWaveStart,
  waveEnd: sWaveEnd,
  buy: sBuy,
  sell: sSell,
  reroll: sReroll,
  lock: sLock,
  combine: sCombine,
  uiHover: sUiHover,
  uiClick: sUiClick,
  gameOver: sGameOver,
  victory: sVictory,
  burn: sBurn,
  charge: sCharge,
  spawn: sSpawn,
  bossRoar: sBossRoar,
  treeBreak: sTreeBreak,
}

export function playSfx(
  ctx: AudioContext,
  dest: AudioNode,
  noise: NoiseBuffers,
  name: SfxName,
  t0: number,
  pitch: number,
  vol: number,
): number {
  return SYNTHS[name](ctx, dest, noise, t0, pitch, vol)
}
