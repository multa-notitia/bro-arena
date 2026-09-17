export class Input {
  readonly keys = new Set<string>()
  private stickActive = false
  private stickId: number | null = null
  private cx = 0
  private cy = 0
  private readonly maxR = 48
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement

  constructor(stick: HTMLElement, knob: HTMLElement) {
    this.stick = stick
    this.knob = knob
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (
        e.code === 'Space' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))

    const onDown = (e: PointerEvent) => {
      if (this.stickActive) return
      this.stick.setPointerCapture(e.pointerId)
      this.stickActive = true
      this.stickId = e.pointerId
      const r = this.stick.getBoundingClientRect()
      this.cx = r.left + r.width / 2
      this.cy = r.top + r.height / 2
      this.nudge(e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      if (!this.stickActive || e.pointerId !== this.stickId) return
      this.nudge(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return
      this.stickActive = false
      this.stickId = null
      this.knob.style.transform = 'translate(-50%, -50%)'
    }
    this.stick.addEventListener('pointerdown', onDown)
    this.stick.addEventListener('pointermove', onMove)
    this.stick.addEventListener('pointerup', onUp)
    this.stick.addEventListener('pointercancel', onUp)
  }

  private nudge(x: number, y: number): void {
    let dx = x - this.cx
    let dy = y - this.cy
    const len = Math.hypot(dx, dy)
    if (len > this.maxR) {
      dx = (dx / len) * this.maxR
      dy = (dy / len) * this.maxR
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
    const nx = dx / this.maxR
    const ny = dy / this.maxR
    this.stickVec.x = nx
    this.stickVec.y = ny
  }

  private stickVec = { x: 0, y: 0 }

  sample(): { x: number; y: number } {
    let x = 0
    let y = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1
    if (this.stickActive) {
      x += this.stickVec.x
      y += this.stickVec.y
    }
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  consume(code: string): boolean {
    if (!this.keys.has(code)) return false
    this.keys.delete(code)
    return true
  }

  get coarse(): boolean {
    return window.matchMedia('(pointer: coarse)').matches
  }
}
