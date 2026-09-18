import type { InputApi, Vec } from '../core/types.ts'

export function createInput(stick: HTMLElement, knob: HTMLElement): InputApi {
  const keysDown = new Set<string>()
  const pressed = new Set<string>()
  const joy = { x: 0, y: 0 }
  let pointerId: number | null = null
  let coarse = window.matchMedia('(pointer: coarse)').matches

  const coarseMq = window.matchMedia('(pointer: coarse)')
  const onCoarse = (e: MediaQueryListEvent): void => {
    coarse = e.matches
  }
  if (typeof coarseMq.addEventListener === 'function') {
    coarseMq.addEventListener('change', onCoarse)
  } else {
    coarseMq.addListener(onCoarse)
  }

  function resetJoy(): void {
    pointerId = null
    joy.x = 0
    joy.y = 0
    knob.style.transform = 'translate(-50%, -50%)'
  }

  function applyPointer(e: PointerEvent): void {
    const rect = stick.getBoundingClientRect()
    const cx = rect.left + rect.width * 0.5
    const cy = rect.top + rect.height * 0.5
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const stickR = Math.max(1, rect.width * 0.5)
    const knobR = Math.max(8, knob.getBoundingClientRect().width * 0.5)
    const max = Math.max(12, stickR - knobR)
    const len = Math.hypot(dx, dy)
    if (len > max && len > 0) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    joy.x = dx / max
    joy.y = dy / max
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }

  stick.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    stick.setPointerCapture(e.pointerId)
    pointerId = e.pointerId
    applyPointer(e)
  })

  stick.addEventListener('pointermove', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return
    e.preventDefault()
    applyPointer(e)
  })

  const endPointer = (e: PointerEvent): void => {
    if (pointerId === null || e.pointerId !== pointerId) return
    resetJoy()
  }

  stick.addEventListener('pointerup', endPointer)
  stick.addEventListener('pointercancel', endPointer)
  stick.addEventListener('lostpointercapture', (e) => {
    if (pointerId === e.pointerId) resetJoy()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault()
    } else if (e.code === 'Space') {
      const t = e.target
      const onControl =
        t instanceof HTMLElement &&
        (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.isContentEditable || t.closest('button') !== null)
      if (!onControl) e.preventDefault()
    }
    if (e.repeat) return
    if (!keysDown.has(e.code)) pressed.add(e.code)
    keysDown.add(e.code)
  })

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code)
  })

  window.addEventListener('blur', () => {
    keysDown.clear()
    pressed.clear()
    resetJoy()
  })

  function sample(): Vec {
    let x = joy.x
    let y = joy.y
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) x -= 1
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) x += 1
    if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) y -= 1
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) y += 1
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  return {
    sample,
    consume(code: string): boolean {
      if (!pressed.has(code)) return false
      pressed.delete(code)
      return true
    },
    down(code: string): boolean {
      return keysDown.has(code)
    },
    get coarse(): boolean {
      return coarse
    },
  }
}
