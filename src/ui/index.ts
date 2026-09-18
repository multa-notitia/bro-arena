import { clamp, formatClock } from '../core/math.ts'
import { MODEL_DIRS, TIER_NAMES } from '../core/types.ts'
import type {
  CharacterDef,
  Form,
  HudSnapshot,
  ItemPaint,
  LevelUpOption,
  ModelDir,
  PaintStyle,
  RenderApi,
  RunPhase,
  RunSummary,
  ShopHandlers,
  ShopView,
  UiApi,
  WeaponPaint,
} from '../core/types.ts'
import { MODEL_LABELS, PAINT_STYLE_LABELS, PAINT_STYLES, lookKey } from '../render/look.ts'

const OVERLAYS: readonly Exclude<RunPhase, 'wave'>[] = [
  'boot',
  'error',
  'title',
  'charselect',
  'levelup',
  'shop',
  'paused',
  'stats',
  'gameover',
  'victory',
]

type OverlayId = (typeof OVERLAYS)[number]

function isOverlay(phase: RunPhase | null): phase is OverlayId {
  return phase !== null && phase !== 'wave'
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string; id?: string },
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (opts?.className) n.className = opts.className
  if (opts?.text !== undefined) n.textContent = opts.text
  if (opts?.id) n.id = opts.id
  return n
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  const r = Math.round(n * 10) / 10
  return String(r)
}

function muteLabel(muted: boolean): string {
  return muted ? 'Let it scream' : 'Quiet the garden'
}

