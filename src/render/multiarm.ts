/**
 * Runtime multi-arm compositor.
 * Maths follow each hero's compose_ref.py (`arm_layers` + `frame`).
 * Parts stay in body px; `body_track.m` maps them into the armless hero cell.
 */
import type { WeaponId } from '../core/types.ts'
import {
  assignWeapons,
  composeArmLayers,
  type ComposeRig,
  type Mat,
  type Pose,
  type Slot,
  type WeaponPaint,
} from './armCompose.ts'
import { actorClipFrame, blitCell, frameCell, loadSheetAt, type LoadedSheet, type SheetFrame } from './sheets.ts'

/** One hero's multi-arm folder and the armless sheet that sits under the arms. */
export interface MultiArmSource {
  root: string
  sheetId: string
}

const HERO_SOURCES: Record<string, MultiArmSource> = {
  potato: { root: '/sprites/multiarm/potato', sheetId: 'player-potato-armless' },
  radish: { root: '/sprites/multiarm/radish', sheetId: 'player-radish-armless' },
  carrot: { root: '/sprites/multiarm/carrot', sheetId: 'player-carrot-armless' },
  chili: { root: '/sprites/multiarm/chili', sheetId: 'player-chili-armless' },
}

interface Part {
  rect: [number, number, number, number]
  points: Record<string, [number, number]>
  dir0: number
  fore0: number
  axis: number
}

interface TrackFrame {
  arms?: boolean
  m?: number[][]
  tint?: number[]
  native?: Record<string, Pose>
}

interface FamKey extends Pose {
  ms: number
}

interface Layer {
  name: string
  m: Mat
  z: number
  alpha?: number
}

interface ArmIn {
  uid: number
  id: WeaponId
}

interface SlotState {
  uid: number | null
  /** -2 done, -1 waiting out the stagger, >=0 playing the sprout clip (ms). */
  sproutMs: number
  waitMs: number
  attackMs: number | null
  jitter: number
  cycle: number
}

const PAINT: Partial<Record<WeaponId, 'club' | 'knife' | 'slingshot'>> = {
  stick: 'club',
  sword: 'club',
  hammer: 'club',
  scythe: 'club',
  fist: 'knife',
  knife: 'knife',
  spear: 'knife',
  pistol: 'slingshot',
  smg: 'slingshot',
  shotgun: 'slingshot',
  slingshot: 'slingshot',
  crossbow: 'slingshot',
  wand: 'slingshot',
  flint: 'slingshot',
}

/** `?arms=` grows this list. The first id is that hero's main weapon. */
const DEBUG_POOLS: Record<string, WeaponId[]> = {
  potato: ['pistol', 'knife', 'stick', 'slingshot', 'wand', 'hammer'],
  radish: ['pistol', 'knife', 'stick', 'slingshot', 'wand', 'hammer'],
  carrot: ['slingshot', 'spear', 'stick', 'knife', 'pistol', 'wand'],
  chili: ['knife', 'stick', 'slingshot', 'hammer', 'pistol', 'wand'],
}
const HERO_QUERY: Record<string, string> = {
  potato: 'well-rounded',
  spud: 'well-rounded',
  'well-rounded': 'well-rounded',
  radish: 'lucky',
  lucky: 'lucky',
  carrot: 'ranger',
  ranger: 'ranger',
  chili: 'mage',
  mage: 'mage',
}
const SPROUT_STAGGER = 320

interface HeroArt {
  partsImg: HTMLImageElement
  bodySheet: LoadedSheet
  parts: Record<string, Part>
  weapons: Record<string, WeaponPaint>
  families: Record<string, FamKey[]>
  sproutKeys: FamKey[]
  aimClamp: number
  sproutScale: number
  armTurnShare: number
  handD: number
  behindZ: number
  nativeArt: Record<string, string>
  sproutFront: string
  sproutBack: string
  slotDefs: Record<string, Omit<Slot, 'name' | 'index'>>
  layouts: Record<string, { slots: string[]; override: Record<string, Partial<Slot>> }>
  tracks: Record<string, TrackFrame[]>
  secondary: Record<string, Pose[][]>
  emptyHand: string | null
  raisedFront: string | null
  raisedWeaponZ: number
  bud: { sproutedOnly: boolean } | null
  woodGroup: 'layer' | 'side'
}

