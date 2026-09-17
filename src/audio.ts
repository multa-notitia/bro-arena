export class Sfx {
  private ctx: AudioContext | null = null
  muted = false

  private audio(): AudioContext | null {
    if (this.muted) return null
    const AC = window.AudioContext ?? window.webkitAudioContext
    if (!AC) return null
    if (!this.ctx) this.ctx = new AC()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  unlock(): void {
    this.audio()
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.06,
    slide = 0,
  ): void {
    const ctx = this.audio()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq + slide),
        ctx.currentTime + dur,
      )
    }
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  }

  shoot(): void {
    this.beep(420, 0.06, 'square', 0.04, -180)
  }

  hit(): void {
    this.beep(180, 0.05, 'triangle', 0.05, -80)
  }

  pickup(): void {
    this.beep(880, 0.07, 'sine', 0.04, 220)
  }

  hurt(): void {
    this.beep(110, 0.18, 'sawtooth', 0.07, -40)
  }

  mash(): void {
    this.beep(70, 0.22, 'triangle', 0.08, -20)
  }

  level(): void {
    this.beep(520, 0.08, 'square', 0.05)
    window.setTimeout(() => this.beep(660, 0.1, 'square', 0.05), 70)
    window.setTimeout(() => this.beep(820, 0.14, 'square', 0.05), 140)
  }

  dead(): void {
    this.beep(90, 0.4, 'sawtooth', 0.08, -50)
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