const SKELETON = `
<div id="hud" hidden>
  <div class="hud-top">
    <div class="hud-left">
      <div class="scrap">
        <div class="bar-block">
          <span class="bar-label">HP</span>
          <div class="bar hp-bar" role="meter" aria-label="Health">
            <div id="hud-hp-fill" class="bar-fill"></div>
          </div>
          <span id="hud-hp-text" class="bar-num">0 / 0</span>
        </div>
        <div class="bar-block">
          <span class="bar-label">Lv <span id="hud-level">1</span></span>
          <div class="bar xp-bar" role="meter" aria-label="Experience">
            <div id="hud-xp-fill" class="bar-fill"></div>
          </div>
          <span id="hud-xp-text" class="bar-num"></span>
        </div>
      </div>
    </div>
    <div class="hud-center">
      <div class="scrap wave-scrap">
        <div id="hud-wave" class="wave-name">Wave 1</div>
        <div id="hud-clock" class="wave-clock">0:00</div>
        <div id="hud-mud" class="mud-meter" hidden>Mud · <span id="hud-mud-count">0</span></div>
      </div>
      <div id="hud-boss" class="scrap" hidden>
        <div id="hud-boss-name" class="boss-name"></div>
        <div class="bar boss-bar" role="meter" aria-label="Boss health">
          <div id="hud-boss-fill" class="bar-fill"></div>
        </div>
      </div>
    </div>
    <div class="hud-right">
      <div class="bag-scrap scrap">
        <img id="hud-bag-icon" alt="" width="28" height="28" />
        <span id="hud-materials" class="bag-count">0</span>
      </div>
      <button id="hud-pause" class="icon-btn" type="button" aria-label="Pause">Pause</button>
    </div>
  </div>
  <div id="hud-weapons" class="hud-weapons" aria-label="Weapons"></div>
</div>

<div id="banner" hidden>
  <p id="banner-text" class="banner-text"></p>
  <p id="banner-sub" class="banner-sub" hidden></p>
</div>
<div id="toasts" class="toasts" aria-live="polite"></div>

<div id="screen-boot" class="overlay cover" hidden>
  <div class="cover-inner">
    <p class="kicker">THE PLOT</p>
    <h1 class="title-mark">BRO</h1>
    <p id="boot-copy" class="lede">Wetting the paper…</p>
    <div class="spinner" aria-hidden="true"></div>
  </div>
</div>

<div id="screen-error" class="overlay cover" hidden>
  <div class="cover-inner">
    <p class="kicker">THE PLOT</p>
    <h1>The Plot won't load.</h1>
    <p id="error-copy" class="lede">The wash tore. Reload.</p>
    <div class="actions">
      <button id="error-retry" class="btn primary" type="button">Try again</button>
    </div>
  </div>
</div>

<div id="screen-title" class="overlay cover" hidden>
  <div class="title-vignette" aria-hidden="true"></div>
  <div class="title-drips" aria-hidden="true"></div>
  <div class="cover-inner">
    <p class="kicker">THE PLOT</p>
    <h1 class="title-mark">BRO</h1>
    <p class="tag">Everything in the garden has a face. Most of them are screaming.</p>
    <p class="lede">
      The rain came, the mud came up, and the vegetables that went under came back wrong. You stay clean. They don't.
    </p>
    <div class="actions">
      <button id="btn-play" class="btn primary" type="button">Go out into the Plot</button>
      <button id="btn-title-mute" class="btn ghost" type="button" aria-pressed="false">Quiet the garden</button>
    </div>
    <div class="paint-settings" role="group" aria-label="Painting style">
      <p class="paint-kicker">Painting language</p>
      <div id="title-paint" class="paint-row"></div>
    </div>
    <ul class="howto">
      <li>WASD or arrows to move. P holds still. 1–4 pick. M quiets.</li>
      <li>Drag the stick. Pause is top right.</li>
    </ul>
  </div>
</div>

<div id="screen-charselect" class="overlay cover" hidden>
  <div class="sheet sheet-wide">
    <p class="kicker">THE GATE</p>
    <h1>Pick a vegetable</h1>
    <p class="lede">Two ways into the Plot. Spud or Carrot. Flip the card for Wash, Sketch, or Stain — same vegetable, different face. You stay clean. Mud is for them.</p>
    <div id="char-grid" class="char-grid"></div>
  </div>
</div>

<div id="screen-levelup" class="overlay dim" hidden>
  <div class="sheet">
    <p class="kicker">GROWTH</p>
    <h1>You grew.</h1>
    <p id="levelup-remain" class="lede">One pick. The garden already knows.</p>
    <div id="levelup-cards" class="level-cards"></div>
    <p class="hint">Keys 1 to 4, or tap a card.</p>
  </div>
</div>

<div id="screen-shop" class="overlay dim" hidden>
  <div class="sheet sheet-wide">
    <header class="shop-head">
      <p class="kicker">BETWEEN ROWS</p>
      <h1>The gardener's table</h1>
      <p id="shop-lede" class="lede"></p>
      <p class="bag-line">Bag <strong id="shop-bag">0</strong></p>
    </header>
    <div class="shop-grid">
      <section class="shop-col">
        <h2>On the table</h2>
        <div id="shop-offers" class="offers"></div>
        <button id="shop-reroll" class="btn ghost" type="button">Turn over</button>
      </section>
      <section class="shop-col">
        <h2>In your hands</h2>
        <p id="shop-slots" class="muted-line"></p>
        <div id="shop-weapons" class="owned-list"></div>
        <h2>Pockets</h2>
        <div id="shop-items" class="item-list"></div>
      </section>
      <section class="shop-col shop-col-stats">
        <h2>The vegetable</h2>
        <div id="shop-stats" class="stats-panel"></div>
        <div class="shop-go">
          <button id="shop-next" class="btn primary big" type="button">Next wave</button>
        </div>
      </section>
    </div>
  </div>
</div>

<div id="screen-pause" class="overlay dim" hidden>
  <div class="sheet pause-sheet">
    <p class="kicker">HELD</p>
    <h1>Holding still.</h1>
    <p class="lede">The Mud is patient. The numbers below are still yours.</p>
    <div class="paint-settings" role="group" aria-label="Painting style">
      <p class="paint-kicker">Painting language</p>
      <div id="pause-paint" class="paint-row"></div>
    </div>
    <div class="actions">
      <button id="btn-resume" class="btn primary" type="button">Keep going</button>
      <button id="btn-quit" class="btn ghost" type="button">Walk off</button>
      <button id="btn-pause-mute" class="btn ghost" type="button" aria-pressed="false">Quiet the garden</button>
    </div>
    <div id="pause-stats" class="stats-panel"></div>
  </div>
</div>

<div id="screen-stats" class="overlay dim" hidden>
  <div class="sheet">
    <p class="kicker">LEDGER</p>
    <h1>What the garden wrote</h1>
    <p class="lede">Every number it has on you. Nothing here is a compliment.</p>
    <div id="stats-body" class="stats-panel"></div>
  </div>
</div>

<div id="screen-gameover" class="overlay dim" hidden>
  <div class="sheet">
    <p class="kicker">UNDER</p>
    <h1>Composted.</h1>
    <div id="over-hero" class="summary-hero"></div>
    <p id="over-lede" class="lede"></p>
    <ul id="over-summary" class="summary-list"></ul>
    <div id="over-build" class="build-block"></div>
    <div class="actions">
      <button id="btn-over-retry" class="btn primary" type="button">Again</button>
      <button id="btn-over-title" class="btn ghost" type="button">Back to the gate</button>
    </div>
  </div>
</div>

<div id="screen-victory" class="overlay dim" hidden>
  <div class="sheet">
    <p class="kicker">DAWN</p>
    <h1 id="win-heading">Still clean.</h1>
    <div id="win-hero" class="summary-hero"></div>
    <p id="win-lede" class="lede"></p>
    <ul id="win-summary" class="summary-list"></ul>
    <div id="win-build" class="build-block"></div>
    <div class="actions">
      <button id="btn-win-again" class="btn primary" type="button">Again</button>
      <button id="btn-win-title" class="btn ghost" type="button">Back to the gate</button>
    </div>
  </div>
</div>
`

interface WeaponSlotEls {
  root: HTMLDivElement
  img: HTMLImageElement
  cd: HTMLDivElement
  paint: string
  tier: number
  id: string
  cdFrac: number
}

interface CharCardView {
  ch: CharacterDef
  model: ModelDir
  root: HTMLElement
  img: HTMLImageElement
  nameEl: HTMLElement
  flavorEl: HTMLElement
  perksEl: HTMLElement
  modelBtns: HTMLButtonElement[]
}

interface HudCache {
  hp: number
  maxHp: number
  level: number
  xp: number
  xpNext: number
  materials: number
  wave: number
  waveTotal: number
  clock: string
  bossName: string | null
  bossHp: number
  bossMax: number
  form: Form | null
  nightmaresAlive: number
}