const arts = new Map<string, HeroArt>()

let ready = false
let settled = false
let partsImg: HTMLImageElement | null = null
let bodySheet: LoadedSheet | null = null
let parts: Record<string, Part> = {}
let weapons: Record<string, WeaponPaint> = {}
let families: Record<string, FamKey[]> = {}
let sproutKeys: FamKey[] = []
let aimClamp = 50
let sproutScale = 0.8
let armTurnShare = 0.6
let handD = 13
let behindZ = 10
let nativeArt: Record<string, string> = {}
let sproutFront = 'long_cut'
let sproutBack = 'long_dark_cut'
let slotDefs: Record<string, Omit<Slot, 'name' | 'index'>> = {}
let layouts: Record<string, { slots: string[]; override: Record<string, Partial<Slot>> }> = {}
let tracks: Record<string, TrackFrame[]> = {}
let secondary: Record<string, Pose[][]> = {}
let emptyHand: string | null = 'palm'
let raisedFront: string | null = null
let raisedWeaponZ = 9.5
let budMode: { sproutedOnly: boolean } | null = { sproutedOnly: false }
let woodGroup: 'layer' | 'side' = 'side'

let loadKey = ''
let currentSlots: Slot[] = []
let assignUids: (number | null)[] = []
const states = new Map<string, SlotState>()
const prevBySlot = new Map<string, number | null>()
const idByUid = new Map<number, WeaponId>()
const aimAt = new Map<number, { x: number; y: number }>()
let scratch: HTMLCanvasElement | null = null
let scratchCtx: CanvasRenderingContext2D | null = null

function T(x: number, y: number): Mat {
  return [1, 0, x, 0, 1, y, 0, 0, 1]
}

function Sm(k: number): Mat {
  return [k, 0, 0, 0, k, 0, 0, 0, 1]
}

function mul(a: Mat, b: Mat): Mat {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] =
        a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
    }
  }
  return o as Mat
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function pt(raw: unknown): [number, number] {
  if (!Array.isArray(raw)) return [0, 0]
  return [num(raw[0]), num(raw[1])]
}

export function isMultiArmReady(): boolean {
  return ready
}

export function isMultiArmSettled(): boolean {
  return settled
}

export function multiArmSheet(species = 'potato'): LoadedSheet | null {
  return arts.get(species)?.bodySheet ?? null
}

export function potatoMultiArm(species: string): boolean {
  return arts.has(species)
}

function bindArt(species: string): boolean {
  const next = arts.get(species)
  if (!next) {
    ready = false
    return false
  }
  partsImg = next.partsImg
  bodySheet = next.bodySheet
  parts = next.parts
  weapons = next.weapons
  families = next.families
  sproutKeys = next.sproutKeys
  aimClamp = next.aimClamp
  sproutScale = next.sproutScale
  armTurnShare = next.armTurnShare
  handD = next.handD
  behindZ = next.behindZ
  nativeArt = next.nativeArt
  sproutFront = next.sproutFront
  sproutBack = next.sproutBack
  slotDefs = next.slotDefs
  layouts = next.layouts
  tracks = next.tracks
  secondary = next.secondary
  emptyHand = next.emptyHand
  raisedFront = next.raisedFront
  raisedWeaponZ = next.raisedWeaponZ
  budMode = next.bud
  woodGroup = next.woodGroup
  ready = true
  return true
}

/**
 * The loaded hero's own clip wins. `melee-slash` falls back to `melee-swing`
 * only when that hero never shipped a slash family.
 */
function familyClip(name: string): FamKey[] | undefined {
  return families[name] ?? (name === 'melee-slash' ? families['melee-swing'] : undefined)
}

function queryParam(name: string): string | null {
  if (typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get(name)
  return raw && raw.trim() ? raw.trim().toLowerCase() : null
}

/** `?hero=radish` (or a character id) skips the select and plants that hero. */
export function debugHeroId(): string | null {
  const raw = queryParam('hero')
  if (!raw) return null
  return HERO_QUERY[raw] ?? null
}

/** `?arms=1..6` replaces starters for any hero that has multi-arm art. */
export function debugHeroWeapons(species: string): { id: WeaponId; tier: 1 }[] | null {
  const raw = queryParam('arms')
  if (!raw) return null
  const pool = DEBUG_POOLS[species]
  if (!pool) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > pool.length) return null
  return pool.slice(0, n).map((id) => ({ id, tier: 1 as const }))
}

