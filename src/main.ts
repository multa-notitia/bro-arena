import './style.css'
import { createAudio } from './audio/index.ts'
import { Run } from './game/run.ts'
import { createRenderer } from './render/index.ts'
import { applyPaintStyleToDom } from './render/look.ts'
import { createUi } from './ui/index.ts'
import { createInput } from './ui/input.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#arena')
const uiRoot = document.querySelector<HTMLElement>('#ui')
const stick = document.querySelector<HTMLElement>('#stick')
const knob = document.querySelector<HTMLElement>('#stick-knob')

function hardFail(message: string): never {
  const el = document.createElement('div')
  el.className = 'hard-fail'
  el.textContent = message
  document.body.append(el)
  throw new Error(message)
}

if (!canvas || !uiRoot || !stick || !knob) {
  hardFail('The Plot is missing its markup. Reload, or check that the build is intact.')
}

const ctx = canvas.getContext('2d', { alpha: false })
const render = createRenderer()
const ui = createUi(uiRoot, { icon: render.icon, portrait: render.portrait })

if (!ctx) {
  ui.setErrorCopy('Canvas failed to start. Try Chrome, Firefox, or Safari, then reload.')
  ui.showScreen('error')
  hardFail('No 2d context')
}

const audio = createAudio()
const input = createInput(stick, knob)

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, window.innerWidth)
  const h = Math.max(1, window.innerHeight)
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render.resize(w, h, dpr)
}

applyPaintStyleToDom()
resize()
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)

const run = new Run({ canvas, ctx, render, ui, audio, input })

let crashed = false
function crash(message: string): void {
  if (crashed) return
  crashed = true
  ui.setErrorCopy(message)
  ui.setHudVisible(false)
  ui.setJoystickVisible(false)
  ui.showScreen('error')
}

window.addEventListener('error', (e) => {
  crash(`Something in the arena broke: ${e.message}. Reload and try another pass.`)
})
window.addEventListener('unhandledrejection', () => {
  crash('Something in the arena broke mid-run. Reload and try another pass.')
})

function frame(now: number): void {
  if (crashed) return
  try {
    run.frame(now)
  } catch (err) {
    crash(
      `Something in the arena broke: ${err instanceof Error ? err.message : String(err)}. Reload and try another pass.`,
    )
    return
  }
  requestAnimationFrame(frame)
}

run.start()
requestAnimationFrame(frame)