export function createUi(
  root: HTMLElement,
  art: { icon: RenderApi['icon']; portrait: RenderApi['portrait'] },
): UiApi {
  root.innerHTML = SKELETON

  const must = <T extends HTMLElement>(sel: string): T => {
    const n = root.querySelector<T>(sel)
    if (!n) throw new Error(`UI missing ${sel}`)
    return n
  }

  const hud = must<HTMLDivElement>('#hud')
  const hpFill = must<HTMLDivElement>('#hud-hp-fill')
  const hpText = must<HTMLElement>('#hud-hp-text')
  const xpFill = must<HTMLDivElement>('#hud-xp-fill')
  const xpText = must<HTMLElement>('#hud-xp-text')
  const levelEl = must<HTMLElement>('#hud-level')
  const waveEl = must<HTMLElement>('#hud-wave')
  const clockEl = must<HTMLElement>('#hud-clock')
  const mudMeter = must<HTMLDivElement>('#hud-mud')
  const mudCount = must<HTMLElement>('#hud-mud-count')
  const bossWrap = must<HTMLDivElement>('#hud-boss')
  const bossNameEl = must<HTMLElement>('#hud-boss-name')
  const bossFill = must<HTMLDivElement>('#hud-boss-fill')
  const materialsEl = must<HTMLElement>('#hud-materials')
  const bagIcon = must<HTMLImageElement>('#hud-bag-icon')
  const pauseBtn = must<HTMLButtonElement>('#hud-pause')
  const hudWeapons = must<HTMLDivElement>('#hud-weapons')

  const bannerEl = must<HTMLDivElement>('#banner')
  const bannerText = must<HTMLElement>('#banner-text')
  const bannerSub = must<HTMLElement>('#banner-sub')
  const toastsEl = must<HTMLDivElement>('#toasts')

  const bootCopy = must<HTMLElement>('#boot-copy')
  const errorCopy = must<HTMLElement>('#error-copy')
  const errorRetry = must<HTMLButtonElement>('#error-retry')
  const btnPlay = must<HTMLButtonElement>('#btn-play')
  const btnTitleMute = must<HTMLButtonElement>('#btn-title-mute')
  const titlePaint = must<HTMLDivElement>('#title-paint')
  const pausePaint = must<HTMLDivElement>('#pause-paint')
  const charGrid = must<HTMLDivElement>('#char-grid')
  const levelCards = must<HTMLDivElement>('#levelup-cards')
  const levelRemain = must<HTMLElement>('#levelup-remain')
  const shopLede = must<HTMLElement>('#shop-lede')
  const shopBag = must<HTMLElement>('#shop-bag')
  const shopOffers = must<HTMLDivElement>('#shop-offers')
  const shopReroll = must<HTMLButtonElement>('#shop-reroll')
  const shopSlots = must<HTMLElement>('#shop-slots')
  const shopWeapons = must<HTMLDivElement>('#shop-weapons')
  const shopItems = must<HTMLDivElement>('#shop-items')
  const shopStats = must<HTMLDivElement>('#shop-stats')
  const shopNext = must<HTMLButtonElement>('#shop-next')
  const pauseStats = must<HTMLDivElement>('#pause-stats')
  const statsBody = must<HTMLDivElement>('#stats-body')
  const btnResume = must<HTMLButtonElement>('#btn-resume')
  const btnQuit = must<HTMLButtonElement>('#btn-quit')
  const btnPauseMute = must<HTMLButtonElement>('#btn-pause-mute')
  const overLede = must<HTMLElement>('#over-lede')
  const overHero = must<HTMLDivElement>('#over-hero')
  const overSummary = must<HTMLUListElement>('#over-summary')
  const overBuild = must<HTMLDivElement>('#over-build')
  const btnOverRetry = must<HTMLButtonElement>('#btn-over-retry')
  const btnOverTitle = must<HTMLButtonElement>('#btn-over-title')
  const winHeading = must<HTMLElement>('#win-heading')
  const winLede = must<HTMLElement>('#win-lede')
  const winHero = must<HTMLDivElement>('#win-hero')
  const winSummary = must<HTMLUListElement>('#win-summary')
  const winBuild = must<HTMLDivElement>('#win-build')
  const btnWinAgain = must<HTMLButtonElement>('#btn-win-again')
  const btnWinTitle = must<HTMLButtonElement>('#btn-win-title')

  const overlayEls: Record<OverlayId, HTMLElement> = {
    boot: must('#screen-boot'),
    error: must('#screen-error'),
    title: must('#screen-title'),
    charselect: must('#screen-charselect'),
    levelup: must('#screen-levelup'),
    shop: must('#screen-shop'),
    paused: must('#screen-pause'),
    stats: must('#screen-stats'),
    gameover: must('#screen-gameover'),
    victory: must('#screen-victory'),
  }

  const iconCache = new Map<string, string>()
  const portraitCache = new Map<string, string>()

  function weaponIcon(paint: WeaponPaint): string {
    const key = `w:${paint}`
    let url = iconCache.get(key)
    if (url === undefined) {
      url = art.icon('weapon', paint, undefined, 48)
      iconCache.set(key, url)
    }
    return url
  }

  function itemIcon(paint: ItemPaint): string {
    const key = `i:${paint}`
    let url = iconCache.get(key)
    if (url === undefined) {
      url = art.icon('item', paint)
      iconCache.set(key, url)
    }
    return url
  }

  function portraitOf(character: CharacterDef, model: ModelDir = 'b'): string {
    const key = `${character.id}:${model}:${lookKey()}`
    let url = portraitCache.get(key)
    if (url === undefined) {
      url = art.portrait(character, 160, 'normal', model)
      portraitCache.set(key, url)
    }
    return url
  }

  function characterIcon(species: string, form: Form): string {
    const key = `c:${species}:${form}`
    let url = iconCache.get(key)
    if (url === undefined) {
      url = art.icon('character', species, undefined, 96, form)
      iconCache.set(key, url)
    }
    return url
  }

  function img(src: string, alt: string, w: number, h: number): HTMLImageElement {
    const n = document.createElement('img')
    n.src = src
    n.alt = alt
    n.width = w
    n.height = h
    n.draggable = false
    return n
  }

  try {
    bagIcon.src = art.icon('item', 'bag')
    bagIcon.alt = 'Materials'
  } catch {
    bagIcon.hidden = true
  }

  const slots: WeaponSlotEls[] = []
  for (let i = 0; i < 6; i++) {
    const slotRoot = h('div', { className: 'weapon-slot is-empty' })
    const slotImg = img('', '', 48, 48)
    slotImg.hidden = true
    const slotCd = h('div', { className: 'weapon-cd' })
    slotCd.style.setProperty('--cd', '0')
    slotRoot.append(slotImg, slotCd)
    hudWeapons.append(slotRoot)
    slots.push({
      root: slotRoot,
      img: slotImg,
      cd: slotCd,
      paint: '',
      tier: 0,
      id: '',
      cdFrac: -1,
    })
  }

  const hudCache: HudCache = {
    hp: Number.NaN,
    maxHp: Number.NaN,
    level: -1,
    xp: Number.NaN,
    xpNext: Number.NaN,
    materials: Number.NaN,
    wave: -1,
    waveTotal: -1,
    clock: '',
    bossName: null,
    bossHp: Number.NaN,
    bossMax: Number.NaN,
    form: null,
    nightmaresAlive: -1,
  }

  let activeOverlay: OverlayId | null = null
  let bannerTimer = 0
  let bannerHideTimer = 0
  let mutedUi = false

  let titleHandlers: {
    play(): void
    toggleMute(): void
    paintStyle: PaintStyle
    setPaintStyle(style: PaintStyle): void
  } | null = null
  let pauseRequest: (() => void) | null = null
  let pauseHandlers: {
    resume(): void
    quit(): void
    toggleMute(): void
    paintStyle: PaintStyle
    setPaintStyle(style: PaintStyle): void
  } | null = null
  let shopHandlers: ShopHandlers | null = null
  let overHandlers: { retry(): void; title(): void } | null = null
  let winHandlers: { again(): void; title(): void } | null = null

  let charCards: CharCardView[] = []
  let charIndex = 0
  let charPick: ((id: string, model: ModelDir) => void) | null = null
  let levelIds: string[] = []
  let levelPick: ((id: string) => void) | null = null
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function setMutedUi(muted: boolean): void {
    mutedUi = muted
    const label = muteLabel(muted)
    btnTitleMute.textContent = label
    btnPauseMute.textContent = label
    btnTitleMute.classList.toggle('is-muted', muted)
    btnPauseMute.classList.toggle('is-muted', muted)
    btnTitleMute.setAttribute('aria-pressed', String(muted))
    btnPauseMute.setAttribute('aria-pressed', String(muted))
  }

  function fillStats(host: HTMLElement, view: ShopView): void {
    host.replaceChildren()
    const hpWrap = h('div', { className: 'stat-hp' })
    hpWrap.append(
      h('div', {
        className: 'stat-hp-label',
        text: `HP  ${Math.round(view.hp)} / ${Math.round(view.maxHp)}`,
      }),
    )
    const bar = h('div', { className: 'bar hp-bar' })
    const fill = h('div', { className: 'bar-fill' })
    const frac = view.maxHp > 0 ? clamp(view.hp / view.maxHp, 0, 1) : 0
    fill.style.transform = `scaleX(${frac})`
    bar.append(fill)
    hpWrap.append(bar)
    host.append(hpWrap)
    for (const s of view.stats) {
      const row = h('div', { className: 'stat-row' })
      row.append(
        h('span', { text: s.label }),
        h('span', {
          className: 'stat-val',
          text: s.percent ? `${fmtNum(s.value)}%` : fmtNum(s.value),
        }),
      )
      host.append(row)
    }
  }

  function applyStats(view: ShopView): void {
    fillStats(shopStats, view)
    fillStats(pauseStats, view)
    fillStats(statsBody, view)
  }

  function highlightChar(): void {
    charCards.forEach((view, i) => {
      const on = i === charIndex
      view.root.classList.toggle('is-selected', on)
      if (on) view.root.focus()
    })
  }

  function fillPaintRow(host: HTMLElement, current: PaintStyle, onPick: (s: PaintStyle) => void): void {
    host.replaceChildren()
    for (const style of PAINT_STYLES) {
      const meta = PAINT_STYLE_LABELS[style]
      const btn = h('button', { className: `paint-seg${style === current ? ' is-on' : ''}` })
      btn.type = 'button'
      btn.setAttribute('aria-pressed', String(style === current))
      btn.append(h('span', { className: 'paint-letter', text: meta.kicker }))
      btn.append(h('span', { className: 'paint-name', text: meta.name }))
      btn.title = meta.blurb
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (style === current) return
        portraitCache.clear()
        onPick(style)
      })
      host.append(btn)
    }
  }

  function fillPerks(host: HTMLElement, lines: string[]): void {
    host.replaceChildren()
    for (const line of lines) host.append(h('li', { text: line }))
  }

  function applyCardForm(view: CharCardView): void {
    const meta = MODEL_LABELS[view.model]
    view.root.classList.remove('is-mud', 'model-a', 'model-b', 'model-c')
    view.root.classList.add(`model-${view.model}`)
    view.img.src = portraitOf(view.ch, view.model)
    view.img.alt = `${view.ch.name} · ${meta.name}`
    view.nameEl.textContent = view.ch.name
    view.flavorEl.textContent = view.ch.flavor
    fillPerks(view.perksEl, view.ch.perks)
    view.modelBtns.forEach((btn, i) => {
      const dir = MODEL_DIRS[i]
      const on = dir === view.model
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
    })
  }

  function cycleCharModel(index: number, step: 1 | -1): void {
    const view = charCards[index]
    if (!view) return
    const i = MODEL_DIRS.indexOf(view.model)
    const next = MODEL_DIRS[(i + step + MODEL_DIRS.length) % MODEL_DIRS.length]
    if (!next) return
    view.model = next
    applyCardForm(view)
  }

  function setCharModel(view: CharCardView, model: ModelDir): void {
    if (view.model === model) return
    view.model = model
    applyCardForm(view)
  }

  function summaryRows(summary: RunSummary): HTMLLIElement[] {
    const rows: { k: string; v: string }[] = [
      { k: 'Name', v: summary.characterName },
      {
        k: 'Waves',
        v: summary.won
          ? `Cleared all ${summary.wavesTotal}`
          : `${summary.wave} of ${summary.wavesTotal}`,
      },
      { k: 'Time', v: formatClock(summary.timeSeconds) },
      { k: 'Level', v: String(summary.level) },
      { k: 'Kills', v: String(summary.kills) },
      { k: 'Damage dealt', v: fmtNum(summary.damageDealt) },
      { k: 'Damage taken', v: fmtNum(summary.damageTaken) },
      { k: 'Materials pocketed', v: String(summary.materialsCollected) },
    ]
    return rows.map((r) => {
      const li = h('li')
      li.append(h('span', { text: r.k }), h('span', { text: r.v }))
      return li
    })
  }

  function fillBuild(host: HTMLElement, summary: RunSummary): void {
    host.replaceChildren()
    const weapHead = h('h2', { text: 'What you carried' })
    const weapRow = h('div', { className: 'build-row' })
    if (summary.weapons.length === 0) {
      weapRow.append(h('p', { className: 'empty-note', text: 'Empty hands. Brave, or foolish.' }))
    } else {
      for (const w of summary.weapons) {
        const chip = h('div', { className: `build-chip tier-${w.tier}` })
        chip.append(img(weaponIcon(w.paint), w.name, 32, 32))
        chip.append(
          h('span', { text: `${w.name} · ${TIER_NAMES[w.tier]}` }),
        )
        weapRow.append(chip)
      }
    }
    const itemHead = h('h2', { text: 'What was in the pockets' })
    const itemRow = h('div', { className: 'build-row' })
    if (summary.items.length === 0) {
      itemRow.append(h('p', { className: 'empty-note', text: 'Pockets empty.' }))
    } else {
      for (const it of summary.items) {
        const chip = h('div', { className: `build-chip tier-${it.tier}` })
        chip.append(img(itemIcon(it.paint), it.name, 32, 32))
        const count = it.count > 1 ? ` ×${it.count}` : ''
        chip.append(h('span', { text: `${it.name}${count}` }))
        itemRow.append(chip)
      }
    }
    host.append(weapHead, weapRow, itemHead, itemRow)
  }

  function fillHero(host: HTMLElement, summary: RunSummary): void {
    host.replaceChildren(
      img(characterIcon(summary.species, summary.form), summary.characterName, 96, 96),
    )
  }

  errorRetry.addEventListener('click', () => {
    window.location.reload()
  })

  btnPlay.addEventListener('click', () => {
    titleHandlers?.play()
  })

  btnTitleMute.addEventListener('click', () => {
    const before = mutedUi
    titleHandlers?.toggleMute()
    if (mutedUi === before) setMutedUi(!before)
  })

  pauseBtn.addEventListener('click', () => {
    pauseRequest?.()
  })

  btnResume.addEventListener('click', () => {
    pauseHandlers?.resume()
  })

  btnQuit.addEventListener('click', () => {
    pauseHandlers?.quit()
  })

  btnPauseMute.addEventListener('click', () => {
    const before = mutedUi
    pauseHandlers?.toggleMute()
    if (mutedUi === before) setMutedUi(!before)
  })

  shopReroll.addEventListener('click', () => {
    shopHandlers?.reroll()
  })

  shopNext.addEventListener('click', () => {
    shopHandlers?.next()
  })

  btnOverRetry.addEventListener('click', () => {
    overHandlers?.retry()
  })
  btnOverTitle.addEventListener('click', () => {
    overHandlers?.title()
  })
  btnWinAgain.addEventListener('click', () => {
    winHandlers?.again()
  })
  btnWinTitle.addEventListener('click', () => {
    winHandlers?.title()
  })

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (activeOverlay === 'levelup') {
      let idx = -1
      if (e.code === 'Digit1' || e.code === 'Numpad1') idx = 0
      else if (e.code === 'Digit2' || e.code === 'Numpad2') idx = 1
      else if (e.code === 'Digit3' || e.code === 'Numpad3') idx = 2
      else if (e.code === 'Digit4' || e.code === 'Numpad4') idx = 3
      if (idx >= 0) {
        const id = levelIds[idx]
        if (id !== undefined && levelPick) {
          e.preventDefault()
          levelPick(id)
        }
      }
      return
    }
    if (activeOverlay === 'charselect' && charCards.length > 0) {
      const n = charCards.length
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (e.code === 'ArrowDown') charIndex = (charIndex + 1) % n
        else charIndex = (charIndex - 1 + n) % n
        highlightChar()
        return
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyF') {
        e.preventDefault()
        if (e.target instanceof HTMLElement) {
          const card = e.target.closest('.char-card')
          if (card) {
            const i = charCards.findIndex((v) => v.root === card)
            if (i >= 0) charIndex = i
          }
        }
        cycleCharModel(charIndex, e.code === 'ArrowLeft' ? -1 : 1)
        highlightChar()
        return
      }
      if (e.code === 'Enter') {
        e.preventDefault()
        const view = charCards[charIndex]
        if (view && charPick) charPick(view.ch.id, view.model)
      }
    }
  })

  const api: UiApi = {
    showScreen(phase: RunPhase | null): void {
      const show = isOverlay(phase) ? phase : null
      activeOverlay = show
      for (const key of OVERLAYS) {
        overlayEls[key].hidden = key !== show
      }
    },

    setBootCopy(text: string): void {
      bootCopy.textContent = text
    },

    setErrorCopy(text: string): void {
      errorCopy.textContent = text
    },

    setHudVisible(visible: boolean): void {
      hud.hidden = !visible
      if (!visible) document.body.classList.remove('form-nightmare')
    },

    renderHud(snap: HudSnapshot): void {
      if (snap.hp !== hudCache.hp || snap.maxHp !== hudCache.maxHp) {
        hudCache.hp = snap.hp
        hudCache.maxHp = snap.maxHp
        const frac = snap.maxHp > 0 ? clamp(snap.hp / snap.maxHp, 0, 1) : 0
        hpFill.style.transform = `scaleX(${frac})`
        hpText.textContent = `${Math.max(0, Math.round(snap.hp))} / ${Math.round(snap.maxHp)}`
      }
      if (snap.level !== hudCache.level) {
        hudCache.level = snap.level
        levelEl.textContent = String(snap.level)
      }
      if (snap.xp !== hudCache.xp || snap.xpNext !== hudCache.xpNext) {
        hudCache.xp = snap.xp
        hudCache.xpNext = snap.xpNext
        const frac = snap.xpNext > 0 ? clamp(snap.xp / snap.xpNext, 0, 1) : 1
        xpFill.style.transform = `scaleX(${frac})`
        xpText.textContent = `${Math.round(snap.xp)}/${Math.round(snap.xpNext)}`
      }
      if (snap.materials !== hudCache.materials) {
        hudCache.materials = snap.materials
        materialsEl.textContent = String(snap.materials)
      }
      if (snap.wave !== hudCache.wave || snap.waveTotal !== hudCache.waveTotal) {
        hudCache.wave = snap.wave
        hudCache.waveTotal = snap.waveTotal
        waveEl.textContent = `Wave ${snap.wave} of ${snap.waveTotal}`
      }
      const clock = formatClock(snap.waveLeft)
      if (clock !== hudCache.clock) {
        hudCache.clock = clock
        clockEl.textContent = clock
      }
      if (snap.form !== hudCache.form) {
        hudCache.form = snap.form
      }
      if (snap.nightmaresAlive !== hudCache.nightmaresAlive) {
        hudCache.nightmaresAlive = snap.nightmaresAlive
        if (snap.nightmaresAlive > 0) {
          mudMeter.hidden = false
          mudCount.textContent = String(snap.nightmaresAlive)
          mudMeter.classList.toggle('is-hot', snap.nightmaresAlive >= 5)
        } else {
          mudMeter.hidden = true
          mudMeter.classList.remove('is-hot')
        }
      }

      const boss = snap.boss
      if (!boss) {
        if (hudCache.bossName !== null) {
          hudCache.bossName = null
          bossWrap.hidden = true
        }
      } else {
        if (hudCache.bossName !== boss.name) {
          hudCache.bossName = boss.name
          bossNameEl.textContent = boss.name
          bossWrap.hidden = false
        }
        if (boss.hp !== hudCache.bossHp || boss.maxHp !== hudCache.bossMax) {
          hudCache.bossHp = boss.hp
          hudCache.bossMax = boss.maxHp
          const frac = boss.maxHp > 0 ? clamp(boss.hp / boss.maxHp, 0, 1) : 0
          bossFill.style.transform = `scaleX(${frac})`
        }
      }

      for (let i = 0; i < 6; i++) {
        const slot = slots[i]
        if (!slot) continue
        const w = snap.weapons[i]
        if (!w) {
          if (slot.id !== '') {
            slot.id = ''
            slot.paint = ''
            slot.tier = 0
            slot.cdFrac = -1
            slot.root.className = 'weapon-slot is-empty'
            slot.root.removeAttribute('title')
            slot.img.hidden = true
            slot.img.removeAttribute('src')
            slot.cd.style.setProperty('--cd', '0')
          }
          continue
        }
        if (slot.paint !== w.paint || slot.id !== w.id) {
          slot.paint = w.paint
          slot.id = w.id
          slot.img.src = weaponIcon(w.paint)
          slot.img.alt = w.name
          slot.img.hidden = false
          slot.root.title = w.name
        }
        if (slot.tier !== w.tier) {
          slot.tier = w.tier
          slot.root.className = `weapon-slot tier-${w.tier}`
        }
        const cd = Math.round(clamp(w.cooldownFrac, 0, 1) * 100) / 100
        if (cd !== slot.cdFrac) {
          slot.cdFrac = cd
          slot.cd.style.setProperty('--cd', String(cd))
        }
      }
    },

    renderCharSelect(characters: CharacterDef[], onPick: (id: string, model: ModelDir) => void): void {
      charPick = onPick
      charIndex = 0
      charCards = []
      charGrid.replaceChildren()
      portraitCache.clear()
      for (const ch of characters) {
        const card = h('div', { className: 'char-card' })
        card.tabIndex = 0
        card.dataset.id = ch.id
        const portrait = img(portraitOf(ch, 'b'), ch.name, 160, 160)
        const nameEl = h('h2', { text: ch.name })
        const flavorEl = h('p', { className: 'char-flavor', text: ch.flavor })
        const perksEl = h('ul', { className: 'perk-list' })
        fillPerks(perksEl, ch.perks)
        const toggle = h('div', { className: 'form-toggle model-toggle' })
        toggle.setAttribute('role', 'group')
        toggle.setAttribute('aria-label', 'Model')
        const modelBtns: HTMLButtonElement[] = []
        const view: CharCardView = {
          ch,
          model: 'b',
          root: card,
          img: portrait,
          nameEl,
          flavorEl,
          perksEl,
          modelBtns,
        }
        for (const dir of MODEL_DIRS) {
          const btn = h('button', { className: 'form-seg', text: MODEL_LABELS[dir].name })
          btn.type = 'button'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = MODEL_LABELS[dir].blurb
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation()
            charIndex = charCards.indexOf(view)
            setCharModel(view, dir)
            highlightChar()
          })
          toggle.append(btn)
          modelBtns.push(btn)
        }
        applyCardForm(view)
        toggle.addEventListener('click', (ev) => ev.stopPropagation())
        card.addEventListener('click', (ev) => {
          if (ev.target instanceof HTMLElement && ev.target.closest('.char-card')) return
          charIndex = charCards.indexOf(view)
          highlightChar()
          onPick(ch.id, view.model)
        })
        card.append(portrait, nameEl, flavorEl, perksEl, toggle)
        charGrid.append(card)
        charCards.push(view)
      }
      highlightChar()
    },

    renderLevelUp(options: LevelUpOption[], remaining: number, onPick: (id: string) => void): void {
      levelPick = onPick
      levelIds = options.map((o) => o.id)
      levelRemain.textContent = 'One pick. The garden already knows.'
      levelRemain.dataset.remaining = String(remaining)
      levelCards.replaceChildren()
      options.forEach((opt, i) => {
        const card = h('button', { className: `level-card tier-${opt.tier}` })
        card.type = 'button'
        card.append(h('div', { className: 'level-key', text: `${i + 1}` }))
        card.append(h('h2', { text: opt.title }))
        card.append(h('p', { text: opt.blurb }))
        card.append(
          h('span', {
            className: `tier-tag tier-${opt.tier}`,
            text: TIER_NAMES[opt.tier],
          }),
        )
        card.addEventListener('click', () => onPick(opt.id))
        levelCards.append(card)
      })
    },

    renderShop(view: ShopView, handlers: ShopHandlers): void {
      shopHandlers = handlers
      applyStats(view)
      shopLede.textContent = `Wave ${view.wave} is under. Wave ${view.nextWave} is coming up.`
      shopBag.textContent = String(view.materials)
      shopReroll.textContent =
        view.freeRerolls > 0 ? 'Turn over · Free' : `Turn over · ${view.rerollPrice}`
      shopSlots.textContent = `${view.weapons.length} of ${view.weaponSlots} hands full.`

      shopOffers.replaceChildren()
      for (const offer of view.offers) {
        const card = h('div', {
          className: `offer-card tier-${offer.tier}${offer.locked ? ' is-locked' : ''}${offer.affordable ? '' : ' is-broke'}`,
        })
        const src =
          offer.kind === 'weapon'
            ? weaponIcon(offer.paint as WeaponPaint)
            : itemIcon(offer.paint as ItemPaint)
        card.append(img(src, offer.name, 48, 48))
        const body = h('div')
        body.append(h('h3', { className: 'offer-name', text: offer.name }))
        body.append(h('p', { className: 'offer-flavor', text: offer.flavor }))
        const lines = h('ul', { className: 'offer-lines' })
        for (const line of offer.lines) lines.append(h('li', { text: line }))
        body.append(lines)
        if (offer.combines) {
          body.append(h('div', { className: 'combine-tag', text: 'Combines with one you already hold' }))
        }
        const actions = h('div', { className: 'offer-actions' })
        const buy = h('button', {
          className: 'btn primary offer-buy',
          text: offer.combines ? `Combine · ${offer.price}` : `Buy · ${offer.price}`,
        })
        buy.type = 'button'
        buy.disabled = !offer.affordable
        buy.addEventListener('click', () => handlers.buy(offer.uid))
        const lock = h('button', {
          className: 'btn ghost offer-lock',
          text: offer.locked ? 'Locked' : 'Lock',
        })
        lock.type = 'button'
        lock.addEventListener('click', () => handlers.toggleLock(offer.uid))
        actions.append(buy, lock)
        body.append(actions)
        card.append(body)
        shopOffers.append(card)
      }

      shopWeapons.replaceChildren()
      if (view.weapons.length === 0) {
        shopWeapons.append(
          h('p', { className: 'empty-note', text: 'Hands empty.' }),
        )
      } else {
        for (const w of view.weapons) {
          const row = h('div', { className: `owned-row tier-${w.tier}` })
          row.append(img(weaponIcon(w.paint), w.name, 40, 40))
          const mid = h('div')
          mid.append(h('p', { className: 'owned-name', text: `${w.name} · ${TIER_NAMES[w.tier]}` }))
          if (w.lines.length > 0) {
            mid.append(h('p', { className: 'owned-lines', text: w.lines.join(' · ') }))
          }
          row.append(mid)
          const sell = h('button', { className: 'btn ghost', text: `Sell · ${w.sellPrice}` })
          sell.type = 'button'
          sell.addEventListener('click', () => handlers.sell(w.uid))
          row.append(sell)
          shopWeapons.append(row)
        }
      }

      shopItems.replaceChildren()
      if (view.items.length === 0) {
        shopItems.append(h('p', { className: 'empty-note', text: 'Pockets empty.' }))
      } else {
        for (const it of view.items) {
          const row = h('div', { className: `item-row tier-${it.tier}` })
          row.append(img(itemIcon(it.paint), it.name, 40, 40))
          row.append(h('p', { className: 'item-name', text: it.name }))
          row.append(h('span', { className: 'item-count', text: it.count > 1 ? `×${it.count}` : '×1' }))
          shopItems.append(row)
        }
      }
    },

    renderPause(
      view: ShopView,
      handlers: {
        resume(): void
        quit(): void
        toggleMute(): void
        muted: boolean
        paintStyle: PaintStyle
        setPaintStyle(style: PaintStyle): void
      },
    ): void {
      pauseHandlers = handlers
      applyStats(view)
      setMutedUi(handlers.muted)
      fillPaintRow(pausePaint, handlers.paintStyle, handlers.setPaintStyle)
    },

    renderGameOver(summary: RunSummary, handlers: { retry(): void; title(): void }): void {
      overHandlers = handlers
      const clock = formatClock(summary.timeSeconds)
      const killer = summary.killedBy ?? 'the soil'
      overLede.textContent = `${summary.characterName} went under on wave ${summary.wave} after ${clock}. Killed by ${killer}.`
      fillHero(overHero, summary)
      overSummary.replaceChildren(...summaryRows(summary))
      fillBuild(overBuild, summary)
    },

    renderVictory(summary: RunSummary, handlers: { again(): void; title(): void }): void {
      winHandlers = handlers
      winHeading.textContent = 'Still clean.'
      winLede.textContent = `${summary.characterName} walked out of the Plot. 20 waves. The Mud will remember.`
      fillHero(winHero, summary)
      winSummary.replaceChildren(...summaryRows(summary))
      fillBuild(winBuild, summary)
    },

    banner(text: string, sub?: string, ms = 2400): void {
      window.clearTimeout(bannerTimer)
      window.clearTimeout(bannerHideTimer)
      bannerText.textContent = text
      if (sub) {
        bannerSub.textContent = sub
        bannerSub.hidden = false
      } else {
        bannerSub.textContent = ''
        bannerSub.hidden = true
      }
      bannerEl.hidden = false
      bannerEl.classList.remove('is-out')
      if (reduceMotion.matches) {
        bannerEl.classList.add('is-in')
        bannerTimer = window.setTimeout(() => {
          bannerEl.classList.remove('is-in')
          bannerEl.hidden = true
        }, ms)
        return
      }
      bannerEl.classList.remove('is-in')
      void bannerEl.offsetWidth
      bannerEl.classList.add('is-in')
      bannerTimer = window.setTimeout(() => {
        bannerEl.classList.remove('is-in')
        bannerEl.classList.add('is-out')
        bannerHideTimer = window.setTimeout(() => {
          bannerEl.classList.remove('is-out')
          bannerEl.hidden = true
        }, 360)
      }, ms)
    },

    toast(text: string): void {
      while (toastsEl.childElementCount >= 4) {
        toastsEl.firstElementChild?.remove()
      }
      const el = h('div', { className: 'toast', text })
      toastsEl.append(el)
      window.setTimeout(() => {
        el.classList.add('is-out')
        window.setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 300)
      }, 2600)
    },

    setJoystickVisible(visible: boolean): void {
      const stick = document.getElementById('stick')
      if (stick) stick.hidden = !visible
    },

    onTitle(handlers: {
      play(): void
      toggleMute(): void
      muted: boolean
      paintStyle: PaintStyle
      setPaintStyle(style: PaintStyle): void
    }): void {
      titleHandlers = handlers
      setMutedUi(handlers.muted)
      fillPaintRow(titlePaint, handlers.paintStyle, handlers.setPaintStyle)
    },

    onPauseRequest(handler: () => void): void {
      pauseRequest = handler
    },
  }

  return api
}
