import { clamp, formatClock } from '../core/math.ts'
import { TIER_NAMES } from '../core/types.ts'
import type {
  CharacterDef,
  Form,
  HudSnapshot,
  ItemPaint,
  LevelUpOption,
  ModelDir,
  FxToggle,
  PaintStyle,
  PlantHandlers,
  PlantView,
  BedOffer,
  FarmShopHandlers,
  FarmShopView,
  RenderApi,
  RunPhase,
  RunSummary,
  ShopHandlers,
  ShopView,
  UiApi,
  WeaponPaint,
} from '../core/types.ts'
import { CROP_IDS, STARTER_CROP_IDS } from '../core/types.ts'
import type { CropId } from '../core/types.ts'
import { CROPS } from '../data/crops.ts'
import { MODEL_LABELS, PAINT_STYLE_LABELS, PAINT_STYLES, defaultModelForSpecies, getLastModel, lookKey, modelsForSpecies } from '../render/look.ts'
import { seedIconDataUrl } from '../render/crops.ts'
import { MAP_CHOICES, arenaMap, setArenaMap } from '../data/mapMode.ts'

const OVERLAYS: readonly Exclude<RunPhase, 'wave'>[] = [
  'boot',
  'error',
  'title',
  'charselect',
  'plant',
  'farmshop',
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

function fillBeds(host: HTMLElement, beds: BedOffer[], onBuy: (id: string) => void): void {
  host.replaceChildren()
  for (const bed of beds) {
    const card = h('button', {
      className: `bed-card is-${bed.state}${bed.affordable ? '' : ' is-broke'}`,
    })
    card.type = 'button'
    card.disabled = bed.state !== 'ready' || !bed.affordable
    card.append(h('span', { className: 'bed-name', text: bed.label }))
    card.append(h('span', { className: 'bed-cost', text: bed.hint }))
    if (bed.state === 'ready' && bed.affordable) {
      card.addEventListener('click', () => onBuy(bed.id))
    }
    host.append(card)
  }
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
            <div id="hud-hp-delay" class="bar-fill bar-delay"></div>
            <div id="hud-hp-fill" class="bar-fill"></div>
          </div>
          <span id="hud-hp-text" class="bar-num">0 / 0</span>
        </div>
        <div class="bar-block">
          <span class="bar-label">Lv <span id="hud-level">1</span></span>
          <div class="bar xp-bar" role="meter" aria-label="Experience">
            <div id="hud-xp-delay" class="bar-fill bar-delay"></div>
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
        <div id="hud-row" class="row-label">Fallow</div>
        <div id="hud-callout" class="hud-callout" hidden>
          <div id="hud-callout-text" class="hud-callout-text"></div>
          <div id="hud-callout-sub" class="hud-callout-sub" hidden></div>
        </div>
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
      <div class="bag-scrap scrap seed-scrap" id="hud-seeds" title="Seeds in the pouch"></div>
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
<div id="seed-pops" class="seed-pops" aria-live="polite"></div>

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
      The rain came, the mud came up, and the vegetables that went under came back wrong. You stay clean. They don't. The battleground is the farm: what you sow determines who comes up next.
    </p>
    <div class="actions">
      <button id="btn-play" class="btn primary" type="button">Go out into the Plot</button>
      <button id="btn-title-mute" class="btn ghost" type="button" aria-pressed="false">Quiet the garden</button>
    </div>
    <div class="paint-settings" role="group" aria-label="Painting style">
      <p class="paint-kicker">Painting language</p>
      <div id="title-paint" class="paint-row"></div>
      <button id="btn-title-juice" class="btn ghost juice-btn" type="button" aria-pressed="false">Ease the shake</button>
    </div>
    <fieldset class="options-panel" id="title-map">
      <legend class="paint-kicker">Garden map</legend>
      <div class="map-pick" role="group" aria-label="Garden map"></div>
    </fieldset>
    <ul class="howto">
      <li>WASD or arrows to move. P holds still. 1–4 pick. M quiets.</li>
      <li>Between waves, sow the rows. They come up from those beds. Seeds you sow are spent.</li>
      <li>Drag the stick. Pause is top right.</li>
    </ul>
  </div>
</div>

<div id="screen-charselect" class="overlay cover" hidden>
  <div class="sheet sheet-wide">
    <p class="kicker">THE GATE</p>
    <h1>Pick a vegetable</h1>
    <p class="lede">Four ways into the Plot. Radish, Spud, Carrot, or Chili. Flip the card for Wash, Sketch, or Stain — same vegetable, different face. Radish also has Board: the magenta wet-soil painting, used as the sprite. Chili also has Painted: the earlier pepper sheet. You stay clean. Mud is for them. After the gate, you sow the rows.</p>
    <div id="char-grid" class="char-grid"></div>
  </div>
</div>

<div id="screen-plant" class="overlay dim" hidden>
  <div class="sheet sheet-wide plant-sheet">
    <header class="plant-head">
      <p class="kicker">THE ROWS</p>
      <h1 id="plant-heading">Sow the rows.</h1>
      <p id="plant-lede" class="lede"></p>
      <p id="plant-last" class="muted-line" hidden></p>
    </header>
    <div class="plant-layout">
      <section class="plant-tray">
        <h2>Seed pouch</h2>
        <div id="plant-seeds" class="seed-tray"></div>
        <p class="hint">Keys pick a seed. Click a bed to plant. Uproot returns it until you sow — then it is gone.</p>
      </section>
      <section class="plant-field">
        <h2>Three rows</h2>
        <div id="plant-plots" class="garden-rows" role="group" aria-label="Garden rows"></div>
      </section>
      <section class="plant-forecast">
        <h2 id="plant-threat">Fallow</h2>
        <p id="plant-threat-blurb" class="lede"></p>
        <p id="plant-comes" class="plant-comes"></p>
        <p id="plant-pay" class="bag-line"></p>
        <p id="plant-buffs" class="muted-line" hidden></p>
        <div class="plant-go">
          <button id="plant-clear" class="btn ghost" type="button">Uproot all</button>
          <button id="plant-sow" class="btn primary big" type="button">The rain starts</button>
        </div>
      </section>
    </div>
  </div>
</div>

<div id="screen-farmshop" class="overlay dim" hidden>
  <div class="sheet sheet-wide">
    <header class="shop-head">
      <p class="kicker">THE SHED</p>
      <h1>Farm supplies</h1>
      <p id="farm-recap" class="wave-recap"></p>
      <p id="farm-lede" class="lede"></p>
      <p class="bag-line">Bag <strong id="farm-bag">0</strong></p>
      <h2 class="bed-kicker">Beds</h2>
      <div id="farm-beds" class="bed-row" aria-label="Garden beds"></div>
    </header>
    <div class="shop-grid farm-shop-grid">
      <section class="shop-col">
        <h2>On the bench</h2>
        <div id="farm-offers" class="offers"></div>
        <button id="farm-reroll" class="btn ghost" type="button">Turn over</button>
      </section>
      <section class="shop-col">
        <h2>Pouch</h2>
        <div id="farm-pouch" class="item-list"></div>
        <p id="farm-buffs" class="muted-line"></p>
      </section>
      <section class="shop-col shop-col-stats">
        <p class="lede">Same scraps as the gardener's table. Seeds you buy stay. Fertilizer and pesticide last one wave.</p>
        <div class="shop-go">
          <button id="farm-next" class="btn primary big" type="button">To the rows</button>
        </div>
      </section>
    </div>
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
      <h2 class="bed-kicker">Beds</h2>
      <div id="shop-beds" class="bed-row" aria-label="Garden beds"></div>
    </header>
    <div class="shop-grid">
      <section class="shop-col">
        <h2>On the table</h2>
        <div id="shop-offers" class="offers"></div>
        <button id="shop-reroll" class="btn ghost" type="button">Turn over</button>
        <p class="hint">Number keys buy. R turns over. Enter starts the wave.</p>
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
      <button id="btn-pause-juice" class="btn ghost juice-btn" type="button" aria-pressed="false">Ease the shake</button>
    </div>
    <fieldset class="options-panel" id="pause-options">
      <legend class="paint-kicker">Options</legend>
      <label class="opt-row"><input type="checkbox" id="opt-telegraphs" /> Ground marks</label>
      <label class="opt-row"><input type="checkbox" id="opt-nums" /> Damage numbers</label>
      <label class="opt-row"><input type="checkbox" id="opt-combo" /> Chain text</label>
      <label class="opt-row"><input type="checkbox" id="opt-shake" /> Screen shake</label>
      <label class="opt-row"><input type="checkbox" id="opt-hitstop" /> Hit-stop</label>
      <label class="opt-row opt-slider" for="opt-zoom">Camera
        <input type="range" id="opt-zoom" min="0.7" max="1.5" step="0.05" />
        <span id="opt-zoom-val">1.25</span>
      </label>
      <div class="map-pick" id="pause-map" role="group" aria-label="Garden map"></div>
    </fieldset>
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
  dirs: readonly ModelDir[]
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
  rowLabel: string
  seedsKey: string
}

export function createUi(
  root: HTMLElement,
  art: { icon: RenderApi['icon']; portrait: RenderApi['portrait'] },
): UiApi {
  root.innerHTML = SKELETON

  const currentMap = arenaMap()
  root.querySelectorAll<HTMLElement>('.map-pick').forEach((host) => {
    host.replaceChildren(
      ...MAP_CHOICES.map((choice) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'btn ghost'
        btn.textContent = choice.label
        btn.setAttribute('aria-pressed', choice.id === currentMap ? 'true' : 'false')
        btn.addEventListener('click', () => setArenaMap(choice.id))
        return btn
      }),
    )
  })

  const must = <T extends HTMLElement>(sel: string): T => {
    const n = root.querySelector<T>(sel)
    if (!n) throw new Error(`UI missing ${sel}`)
    return n
  }

  const hud = must<HTMLDivElement>('#hud')
  const hpFill = must<HTMLDivElement>('#hud-hp-fill')
  const hpDelayEl = must<HTMLDivElement>('#hud-hp-delay')
  const hpText = must<HTMLElement>('#hud-hp-text')
  const xpFill = must<HTMLDivElement>('#hud-xp-fill')
  const xpDelayEl = must<HTMLDivElement>('#hud-xp-delay')
  const xpText = must<HTMLElement>('#hud-xp-text')
  const levelEl = must<HTMLElement>('#hud-level')
  const waveEl = must<HTMLElement>('#hud-wave')
  const clockEl = must<HTMLElement>('#hud-clock')
  const rowEl = must<HTMLElement>('#hud-row')
  const calloutEl = must<HTMLDivElement>('#hud-callout')
  const calloutText = must<HTMLElement>('#hud-callout-text')
  const calloutSub = must<HTMLElement>('#hud-callout-sub')
  const hudSeeds = must<HTMLDivElement>('#hud-seeds')
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
  const seedPopsEl = must<HTMLDivElement>('#seed-pops')
  const seedPopLive = new Map<CropId, { el: HTMLElement; count: number; timer: number }>

  const bootCopy = must<HTMLElement>('#boot-copy')
  const errorCopy = must<HTMLElement>('#error-copy')
  const errorRetry = must<HTMLButtonElement>('#error-retry')
  const btnPlay = must<HTMLButtonElement>('#btn-play')
  const btnTitleMute = must<HTMLButtonElement>('#btn-title-mute')
  const btnTitleJuice = must<HTMLButtonElement>('#btn-title-juice')
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
  const btnPauseJuice = must<HTMLButtonElement>('#btn-pause-juice')
  const optTelegraphs = must<HTMLInputElement>('#opt-telegraphs')
  const optNums = must<HTMLInputElement>('#opt-nums')
  const optCombo = must<HTMLInputElement>('#opt-combo')
  const optShake = must<HTMLInputElement>('#opt-shake')
  const optHitstop = must<HTMLInputElement>('#opt-hitstop')
  const optZoom = must<HTMLInputElement>('#opt-zoom')
  const optZoomVal = must<HTMLElement>('#opt-zoom-val')
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
  const plantHeading = must<HTMLElement>('#plant-heading')
  const plantLede = must<HTMLElement>('#plant-lede')
  const plantLast = must<HTMLElement>('#plant-last')
  const plantSeeds = must<HTMLDivElement>('#plant-seeds')
  const plantPlots = must<HTMLDivElement>('#plant-plots')
  const plantThreat = must<HTMLElement>('#plant-threat')
  const plantThreatBlurb = must<HTMLElement>('#plant-threat-blurb')
  const plantComes = must<HTMLElement>('#plant-comes')
  const plantPay = must<HTMLElement>('#plant-pay')
  const plantClear = must<HTMLButtonElement>('#plant-clear')
  const plantSow = must<HTMLButtonElement>('#plant-sow')
  const plantBuffs = must<HTMLElement>('#plant-buffs')
  const farmLede = must<HTMLElement>('#farm-lede')
  const farmRecap = must<HTMLElement>('#farm-recap')
  const farmBag = must<HTMLElement>('#farm-bag')
  const farmOffers = must<HTMLDivElement>('#farm-offers')
  const farmReroll = must<HTMLButtonElement>('#farm-reroll')
  const farmPouch = must<HTMLDivElement>('#farm-pouch')
  const farmBuffs = must<HTMLElement>('#farm-buffs')
  const farmNext = must<HTMLButtonElement>('#farm-next')
  const farmBeds = must<HTMLDivElement>('#farm-beds')
  const shopBeds = must<HTMLDivElement>('#shop-beds')

  const overlayEls: Record<OverlayId, HTMLElement> = {
    boot: must('#screen-boot'),
    error: must('#screen-error'),
    title: must('#screen-title'),
    charselect: must('#screen-charselect'),
    plant: must('#screen-plant'),
    farmshop: must('#screen-farmshop'),
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

  function characterIcon(species: string, form: Form, model?: ModelDir): string {
    const key = `c:${species}:${form}:${model ?? 'a'}:${lookKey()}`
    let url = iconCache.get(key)
    if (url === undefined) {
      url = art.icon('character', species, undefined, 96, form, model)
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
    rowLabel: '',
    seedsKey: '',
  }

  let activeOverlay: OverlayId | null = null
  let bannerTimer = 0
  let bannerHideTimer = 0
  let calloutTimer = 0
  let mutedUi = false
  let juiceUi = false
  let hpDelayFrac = 1
  let xpDelayFrac = 0

  let titleHandlers: {
    play(): void
    toggleMute(): void
    paintStyle: PaintStyle
    setPaintStyle(style: PaintStyle): void
    reducedJuice: boolean
    setReducedJuice(v: boolean): void
  } | null = null
  let pauseRequest: (() => void) | null = null
  let pauseHandlers: {
    resume(): void
    quit(): void
    toggleMute(): void
    paintStyle: PaintStyle
    setPaintStyle(style: PaintStyle): void
    reducedJuice: boolean
    setReducedJuice(v: boolean): void
    fx: Record<FxToggle, boolean>
    setFx(flag: FxToggle, value: boolean): void
    zoom: number
    setZoom(value: number): void
  } | null = null
  let shopHandlers: ShopHandlers | null = null
  let shopOfferUids: number[] = []
  let plantHandlers: PlantHandlers | null = null
  let farmShopHandlers: FarmShopHandlers | null = null
  let plantUnlocked: CropId[] = []
  let overHandlers: { retry(): void; title(): void } | null = null
  let winHandlers: { again(): void; title(): void } | null = null

  let charCards: CharCardView[] = []
  let charIndex = 0
  let charPick: ((id: string, model: ModelDir) => void) | null = null
  let levelIds: string[] = []
  let levelPick: ((id: string) => void) | null = null
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function juiceLabel(reduced: boolean): string {
    return reduced ? 'Full punch' : 'Ease the shake'
  }

  function setJuiceUi(reduced: boolean): void {
    juiceUi = reduced
    const label = juiceLabel(reduced)
    btnTitleJuice.textContent = label
    btnPauseJuice.textContent = label
    btnTitleJuice.classList.toggle('is-muted', reduced)
    btnPauseJuice.classList.toggle('is-muted', reduced)
    btnTitleJuice.setAttribute('aria-pressed', String(reduced))
    btnPauseJuice.setAttribute('aria-pressed', String(reduced))
  }

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
      const sign = s.value > 0 ? 'is-pos' : s.value < 0 ? 'is-neg' : 'is-zero'
      const row = h('div', { className: `stat-row ${sign}` })
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
    view.root.classList.remove('is-mud', 'model-a', 'model-b', 'model-c', 'model-painted', 'model-board')
    view.root.classList.add(`model-${view.model}`)
    view.img.src = portraitOf(view.ch, view.model)
    view.img.alt = `${view.ch.name} · ${meta.name}`
    view.nameEl.textContent = view.ch.name
    view.flavorEl.textContent = view.ch.flavor
    fillPerks(view.perksEl, view.ch.perks)
    view.modelBtns.forEach((btn, i) => {
      const dir = view.dirs[i]
      const on = dir === view.model
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
    })
  }

  function cycleCharModel(index: number, step: 1 | -1): void {
    const view = charCards[index]
    if (!view) return
    const i = view.dirs.indexOf(view.model)
    const next = view.dirs[(i + step + view.dirs.length) % view.dirs.length]
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
      img(characterIcon(summary.species, summary.form, summary.model), summary.characterName, 96, 96),
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

  btnTitleJuice.addEventListener('click', () => {
    titleHandlers?.setReducedJuice(!juiceUi)
  })

  btnPauseJuice.addEventListener('click', () => {
    pauseHandlers?.setReducedJuice(!juiceUi)
  })

  optTelegraphs.addEventListener('change', () => pauseHandlers?.setFx('telegraphs', optTelegraphs.checked))
  optNums.addEventListener('change', () => pauseHandlers?.setFx('damageNumbers', optNums.checked))
  optCombo.addEventListener('change', () => pauseHandlers?.setFx('combo', optCombo.checked))
  optShake.addEventListener('change', () => pauseHandlers?.setFx('shake', optShake.checked))
  optHitstop.addEventListener('change', () => pauseHandlers?.setFx('hitStop', optHitstop.checked))
  const syncZoomLabel = () => {
    optZoomVal.textContent = Number(optZoom.value).toFixed(2)
  }
  optZoom.addEventListener('input', () => {
    syncZoomLabel()
    pauseHandlers?.setZoom(Number(optZoom.value))
  })

  shopReroll.addEventListener('click', () => {
    shopHandlers?.reroll()
  })

  shopNext.addEventListener('click', () => {
    shopHandlers?.next()
  })

  plantClear.addEventListener('click', () => {
    plantHandlers?.clear()
  })
  plantSow.addEventListener('click', () => {
    plantHandlers?.sow()
  })
  farmReroll.addEventListener('click', () => {
    farmShopHandlers?.reroll()
  })
  farmNext.addEventListener('click', () => {
    farmShopHandlers?.next()
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
    if (activeOverlay === 'plant') {
      const digit = e.code.startsWith('Digit')
        ? Number(e.code.slice(5))
        : e.code.startsWith('Numpad')
          ? Number(e.code.slice(6))
          : 0
      if (digit >= 1 && digit <= plantUnlocked.length) {
        const id = plantUnlocked[digit - 1]
        if (id) {
          e.preventDefault()
          plantHandlers?.select(id)
        }
        return
      }
      if (e.code === 'Enter') {
        e.preventDefault()
        plantHandlers?.sow()
        return
      }
    }
    if (activeOverlay === 'shop' && shopHandlers) {
      const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : e.code.startsWith('Numpad') ? Number(e.code.slice(6)) : 0
      const uid = digit >= 1 ? shopOfferUids[digit - 1] : undefined
      if (uid !== undefined) {
        e.preventDefault()
        shopHandlers.buy(uid)
        return
      }
      if (e.code === 'KeyR') {
        e.preventDefault()
        shopHandlers.reroll()
        return
      }
      if (e.code === 'Enter') {
        e.preventDefault()
        shopHandlers.next()
        return
      }
    }
    if (activeOverlay === 'farmshop' && e.code === 'Enter') {
      e.preventDefault()
      farmShopHandlers?.next()
      return
    }
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
      const hpFrac = snap.maxHp > 0 ? clamp(snap.hp / snap.maxHp, 0, 1) : 0
      if (hpFrac < hpDelayFrac) hpDelayFrac += (hpFrac - hpDelayFrac) * 0.08
      else hpDelayFrac = hpFrac
      hpDelayEl.style.transform = `scaleX(${hpDelayFrac})`
      if (snap.hp !== hudCache.hp || snap.maxHp !== hudCache.maxHp) {
        hudCache.hp = snap.hp
        hudCache.maxHp = snap.maxHp
        hpFill.style.transform = `scaleX(${hpFrac})`
        hpText.textContent = `${Math.max(0, Math.round(snap.hp))} / ${Math.round(snap.maxHp)}`
      }
      if (snap.level !== hudCache.level) {
        hudCache.level = snap.level
        levelEl.textContent = String(snap.level)
      }
      const xpFrac = snap.xpNext > 0 ? clamp(snap.xp / snap.xpNext, 0, 1) : 1
      if (xpFrac < xpDelayFrac) xpDelayFrac += (xpFrac - xpDelayFrac) * 0.1
      else xpDelayFrac = xpFrac
      xpDelayEl.style.transform = `scaleX(${xpDelayFrac})`
      if (snap.xp !== hudCache.xp || snap.xpNext !== hudCache.xpNext) {
        hudCache.xp = snap.xp
        hudCache.xpNext = snap.xpNext
        xpFill.style.transform = `scaleX(${xpFrac})`
        xpText.textContent = `${Math.round(snap.xp)}/${Math.round(snap.xpNext)}`
      }
      if (snap.materials !== hudCache.materials) {
        hudCache.materials = snap.materials
        materialsEl.textContent = String(snap.materials)
        materialsEl.classList.remove('is-pop')
        void materialsEl.offsetWidth
        materialsEl.classList.add('is-pop')
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
      if (snap.rowLabel !== hudCache.rowLabel) {
        hudCache.rowLabel = snap.rowLabel
        rowEl.textContent = snap.rowLabel
      }
      const seedsKey = CROP_IDS.map((id) => `${id}:${snap.seeds[id]}`).join('|')
      if (seedsKey !== hudCache.seedsKey) {
        hudCache.seedsKey = seedsKey
        hudSeeds.replaceChildren()
        for (const id of CROP_IDS) {
          const n = snap.seeds[id]
          if (n <= 0 && !STARTER_CROP_IDS.includes(id)) continue
          hudSeeds.append(
            h('span', {
              className: `seed-count crop-${id}`,
              text: `${CROPS[id].hud} ${n}`,
            }),
          )
        }
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
        const initial = defaultModelForSpecies(ch.species, getLastModel())
        const portrait = img(portraitOf(ch, initial), ch.name, 160, 160)
        const nameEl = h('h2', { text: ch.name })
        const flavorEl = h('p', { className: 'char-flavor', text: ch.flavor })
        const perksEl = h('ul', { className: 'perk-list' })
        fillPerks(perksEl, ch.perks)
        const dirs = modelsForSpecies(ch.species)
        const toggle = h('div', { className: `form-toggle model-toggle${dirs.length > 3 ? ' model-toggle-4' : ''}` })
        toggle.setAttribute('role', 'group')
        toggle.setAttribute('aria-label', 'Model')
        const modelBtns: HTMLButtonElement[] = []
        const view: CharCardView = {
          ch,
          dirs,
          model: defaultModelForSpecies(ch.species, getLastModel()),
          root: card,
          img: portrait,
          nameEl,
          flavorEl,
          perksEl,
          modelBtns,
        }
        for (const dir of dirs) {
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
          if (ev.target instanceof HTMLElement && ev.target.closest('.form-toggle')) return
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

    renderPlant(view: PlantView, handlers: PlantHandlers): void {
      plantHandlers = handlers
      plantUnlocked = [...view.unlocked]
      plantHeading.textContent = view.first ? 'Sow the rows.' : `Sow wave ${view.nextWave}.`
      plantLede.textContent = view.first
        ? 'Three rows on the paddock — North, Middle, South. They come up out of the beds you plant, not the walls. Peas bring Peas. Sprouts bring Sprouts. Carrots bring Chargers. Leave a row empty if you need a path. Seeds you sow are spent when the rain starts.'
        : `Wave ${view.wave} is under. The beds are empty. Seeds you sowed stayed in the ground. Restock from drops and the shed. Sow for wave ${view.nextWave}. North and south are farther. Middle comes up in your face.`
      if (!view.first && (view.lastHarvest.materials > 0 || view.lastHarvest.xp > 0)) {
        plantLast.hidden = false
        plantLast.textContent = `Last row paid ${view.lastHarvest.materials} scrap, ${view.lastHarvest.xp} growth.`
      } else {
        plantLast.hidden = true
        plantLast.textContent = ''
      }
      plantThreat.textContent = view.threatLabel
      plantThreat.className = `threat-${view.threatLabel.toLowerCase()}`
      plantThreatBlurb.textContent = view.threatBlurb
      plantComes.textContent = `Comes up: ${view.comesUp}`
      plantPay.textContent =
        view.planted === 0
          ? 'Harvest: nothing. A stray Pea may still come up from an empty bed.'
          : `Harvest ${view.harvestMats} scrap, ${view.harvestXp} growth · ${view.planted} of ${view.capacity} beds.`
      const buffs: string[] = []
      if (view.fertilizer > 0) buffs.push(`Fertilizer ×${view.fertilizer} on the row.`)
      if (view.pesticide > 0) buffs.push(`Pesticide ×${view.pesticide} — they come up slower.`)
      if (buffs.length) {
        plantBuffs.hidden = false
        plantBuffs.textContent = buffs.join(' ')
      } else {
        plantBuffs.hidden = true
        plantBuffs.textContent = ''
      }
      plantSow.textContent = view.first ? 'The rain starts' : "To the gardener's table"

      plantSeeds.replaceChildren()
      view.unlocked.forEach((id, i) => {
        const crop = CROPS[id]
        const count = view.seeds[id]
        const btn = h('button', {
          className: `seed-chip crop-${id}${view.selected === id ? ' is-on' : ''}${count <= 0 ? ' is-empty' : ''}`,
        })
        btn.type = 'button'
        btn.setAttribute('aria-pressed', String(view.selected === id))
        btn.append(img(seedIconDataUrl(id, 48), crop.seedName, 40, 40))
        const body = h('div')
        body.append(h('span', { className: 'seed-name', text: crop.name }))
        body.append(h('span', { className: 'seed-flavor', text: crop.flavor }))
        btn.append(body)
        btn.append(h('span', { className: 'seed-qty', text: `${i + 1} · ${count}` }))
        btn.addEventListener('click', () => handlers.select(id))
        plantSeeds.append(btn)
      })
      for (const id of CROP_IDS) {
        if (view.unlocked.includes(id)) continue
        const crop = CROPS[id]
        const btn = h('button', { className: `seed-chip crop-${id} is-locked` })
        btn.type = 'button'
        btn.disabled = true
        btn.append(img(seedIconDataUrl(id, 48), crop.seedName, 40, 40))
        const body = h('div')
        body.append(h('span', { className: 'seed-name', text: crop.name }))
        body.append(h('span', { className: 'seed-flavor', text: `The shed · wave ${crop.unlockWave}` }))
        btn.append(body)
        btn.append(h('span', { className: 'seed-qty', text: '—' }))
        plantSeeds.append(btn)
      }

      plantPlots.replaceChildren()
      view.rowNames.forEach((name, r) => {
        const row = h('div', { className: 'garden-row' })
        row.append(h('h3', { className: 'row-name', text: name }))
        const beds = h('div', { className: 'row-beds' })
        view.plots.forEach((plot, i) => {
          if (plot.row !== r) return
          const bed = h('button', {
            className: `plot-bed${plot.crop ? ` is-sown crop-${plot.crop}` : ' is-empty'}`,
          })
          bed.type = 'button'
          bed.setAttribute(
            'aria-label',
            plot.crop ? `${CROPS[plot.crop].name} in ${name}, bed ${plot.col + 1}` : `Empty bed in ${name}`,
          )
          if (plot.crop) {
            bed.append(img(seedIconDataUrl(plot.crop, 48), CROPS[plot.crop].name, 36, 36))
            bed.append(h('span', { text: CROPS[plot.crop].name }))
          } else {
            bed.append(h('span', { className: 'plot-empty', text: 'Empty' }))
          }
          bed.addEventListener('click', () => handlers.togglePlot(i))
          beds.append(bed)
        })
        row.append(beds)
        plantPlots.append(row)
      })
    },

    renderFarmShop(view: FarmShopView, handlers: FarmShopHandlers): void {
      farmShopHandlers = handlers
      farmRecap.textContent = view.recap
      farmLede.textContent = `Wave ${view.wave} is under. Same scraps as the gardener's table. New seeds show up as the rain goes on, and luck helps. Then you sow wave ${view.nextWave}.`
      farmBag.textContent = String(view.materials)
      farmReroll.textContent = `Turn over · ${view.rerollPrice}`
      farmBuffs.textContent =
        view.fertilizer || view.pesticide
          ? `On the row: ${view.fertilizer ? `fertilizer ×${view.fertilizer}` : ''}${view.fertilizer && view.pesticide ? ' · ' : ''}${view.pesticide ? `pesticide ×${view.pesticide}` : ''}. Lasts one wave.`
          : 'No fertilizer or pesticide on the row yet. One wave each.'
      fillBeds(farmBeds, view.beds, (id) => handlers.buyBed(id))

      farmOffers.replaceChildren()
      if (view.offers.length === 0) {
        farmOffers.append(h('p', { className: 'empty-note', text: 'The bench is empty. Turn over, or go sow.' }))
      }
      for (const offer of view.offers) {
        const card = h('div', {
          className: `offer-card farm-offer kind-${offer.kind}${offer.locked ? ' is-locked' : ''}${offer.affordable ? '' : ' is-broke'}`,
        })
        if (offer.kind === 'seed' && offer.crop) {
          card.append(img(seedIconDataUrl(offer.crop, 48), offer.name, 48, 48))
        } else if (offer.kind === 'fertilizer') {
          card.append(img(itemIcon('mushroom'), offer.name, 48, 48))
        } else {
          card.append(img(itemIcon('flask'), offer.name, 48, 48))
        }
        const body = h('div')
        body.append(h('h3', { className: 'offer-name', text: offer.name }))
        body.append(h('p', { className: 'offer-flavor', text: offer.flavor }))
        const lines = h('ul', { className: 'offer-lines' })
        for (const line of offer.lines) lines.append(h('li', { text: line }))
        body.append(lines)
        const actions = h('div', { className: 'offer-actions' })
        const buy = h('button', {
          className: 'btn primary offer-buy',
          text: `Buy · ${offer.price}`,
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
        farmOffers.append(card)
      }

      farmPouch.replaceChildren()
      let shown = 0
      for (const id of CROP_IDS) {
        const n = view.seeds[id]
        if (n <= 0 && !view.unlocked.includes(id)) continue
        shown += 1
        const row = h('div', { className: `item-row crop-${id}` })
        row.append(img(seedIconDataUrl(id, 48), CROPS[id].seedName, 40, 40))
        row.append(h('p', { className: 'item-name', text: CROPS[id].seedName }))
        row.append(h('span', { className: 'item-count', text: `×${n}` }))
        farmPouch.append(row)
      }
      if (shown === 0) {
        farmPouch.append(h('p', { className: 'empty-note', text: 'Pouch empty. Buy seeds or wait for drops.' }))
      }
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
      shopLede.textContent = `Wave ${view.wave} is under. The rows are sown. Wave ${view.nextWave} is coming up.`
      shopBag.textContent = String(view.materials)
      shopReroll.textContent =
        view.freeRerolls > 0 ? 'Turn over · Free' : `Turn over · ${view.rerollPrice}`
      shopSlots.textContent = `${view.weapons.length} of ${view.weaponSlots} hands full.`
      fillBeds(shopBeds, view.beds, (id) => handlers.buyBed(id))

      shopOffers.replaceChildren()
      shopOfferUids = view.offers.map((o) => o.uid)
      for (const [i, offer] of view.offers.entries()) {
        const card = h('div', {
          className: `offer-card tier-${offer.tier}${offer.locked ? ' is-locked' : ''}${offer.affordable ? '' : ' is-broke'}`,
        })
        const src =
          offer.kind === 'weapon'
            ? weaponIcon(offer.paint as WeaponPaint)
            : itemIcon(offer.paint as ItemPaint)
        card.append(img(src, offer.name, 48, 48))
        const body = h('div')
        const name = h('h3', { className: 'offer-name', text: offer.name })
        name.append(h('span', { className: 'offer-key', text: String(i + 1) }))
        body.append(name)
        body.append(h('p', { className: 'offer-flavor', text: offer.flavor }))
        const lines = h('ul', { className: 'offer-lines' })
        for (const line of offer.lines) lines.append(h('li', { text: line }))
        body.append(lines)
        if (offer.effect) body.append(h('p', { className: 'offer-effect', text: offer.effect }))
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
          row.title = [...it.lines, it.effect].filter(Boolean).join(' · ')
          row.append(img(itemIcon(it.paint), it.name, 40, 40))
          const mid = h('div', { className: 'item-mid' })
          mid.append(h('p', { className: 'item-name', text: it.name }))
          mid.append(h('p', { className: it.effect ? 'item-effect' : 'item-lines', text: it.effect ?? it.lines.join(' · ') }))
          row.append(mid)
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
        reducedJuice: boolean
        setReducedJuice(v: boolean): void
        fx: Record<FxToggle, boolean>
        setFx(flag: FxToggle, value: boolean): void
        zoom: number
        setZoom(value: number): void
      },
    ): void {
      pauseHandlers = handlers
      applyStats(view)
      setMutedUi(handlers.muted)
      setJuiceUi(handlers.reducedJuice)
      fillPaintRow(pausePaint, handlers.paintStyle, handlers.setPaintStyle)
      optTelegraphs.checked = handlers.fx.telegraphs
      optNums.checked = handlers.fx.damageNumbers
      optCombo.checked = handlers.fx.combo
      optShake.checked = handlers.fx.shake
      optHitstop.checked = handlers.fx.hitStop
      optZoom.value = String(handlers.zoom)
      optZoomVal.textContent = handlers.zoom.toFixed(2)
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
      if (text === 'Elite') {
        window.clearTimeout(calloutTimer)
        calloutText.textContent = text
        if (sub) {
          calloutSub.textContent = sub
          calloutSub.hidden = false
        } else {
          calloutSub.textContent = ''
          calloutSub.hidden = true
        }
        calloutEl.hidden = false
        calloutTimer = window.setTimeout(() => {
          calloutEl.hidden = true
        }, ms)
        return
      }
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

    seedPop(crop: CropId, count = 1): void {
      const add = Math.max(1, count)
      const rec = seedPopLive.get(crop)
      if (rec) {
        rec.count += add
        const n = rec.el.querySelector('.seed-pop-n')
        if (n) n.textContent = `+${rec.count}`
        window.clearTimeout(rec.timer)
        rec.timer = window.setTimeout(() => {
          rec.el.classList.add('is-out')
          window.setTimeout(() => rec.el.remove(), 220)
          seedPopLive.delete(crop)
        }, 1400)
        rec.el.classList.remove('is-out')
        return
      }
      const el = h('div', { className: `seed-pop crop-${crop}` })
      el.append(img(seedIconDataUrl(crop, 48), CROPS[crop].seedName, 28, 28))
      el.append(h('span', { className: 'seed-pop-n', text: `+${add}` }))
      seedPopsEl.append(el)
      const timer = window.setTimeout(() => {
        el.classList.add('is-out')
        window.setTimeout(() => el.remove(), 220)
        seedPopLive.delete(crop)
      }, 1400)
      seedPopLive.set(crop, { el, count: add, timer })
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
      reducedJuice: boolean
      setReducedJuice(v: boolean): void
    }): void {
      titleHandlers = handlers
      setMutedUi(handlers.muted)
      setJuiceUi(handlers.reducedJuice)
      fillPaintRow(titlePaint, handlers.paintStyle, handlers.setPaintStyle)
    },

    onPauseRequest(handler: () => void): void {
      pauseRequest = handler
    },
  }

  return api
}