/** A hero's own weapons.json entry wins; otherwise the shared stand-in. */
function paintName(id: WeaponId): string | undefined {
  if (weapons[id]) return id
  return PAINT[id]
}

export function resetMultiArm(): void {
  loadKey = ''
  currentSlots = []
  assignUids = []
  states.clear()
  prevBySlot.clear()
  idByUid.clear()
  aimAt.clear()
}

async function loadHeroArt(source: MultiArmSource): Promise<HeroArt | null> {
  const { root, sheetId } = source
  const [trackJ, sockJ, wpnJ, famJ, partsJ, sheet] = await Promise.all([
    fetch(`${root}/body_track.json`).then((r) => r.json()),
    fetch(`${root}/sockets.json`).then((r) => r.json()),
    fetch(`${root}/weapons.json`).then((r) => r.json()),
    fetch(`${root}/families.json`).then((r) => r.json()),
    fetch(`${root}/parts.json`).then((r) => r.json()),
    loadSheetAt(`${root}/${sheetId}.json`, sheetId),
  ])
  if (!sheet) return null
  const imageName = typeof partsJ.image === 'string' ? partsJ.image : 'parts.png'
  const img = await loadImage(`${root}/${imageName}`)
  return {
    partsImg: img,
    bodySheet: sheet,
    parts: parseParts(partsJ.parts),
    weapons: (wpnJ.weapons ?? {}) as Record<string, WeaponPaint>,
    families: (famJ.families ?? {}) as Record<string, FamKey[]>,
    sproutKeys: (famJ.sprout ?? []) as FamKey[],
    aimClamp: num(famJ.aimClamp, 50),
    sproutScale: num(famJ.sproutScale, num(sockJ.arms?.sprouted?.scale, 0.8)),
    armTurnShare: num(famJ.armTurnShare, 0.6),
    handD: num(famJ.handD, 13),
    behindZ: num(sockJ.behindBodyZ, 10),
    nativeArt: (sockJ.arms?.native ?? {}) as Record<string, string>,
    sproutFront: sockJ.arms?.sprouted?.front ?? 'long_cut',
    sproutBack: sockJ.arms?.sprouted?.back ?? 'long_dark_cut',
    slotDefs: parseSlots(sockJ.slots),
    layouts: sockJ.layouts ?? {},
    tracks: (trackJ.clips ?? {}) as Record<string, TrackFrame[]>,
    secondary: (trackJ.secondary ?? {}) as Record<string, Pose[][]>,
    emptyHand: emptyHandOf(sockJ.arms),
    raisedFront: raisedFrontOf(sockJ.arms),
    raisedWeaponZ: raisedZOf(sockJ.arms),
    bud: budOf(sockJ.bud),
    woodGroup: woodGroupOf(sockJ, famJ),
  }
}

function emptyHandOf(arms: { emptyHand?: string | null } | undefined): string | null {
  if (!arms || !Object.prototype.hasOwnProperty.call(arms, 'emptyHand')) return 'palm'
  return arms.emptyHand ?? null
}

function raisedFrontOf(arms: { raised?: { front?: string } } | undefined): string | null {
  const name = arms?.raised?.front
  return typeof name === 'string' && name ? name : null
}

function raisedZOf(arms: { raised?: { weaponZ?: number } } | undefined): number {
  return num(arms?.raised?.weaponZ, 9.5)
}

function budOf(raw: unknown): { sproutedOnly: boolean } | null {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object') return { sproutedOnly: false }
  return { sproutedOnly: !!(raw as { sproutedOnly?: boolean }).sproutedOnly }
}

