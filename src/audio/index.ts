import type { AudioApi, MusicMood, SfxName } from '../core/types.ts'
import { createMusic } from './music.ts'
import { createNoiseBuffers, playSfx, type NoiseBuffers } from './sfx.ts'

const MUTE_KEY = 'bro.muted'
const MAX_VOICES = 24
const RATE_MAX = 12
const RATE_WINDOW_MS = 1000

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof AudioContext !== 'undefined') return AudioContext
  const wk = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  return wk ?? null
}

function readMuted(): boolean {
  try {
    const v = localStorage.getItem(MUTE_KEY)
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // private mode / blocked storage
  }
}

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let buffers: NoiseBuffers | null = null
  let muted = readMuted()
  let voices = 0
  const recent = new Map<SfxName, number[]>()
  const music = createMusic()
  let queuedMood: MusicMood | null = null

  function rateOk(name: SfxName): boolean {
    const now = performance.now()
    let list = recent.get(name)
    if (!list) {
      list = []
      recent.set(name, list)
    }
    const floor = now - RATE_WINDOW_MS
    let i = 0
    while (i < list.length && list[i]! < floor) i++
    if (i > 0) list.splice(0, i)
    if (list.length >= RATE_MAX) return false
    list.push(now)
    return true
  }

  function applyMasterGain(): void {
    if (!master || !ctx) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.04)
  }

  function unlock(): void {
    const Ctor = audioContextCtor()
    if (!Ctor) return
    if (!ctx) {
      const ac = new Ctor()
      ctx = ac
      const comp = ac.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.knee.value = 10
      comp.ratio.value = 3.5
      comp.attack.value = 0.004
      comp.release.value = 0.22
      master = ac.createGain()
      master.gain.value = muted ? 0 : 1
      master.connect(comp)
      comp.connect(ac.destination)
      sfxBus = ac.createGain()
      sfxBus.gain.value = 1
      sfxBus.connect(master)
      const musicBus = ac.createGain()
      musicBus.gain.value = 0.35
      musicBus.connect(master)
      buffers = createNoiseBuffers(ac)
      music.attach(ac, musicBus, buffers)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && ctx && ctx.state === 'suspended') void ctx.resume()
      })
    }
    if (ctx.state === 'suspended') void ctx.resume()
    if (queuedMood !== null) {
      music.setMood(queuedMood)
      queuedMood = null
    }
  }

  function setMuted(next: boolean): void {
    muted = next
    writeMuted(next)
    applyMasterGain()
  }

  function play(name: SfxName, opts?: { pitch?: number; gain?: number }): void {
    if (!ctx || !sfxBus || !buffers || muted) return
    if (ctx.state === 'suspended') return
    if (voices >= MAX_VOICES) return
    if (!rateOk(name)) return
    const pitch = (opts?.pitch ?? 1) * (0.94 + Math.random() * 0.12)
    const gain = opts?.gain ?? 1
    voices++
    const dur = playSfx(ctx, sfxBus, buffers, name, ctx.currentTime + 0.001, pitch, gain)
    window.setTimeout(() => {
      voices = Math.max(0, voices - 1)
    }, Math.ceil(dur * 1000) + 40)
  }

  function setMusic(mood: MusicMood): void {
    if (!ctx) {
      queuedMood = mood
      return
    }
    music.setMood(mood)
  }

  return {
    unlock,
    setMuted,
    get muted() {
      return muted
    },
    play,
    setMusic,
  }
}
