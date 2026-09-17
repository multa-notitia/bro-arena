import './style.css'
import { Sfx } from './audio.ts'
import { Arena } from './game.ts'
import { Input } from './input.ts'
import type { UpgradeDef } from './content.ts'

const bootCopy = document.querySelector<HTMLParagraphElement>('#boot-copy')
const errorCopy = document.querySelector<HTMLParagraphElement>('#error-copy')
const upgradeCards = document.querySelector<HTMLDivElement>('#upgrade-cards')
const weaponsEl = document.querySelector<HTMLDivElement>('#weapons')
const bannerEl = document.querySelector<HTMLParagraphElement>('#banner')
const hpFill = document.querySelector<HTMLDivElement>('#hp-fill')
const hpText = document.querySelector<HTMLSpanElement>('#hp-text')
const xpFill = document.querySelector<HTMLDivElement>('#xp-fill')
const levelText = document.querySelector<HTMLSpanElement>('#level-text')
const waveText = document.querySelector<HTMLSpanElement>('#wave-text')
const timerText = document.querySelector<HTMLSpanElement>('#timer-text')
const overStats = document.querySelector<HTMLParagraphElement>('#over-stats')
const hud = document.querySelector<HTMLDivElement>('#hud')
const stick = document.querySelector<HTMLDivElement>('#stick')
const knob = document.querySelector<HTMLDivElement>('#stick-knob')
const canvas = document.querySelector<HTMLCanvasElement>('#arena')

const screens = {
  boot: document.querySelector<HTMLElement>('#screen-boot'),
  error: document.querySelector<HTMLElement>('#screen-error'),
  title: document.querySelector<HTMLElement>('#screen-title'),
  pause: document.querySelector<HTMLElement>('#screen-pause'),
  levelup: document.querySelector<HTMLElement>('#screen-levelup'),
  over: document.querySelector<HTMLElement>('#screen-over'),
}

function show(id: keyof typeof screens | null): void {
  for (const [key, el] of Object.entries(screens)) {
    if (el) el.hidden = key !== id
  }
}

function fail(message: string): void {
  if (errorCopy) errorCopy.textContent = message
  hud && (hud.hidden = true)
  stick && (stick.hidden = true)
  show('error')
}

if (!canvas || !stick || !knob) {
  fail('The page is missing the arena canvas. Reload, or check that the build is intact.')
  throw new Error('Missing arena markup')
}

const ctx = canvas.getContext('2d')
if (!ctx) {
  fail('Canvas failed to start. Try Chrome, Firefox, or Safari, then reload.')
  throw new Error('No 2d context')
}

const sfx = new Sfx()
const input = new Input(stick, knob)
const arena = new Arena(sfx)
let last = performance.now()
let uiMode = 'boot'

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, window.innerWidth)
  const h = Math.max(1, window.innerHeight)
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

resize()
window.addEventListener('resize', resize)

function syncHud(): void {
  const h = arena.hud()
  if (hpFill) hpFill.style.transform = `scaleX(${h.maxHp ? h.hp / h.maxHp : 0})`
  if (hpText) hpText.textContent = String(h.hp)
  if (xpFill) xpFill.style.transform = `scaleX(${h.xpNext ? h.xp / h.xpNext : 0})`
  if (levelText) levelText.textContent = String(h.level)
  if (waveText) waveText.textContent = h.waveLabel
  if (timerText) timerText.textContent = h.timer
  if (weaponsEl) {
    weaponsEl.replaceChildren(
      ...h.weapons.map((w) => {
        const chip = document.createElement('span')
        chip.className = 'weapon-chip'
        chip.textContent = w.name
        return chip
      }),
    )
  }
  if (bannerEl) {
    bannerEl.hidden = !h.banner
    bannerEl.textContent = h.banner ?? ''
  }
}

function paintCards(offers: UpgradeDef[]): void {
  if (!upgradeCards) return
  upgradeCards.replaceChildren()
  offers.forEach((up, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'card'
    btn.innerHTML = `<div class="idx">0${i + 1}</div><h2>${up.title}</h2><p>${up.blurb}</p>`
    btn.addEventListener('click', () => pick(i))
    upgradeCards.append(btn)
  })
}

function pick(i: number): void {
  arena.choose(i)
  show(null)
  hud && (hud.hidden = false)
}

function enterTitle(): void {
  arena.idlePaddock()
  uiMode = 'title'
  hud && (hud.hidden = true)
  stick && (stick.hidden = true)
  show('title')
}

function enterRun(): void {
  sfx.unlock()
  arena.startRun()
  uiMode = 'play'
  hud && (hud.hidden = false)
  stick && (stick.hidden = !input.coarse)
  show(null)
}

function enterPause(): void {
  arena.pause()
  uiMode = 'pause'
  show('pause')
}

function loop(now: number): void {
  const dt = (now - last) / 1000
  last = now
  const mv = input.sample()

  if (arena.mode === 'playing') {
    if (input.consume('KeyP') || input.consume('Escape')) enterPause()
  } else if (arena.mode === 'paused' && uiMode === 'pause') {
    if (input.consume('KeyP') || input.consume('Escape')) {
      arena.resume()
      uiMode = 'play'
      show(null)
    }
  } else if (arena.mode === 'levelup' && arena.hud().offers) {
    if (uiMode !== 'levelup') {
      uiMode = 'levelup'
      const offers = arena.hud().offers ?? []
      paintCards(offers)
      show('levelup')
    }
    if (input.consume('Digit1') || input.consume('Numpad1')) pick(0)
    if (input.consume('Digit2') || input.consume('Numpad2')) pick(1)
    if (input.consume('Digit3') || input.consume('Numpad3')) pick(2)
  } else if (arena.mode === 'dead' && uiMode !== 'over') {
    uiMode = 'over'
    const h = arena.hud()
    if (overStats) {
      overStats.textContent = `${h.overLine}. The blight keeps the paddock.`
    }
    hud && (hud.hidden = true)
    show('over')
  }

  if (arena.mode === 'playing' && uiMode === 'levelup') {
    uiMode = 'play'
    show(null)
  }

  arena.update(dt, mv.x, mv.y)
  arena.draw(ctx, window.innerWidth, window.innerHeight)
  if (!hud?.hidden) syncHud()
  requestAnimationFrame(loop)
}

async function boot(): Promise<void> {
  show('boot')
  if (bootCopy) bootCopy.textContent = 'Peeling the arena…'
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 2200))
  try {
    await Promise.race([document.fonts.ready, timeout])
  } catch {
    // Font loading is optional; the arena still runs on system type.
  }
  if (bootCopy) bootCopy.textContent = 'Dirt’s packed. Weapons are hungry.'
  await new Promise((r) => window.setTimeout(r, 280))
  enterTitle()
  last = performance.now()
  requestAnimationFrame(loop)
}

document.querySelector('#btn-play')?.addEventListener('click', enterRun)
document.querySelector('#btn-again')?.addEventListener('click', enterRun)
document.querySelector('#btn-title')?.addEventListener('click', enterTitle)
document.querySelector('#btn-quit')?.addEventListener('click', enterTitle)
document.querySelector('#btn-resume')?.addEventListener('click', () => {
  arena.resume()
  uiMode = 'play'
  show(null)
})
document.querySelector('#btn-pause')?.addEventListener('click', () => {
  if (arena.mode !== 'playing') return
  enterPause()
})
document.querySelector('#btn-retry')?.addEventListener('click', () => {
  window.location.reload()
})

window.addEventListener('unhandledrejection', () => {
  fail('Something in the arena broke mid-run. Reload and try another pass.')
})

void boot()