function woodGroupOf(sockJ: { view?: string; slots?: unknown; arms?: { emptyHand?: string | null } }, famJ: { loadoutRules?: Record<string, unknown> }): 'layer' | 'side' {
  if (sockJ.view !== 'side') return 'side'
  if (famJ.loadoutRules && 'woodPerLayer' in famJ.loadoutRules) return 'layer'
  if (sockJ.arms && Object.prototype.hasOwnProperty.call(sockJ.arms, 'emptyHand') && sockJ.arms.emptyHand === null) {
    return 'layer'
  }
  const slots = sockJ.slots
  if (slots && typeof slots === 'object') {
    for (const value of Object.values(slots as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const o = value as { hero?: string; nativeKey?: string; holds?: boolean }
      if (o.hero || o.nativeKey || o.holds === false) return 'layer'
    }
  }
  return 'side'
}

export function preloadMultiArm(): Promise<void> {
  if (settled) return Promise.resolve()
  return (async () => {
    try {
      await Promise.all(
        Object.entries(HERO_SOURCES).map(async ([species, source]) => {
          const loaded = await loadHeroArt(source)
          if (loaded) arts.set(species, loaded)
        }),
      )
      ready = bindArt('potato')
    } catch {
      ready = false
    } finally {
      settled = true
    }
  })()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(url))
    img.src = url
  })
}

function parseParts(raw: unknown): Record<string, Part> {
  const out: Record<string, Part> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const o = value as Record<string, unknown>
    const rect = Array.isArray(o.rect) ? o.rect : [0, 0, 0, 0]
    const points: Record<string, [number, number]> = {}
    if (o.points && typeof o.points === 'object') {
      for (const [k, v] of Object.entries(o.points as Record<string, unknown>)) points[k] = pt(v)
    }
    out[name] = {
      rect: [num(rect[0]), num(rect[1]), num(rect[2]), num(rect[3])],
      points,
      dir0: num(o.dir0),
      fore0: num(o.fore0),
      axis: num(o.axis),
    }
  }
  return out
}

function parseSlots(raw: unknown): Record<string, Omit<Slot, 'name' | 'index'>> {
  const out: Record<string, Omit<Slot, 'name' | 'index'>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const o = value as Record<string, unknown>
    const hero = typeof o.hero === 'string' ? o.hero : typeof o.nativeKey === 'string' ? o.nativeKey : undefined
    out[name] = {
      pos: pt(o.pos),
      side: num(o.side, 1),
      dir: num(o.dir),
      z: num(o.z),
      native: !!o.native,
      layer: o.layer === 'front' || o.layer === 'back' ? o.layer : undefined,
      hero,
      holds: o.holds !== false,
    }
  }
  return out
}

function layout(nWeapons: number): Slot[] {
  const key = String(Math.max(1, Math.min(6, nWeapons || 1)))
  const lay = layouts[key]
  if (!lay) return []
  const out: Slot[] = []
  lay.slots.forEach((name, index) => {
    const base = slotDefs[name]
    if (!base) return
    const over = lay.override?.[name] ?? {}
    const pos = over.pos ?? base.pos
    out.push({
      name,
      index,
      pos: [pos[0], pos[1]],
      side: over.side ?? base.side,
      dir: over.dir ?? base.dir,
      z: over.z ?? base.z,
      native: over.native ?? base.native,
      layer: over.layer ?? base.layer,
      hero: over.hero ?? base.hero,
      holds: over.holds ?? base.holds,
    })
  })
  return out
}


interface AssignItem {
  uid: number
  wood: boolean
}

function assign(loadout: (AssignItem | null)[], slots: Slot[], prev: (number | null)[]): number[] {
  const names = assignWeapons(
    currentRig(),
    loadout.map((item) => (item ? { id: String(item.uid), wood: item.wood } : null)),
    slots,
    prev.map((uid) => (uid == null ? null : String(uid))),
  )
  return names.map((id) => (id == null ? -1 : Number(id)))
}

function freshState(): SlotState {
  return { uid: null, sproutMs: -2, waitMs: 0, attackMs: null, jitter: 0, cycle: 0 }
}

function syncLoadout(list: readonly ArmIn[]): void {
  const key = `${list.map((w) => w.uid).join(',')}`
  if (key === loadKey && currentSlots.length) return
  loadKey = key
  idByUid.clear()
  for (const w of list) idByUid.set(w.uid, w.id)
  const slots = layout(list.length)
  const items: (AssignItem | null)[] = slots.map((_, i) => {
    const w = list[i]
    if (!w) return null
    const paint = paintName(w.id)
    const spec = paint ? weapons[paint] : undefined
    return { uid: w.uid, wood: !!spec?.wood }
  })
  const prev = slots.map((s) => (prevBySlot.has(s.name) ? prevBySlot.get(s.name)! : null))
  const chosen = assign(items, slots, prev)
  currentSlots = slots
  assignUids = chosen.map((uid) => (uid < 0 ? null : uid))
  slots.forEach((slot, i) => {
    const uid = assignUids[i] ?? null
    const was = prevBySlot.get(slot.name) ?? null
    let st = states.get(slot.name)
    if (!st) {
      st = freshState()
      states.set(slot.name, st)
    }
    if (uid !== was || st.uid !== uid) {
      st.uid = uid
      st.attackMs = null
      if (uid !== null && !slot.native) {
        st.sproutMs = -1
        st.waitMs = slot.index * SPROUT_STAGGER
      } else {
        st.sproutMs = -2
        st.waitMs = 0
      }
    }
    prevBySlot.set(slot.name, uid)
  })
}

function familyAt(keys: FamKey[], t: number): { key: FamKey; index: number; into: number } | null {
  if (t < 0) return null
  let left = t
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!key) continue
    if (left < key.ms) return { key, index: i, into: left }
    left -= key.ms
  }
  return null
}


function familyDuration(keys: FamKey[]): number {
  let t = 0
  for (const k of keys) t += k.ms
  return t
}

function paintOf(uid: number | null): { name: string; spec: WeaponPaint } | null {
  if (uid == null) return null
  const id = idByUid.get(uid)
  if (!id) return null
  const name = paintName(id)
  if (!name) return null
  const spec = weapons[name]
  if (!spec) return null
  return { name, spec }
}

export function noteArmTarget(uid: number, x: number | null, y: number | null): void {
  if (x == null || y == null) aimAt.delete(uid)
  else aimAt.set(uid, { x, y })
}

export function armIdle(uid: number): boolean {
  for (let i = 0; i < currentSlots.length; i++) {
    if (assignUids[i] !== uid) continue
    const st = states.get(currentSlots[i]!.name)
    if (!st) return false
    return st.sproutMs === -2 && st.attackMs === null
  }
  return false
}

export function beginArmAttack(uid: number): boolean {
  for (let i = 0; i < currentSlots.length; i++) {
    if (assignUids[i] !== uid) continue
    const slot = currentSlots[i]!
    const st = states.get(slot.name)
    if (!st || st.sproutMs !== -2 || st.attackMs !== null) return false
    st.jitter = jitterMs(slot.index, st.cycle)
    st.cycle += 1
    st.attackMs = 0
    return true
  }
  return false
}

function jitterMs(slotIndex: number, cycle: number, seed = 7): number {
  let x = (seed * 1000 + slotIndex * 37 + cycle) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  x = (x ^ (x >>> 16)) >>> 0
  return 80 + (x / 4294967296) * 120
}

/** Advance sprout and attack clocks. Returns weapon uids whose family clip released or hit this step. */
export function tickMultiArm(dt: number, list: readonly ArmIn[], species = 'potato'): number[] {
  if (!bindArt(species)) return []
  syncLoadout(list)
  const fired: number[] = []
  const step = Math.max(0, dt) * 1000
  for (const slot of currentSlots) {
    const st = states.get(slot.name)
    if (!st) continue
    if (st.sproutMs === -1) {
      st.waitMs -= step
      if (st.waitMs <= 0) st.sproutMs = 0
    } else if (st.sproutMs >= 0) {
      st.sproutMs += step
      if (!familyAt(sproutKeys, st.sproutMs)) st.sproutMs = -2
    }
    if (st.attackMs === null || st.uid == null) continue
    const painted = paintOf(st.uid)
    const keys = painted ? familyClip(painted.spec.family) : undefined
    const t0 = st.attackMs - st.jitter
    st.attackMs += step
    const t1 = st.attackMs - st.jitter
    if (keys) {
      let start = 0
      for (const key of keys) {
        if (start > t0 && start <= t1) {
          const ev = key.ev ?? []
          if (ev.includes('release') || ev.includes('hit')) fired.push(st.uid)
        }
        start += key.ms
      }
      if (t1 >= familyDuration(keys)) st.attackMs = null
    } else {
      st.attackMs = null
    }
  }
  return fired
}

function pointOf(part: Part, name: string): [number, number] {
  return part.points[name] ?? [0, 0]
}

function currentRig(): ComposeRig {
  return {
    parts,
    weapons,
    families,
    aimClamp,
    sproutScale,
    armTurnShare,
    handD,
    behindZ,
    nativeArt,
    sproutFront,
    sproutBack,
    tracks,
    secondary,
    emptyHand,
    raisedFront,
    raisedWeaponZ,
    bud: budMode,
    woodGroup,
  }
}

function armLayers(
  slot: Slot,
  clip: string,
  fi: number,
  weaponName: string | null,
  tAttack: number | null,
  grow: number,
  target: [number, number] | null,
  B: Mat,
): Layer[] {
  return composeArmLayers(currentRig(), slot, clip, fi, weaponName, tAttack, grow, target, B)
}


function sproutExtras(slot: Slot, st: SlotState): Layer[] {
  if (st.sproutMs < 0) return []
  const at = familyAt(sproutKeys, st.sproutMs)
  if (!at) return []
  const out: Layer[] = []
  const P = slot.pos
  if (at.key.bud && budMode) {
    const b = parts.bud
    if (b) {
      const c = pointOf(b, 'center')
      const s = at.key.bud * sproutScale
      out.push({ name: 'bud', m: mul(mul(T(P[0], P[1]), Sm(s)), T(-c[0], -c[1])), z: 10.5 })
    }
  }
  // Dust covers the opening of the sprout, measured in ms so extra keys do not shrink it.
  let dustMs = 0
  const dustKeys = Math.min(3, sproutKeys.length)
  for (let i = 0; i < dustKeys; i++) dustMs += sproutKeys[i]?.ms ?? 0
  if (st.sproutMs < dustMs) {
    const dust = parts.fx_dust
    if (dust) {
      const c = pointOf(dust, 'center')
      out.push({ name: 'fx_dust', m: mul(mul(T(P[0], P[1]), Sm(1)), T(-c[0], -c[1])), z: 12 })
    }
  }
  return out
}

/**
 * Body-track row for this moment. The index comes from clip time. When the
 * track length matches the clip, that row is the key. A shorter track is
 * sampled across the same span instead of assuming a fixed frame count.
 */
function trackFrameIndex(list: TrackFrame[] | undefined, frameIndex: number, frameCount: number): number {
  if (!list?.length) return -1
  if (list.length === frameCount) return Math.max(0, Math.min(list.length - 1, frameIndex))
  const denom = Math.max(1, frameCount - 1)
  const u = Math.max(0, Math.min(1, frameIndex / denom))
  return Math.round(u * (list.length - 1))
}

function snapScale(s: number): number {
  return Math.max(0.25, Math.round(s * 2) / 2)
}

function worldToCell(
  wx: number,
  wy: number,
  originX: number,
  originY: number,
  bodyRot: number,
  facing: 1 | -1,
  frame: SheetFrame,
  ax: number,
  ay: number,
  fit: number,
): [number, number] {
  const c = Math.cos(bodyRot)
  const s = Math.sin(bodyRot)
  const dx = wx - originX
  const dy = wy - originY
  const lx = c * dx + s * dy
  const ly = -s * dx + c * dy
  const sx = facing * fit * frame.scaleX
  const sy = fit * frame.scaleY
  return [ax + (lx - frame.ox * facing) / sx, ay + (ly - frame.oy) / sy]
}

function drawPart(ctx: CanvasRenderingContext2D, name: string, m: Mat, tint: number[] | undefined): void {
  const part = parts[name]
  const img = partsImg
  if (!part || !img) return
  const [sx, sy, w, h] = part.rect
  if (w <= 0 || h <= 0) return
  const cell = frameCell(img, `part:${name}:${sx},${sy},${w}x${h}`, sx, sy, w, h)
  if (!cell) return
  ctx.save()
  ctx.transform(m[0], m[3], m[1], m[4], m[2], m[5])
  if (tint && tint.length >= 4 && (tint[3] ?? 0) > 0.01) {
    if (!scratch) {
      scratch = document.createElement('canvas')
      scratchCtx = scratch.getContext('2d')
    }
    const g = scratchCtx
    if (scratch && g) {
      const tw = Math.ceil(w)
      const th = Math.ceil(h)
      if (scratch.width !== tw || scratch.height !== th) {
        scratch.width = tw
        scratch.height = th
      }
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, tw, th)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'low'
      g.globalCompositeOperation = 'source-over'
      g.drawImage(cell, 0, 0)
      g.globalCompositeOperation = 'source-atop'
      const r = Math.round((tint[0] ?? 1) * 255)
      const gg = Math.round((tint[1] ?? 1) * 255)
      const b = Math.round((tint[2] ?? 1) * 255)
      g.fillStyle = `rgba(${r},${gg},${b},${tint[3] ?? 0})`
      g.fillRect(0, 0, tw, th)
      blitCell(ctx, scratch, 0, 0, tw, th)
    }
  } else {
    blitCell(ctx, cell, 0, 0, w, h)
  }
  ctx.restore()
}

export interface MultiArmDraw {
  weapons: readonly ArmIn[]
  clip: string
  r: number
  /** World facing. Aim is unmirrored into the right-facing cell; the caller flips the pixels. */
  facing: 1 | -1
  alpha: number
  originX: number
  originY: number
  bodyRot: number
  species?: string
}

/** Draw arm parts in the same space as `drawActorSheet` (caller has translated to the hero). */
export function drawMultiArm(ctx: CanvasRenderingContext2D, which: 'back' | 'front', opts: MultiArmDraw): void {
  if (!bindArt(opts.species ?? 'potato') || !bodySheet) return
  syncLoadout(opts.weapons)
  const located = actorClipFrame('player', bodySheet, opts.clip)
  if (!located) return
  const frameCount = bodySheet.manifest.clips[opts.clip]?.frames.length ?? 1
  const fi = trackFrameIndex(tracks[opts.clip], located.index, frameCount)
  const tr = fi < 0 ? undefined : tracks[opts.clip]?.[fi]
  if (!tr || tr.arms === false || !tr.m) return
  const B: Mat = [tr.m[0]![0]!, tr.m[0]![1]!, tr.m[0]![2]!, tr.m[1]![0]!, tr.m[1]![1]!, tr.m[1]![2]!, 0, 0, 1]
  const fw = bodySheet.manifest.frameWidth
  const fh = bodySheet.manifest.frameHeight
  const anchor = bodySheet.manifest.clips[opts.clip]?.anchor ?? bodySheet.manifest.anchor
  const ax = anchor.x * fw
  const ay = anchor.y * fh
  const fit = snapScale((opts.r * 2.35) / Math.max(fw, fh))
  const layers: Layer[] = []
  for (let i = 0; i < currentSlots.length; i++) {
    const slot = currentSlots[i]!
    const st = states.get(slot.name) ?? freshState()
    const grow = st.sproutMs === -1 ? 0 : st.sproutMs >= 0 ? (familyAt(sproutKeys, st.sproutMs)?.key.scale ?? 1) : 1
    if (st.uid != null && st.sproutMs >= 0) layers.push(...sproutExtras(slot, st))
    if (grow <= 0.01) continue
    const painted = paintOf(st.uid)
    const worldTarget = st.uid != null ? aimAt.get(st.uid) : undefined
    const target = worldTarget
      ? worldToCell(worldTarget.x, worldTarget.y, opts.originX, opts.originY, opts.bodyRot, opts.facing, located.frame, ax, ay, fit)
      : null
    const tAttack = st.attackMs === null ? null : st.attackMs - st.jitter
    layers.push(...armLayers(slot, opts.clip, fi, painted?.name ?? null, tAttack, grow, target, B))
  }
  const keep = which === 'back' ? (z: number) => z < behindZ : (z: number) => z > behindZ
  const sorted = layers.filter((layer) => keep(layer.z)).sort((a, b) => a.z - b.z)
  if (!sorted.length) return
  const frame = located.frame
  ctx.save()
  ctx.globalAlpha *= opts.alpha
  ctx.imageSmoothingEnabled = false
  // Pixels stay right-facing. The caller scales the body and both arm passes together.
  ctx.translate(frame.ox, frame.oy)
  ctx.scale(fit * frame.scaleX, fit * frame.scaleY)
  ctx.translate(-ax, -ay)
  const paint = (list: readonly Layer[]) => {
    const base = ctx.globalAlpha
    for (const layer of list) {
      if (layer.alpha !== undefined) ctx.globalAlpha = base * layer.alpha
      drawPart(ctx, layer.name, mul(B, layer.m), tr.tint)
      ctx.globalAlpha = base
    }
  }
  // Side view: back-layer arms (z < body) paint before the body, front-layer after.
  // Legs live in the body cell, so a back arm sits behind the whole figure.
  paint(sorted)
  ctx.restore()
}
