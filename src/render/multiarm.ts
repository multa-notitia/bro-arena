/**
 * Runtime multi-arm compositor for the spud.
 * Maths follow figures/player-potato/multiarm/compose_ref.py (`arm_layers` + `frame`).
 * Parts stay in body px; `body_track.m` maps them into the armless hero cell.
 */
import type { WeaponId } from '../core/types.ts'
import { actorClipFrame, loadSheetAt, type LoadedSheet, type SheetFrame } from './sheets.ts'

const ROOT = '/sprites/multiarm/potato'
const SHEET_ID = 'player-potato-armless'

type Mat = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

interface Part {
  rect: [number, number, number, number]
  points: Record<string, [number, number]>
  dir0: number
  fore0: number
  axis: number
}

interface Pose {
  raise?: number
  elbow?: number
  wrist?: number
  thrust?: number
  aim?: number
  straight?: boolean
  alt?: boolean
  show?: string[]
  ev?: string[]
  ms?: number
  scale?: number
  bud?: number
  dust?: boolean
}

interface TrackFrame {
  arms?: boolean
  m?: number[][]
  tint?: number[]
  native?: { R?: Pose; L?: Pose }
}

interface Slot {
  name: string
  index: number
  pos: [number, number]
  side: number
  dir: number
  z: number
  native: boolean
}

interface WeaponPaint {
  img: string
  family: string
  wood: boolean
  restAim: number
  shotOffset: number
  hand: { front: string; back: string }
  alt?: { imgs: string[] }
  fx?: {
    release: {
      img: string
      rule: string
      z: number | string
      anchor?: string
      at?: string
      params?: { back?: number; radius?: number; ahead?: number; side?: number }
    }
  }
}

interface FamKey extends Pose {
  ms: number
}

interface Layer {
  name: string
  m: Mat
  z: number
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

const DEBUG_POOL: WeaponId[] = ['pistol', 'knife', 'stick', 'slingshot', 'wand', 'hammer']
const SPROUT_STAGGER = 320

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

let loadKey = ''
let currentSlots: Slot[] = []
let assignUids: (number | null)[] = []
const states = new Map<string, SlotState>()
const prevBySlot = new Map<string, number | null>()
const idByUid = new Map<number, WeaponId>()
const aimAt = new Map<number, { x: number; y: number }>()
const perms = new Map<number, number[][]>()

let scratch: HTMLCanvasElement | null = null
let scratchCtx: CanvasRenderingContext2D | null = null

function T(x: number, y: number): Mat {
  return [1, 0, x, 0, 1, y, 0, 0, 1]
}

function R(deg: number): Mat {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
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

function ap(m: Mat, p: [number, number]): [number, number] {
  return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]]
}

function wrap(a: number): number {
  let x = (a + 180) % 360
  if (x < 0) x += 360
  return x - 180
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180
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

export function multiArmSheet(): LoadedSheet | null {
  return ready ? bodySheet : null
}

export function potatoMultiArm(species: string): boolean {
  return species === 'potato' && ready
}

/** `?arms=1..6` replaces the potato's starters. Other heroes ignore it. */
export function debugPotatoWeapons(): { id: WeaponId; tier: 1 }[] | null {
  if (typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('arms')
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 6) return null
  return DEBUG_POOL.slice(0, n).map((id) => ({ id, tier: 1 as const }))
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

export function preloadMultiArm(): Promise<void> {
  if (settled) return Promise.resolve()
  return (async () => {
    try {
      const [trackJ, sockJ, wpnJ, famJ, partsJ, sheet] = await Promise.all([
        fetch(`${ROOT}/body_track.json`).then((r) => r.json()),
        fetch(`${ROOT}/sockets.json`).then((r) => r.json()),
        fetch(`${ROOT}/weapons.json`).then((r) => r.json()),
        fetch(`${ROOT}/families.json`).then((r) => r.json()),
        fetch(`${ROOT}/parts.json`).then((r) => r.json()),
        loadSheetAt(`${ROOT}/player-potato-armless.json`, SHEET_ID),
      ])
      const imageName = typeof partsJ.image === 'string' ? partsJ.image : 'parts.png'
      partsImg = await loadImage(`${ROOT}/${imageName}`)
      parts = parseParts(partsJ.parts)
      weapons = (wpnJ.weapons ?? {}) as Record<string, WeaponPaint>
      families = (famJ.families ?? {}) as Record<string, FamKey[]>
      sproutKeys = (famJ.sprout ?? []) as FamKey[]
      aimClamp = num(famJ.aimClamp, 50)
      sproutScale = num(famJ.sproutScale, num(sockJ.arms?.sprouted?.scale, 0.8))
      armTurnShare = num(famJ.armTurnShare, 0.6)
      handD = num(famJ.handD, 13)
      behindZ = num(sockJ.behindBodyZ, 10)
      nativeArt = (sockJ.arms?.native ?? {}) as Record<string, string>
      sproutFront = sockJ.arms?.sprouted?.front ?? 'long_cut'
      sproutBack = sockJ.arms?.sprouted?.back ?? 'long_dark_cut'
      slotDefs = parseSlots(sockJ.slots)
      layouts = sockJ.layouts ?? {}
      tracks = (trackJ.clips ?? {}) as Record<string, TrackFrame[]>
      secondary = (trackJ.secondary ?? {}) as Record<string, Pose[][]>
      bodySheet = sheet
      ready = !!sheet && !!partsImg
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
    out[name] = {
      pos: pt(o.pos),
      side: num(o.side, 1),
      dir: num(o.dir),
      z: num(o.z),
      native: !!o.native,
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
    })
  })
  return out
}

function permutations(n: number): number[][] {
  const hit = perms.get(n)
  if (hit) return hit
  const out: number[][] = []
  const used = new Array<boolean>(n).fill(false)
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === n) {
      out.push(cur.slice())
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(i)
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
  perms.set(n, out)
  return out
}

function bandOf(name: string): number {
  const band = name.slice(0, -1)
  if (band === 'up') return 0
  if (band === 'mid') return 1
  return 2
}

interface AssignItem {
  uid: number
  wood: boolean
}

function assign(loadout: (AssignItem | null)[], slots: Slot[], prev: (number | null)[]): number[] {
  const n = slots.length
  let best = loadout.map((item) => (item ? item.uid : -1))
  let bestC = 1e9
  for (const perm of permutations(n)) {
    const a = perm.map((p) => loadout[p] ?? null)
    let c = 0
    for (const side of [1, -1]) {
      const wood = a
        .map((item, i) => (item && item.wood && slots[i]!.side === side ? bandOf(slots[i]!.name) : null))
        .filter((v): v is number => v !== null)
        .sort((x, y) => x - y)
      if (wood.length >= 2) {
        c += 10 * (wood.length - 1)
        for (let i = 1; i < wood.length; i++) if (wood[i]! - wood[i - 1]! === 1) c += 3
      }
    }
    const ref = prev.length === n ? prev : a.map((item) => (item ? item.uid : null))
    for (let i = 0; i < n; i++) {
      const uid = a[i] ? a[i]!.uid : null
      if (ref[i] != null && uid !== ref[i]) c += 1
    }
    if (c < bestC) {
      bestC = c
      best = a.map((item) => (item ? item.uid : -1))
    }
  }
  return best
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
    const paint = PAINT[w.id]
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

function familyAt(keys: FamKey[], t: number): { key: FamKey; index: number } | null {
  if (t < 0) return null
  let left = t
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!key) continue
    if (left < key.ms) return { key, index: i }
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
  const name = PAINT[id]
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
export function tickMultiArm(dt: number, list: readonly ArmIn[]): number[] {
  if (!ready) return []
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
    const keys = painted ? families[painted.spec.family] : undefined
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
  const P = slot.pos
  const sd = slot.side
  const tr = tracks[clip]?.[fi]
  if (!tr) return []
  const sec = secondary[clip]?.[fi]?.[slot.index]
  const w = weaponName ? weapons[weaponName] : undefined
  let pose: Pose = sec ? { ...sec } : {}
  if (slot.native && tr.native) {
    const hp = tr.native[sd > 0 ? 'R' : 'L'] ?? {}
    pose = {}
    if (hp.raise !== undefined) pose.raise = hp.raise
    if (hp.elbow !== undefined) pose.elbow = hp.elbow
    if (hp.wrist !== undefined) pose.wrist = hp.wrist
    if (hp.thrust !== undefined) pose.thrust = hp.thrust
    if (w && hp.aim !== undefined) pose.wrist = hp.aim + 62
  }
  const keys = w ? families[w.family] : undefined
  const key = w && keys && tAttack !== null ? familyAt(keys, tAttack)?.key ?? null : null
  let ref = w ? w.restAim : 0
  if (key) {
    const baseRaise = pose.raise ?? 0
    pose = { ...key }
    delete pose.ms
    delete pose.ev
    pose.raise = (pose.raise ?? 0) + 0.3 * baseRaise
    ref = pose.aim ?? ref
  }
  let aimC = pose.aim !== undefined ? pose.aim : w ? w.restAim + (pose.wrist ?? 0) : 0
  let dc = 0
  if (target && w) {
    const sw = ap(B, P)
    const tAng = (Math.atan2(target[1] - sw[1], target[0] - sw[0]) * 180) / Math.PI
    const refc = ref + w.shotOffset
    const refW = sd > 0 ? refc : 180 - refc
    const delta = Math.max(-aimClamp, Math.min(aimClamp, wrap(tAng - refW)))
    dc = sd > 0 ? delta : -delta
  }
  aimC += dc
  const k = (slot.native ? 1 : sproutScale) * grow
  const front = slot.z > behindZ
  const z = slot.z
  const out: Layer[] = []
  const raise = pose.raise ?? 0
  const th = pose.thrust ?? 0
  const straight = !slot.native || !!pose.straight
  let wrist: [number, number]
  let dFore: number
  if (!straight) {
    const art = nativeArt[slot.name] ?? 'arm4'
    const up = parts[`${art}_upper`]
    if (!up || !parts[`${art}_fore`]) return []
    const sh = pointOf(up, 'shoulder')
    const el = pointOf(up, 'elbow')
    const wr = pointOf(up, 'wrist')
    const dUp = slot.dir - raise + armTurnShare * dc
    const U = mul(mul(mul(T(P[0], P[1]), R(dUp - up.dir0)), Sm(k)), T(-sh[0], -sh[1]))
    const eb = pose.elbow ?? 0
    let F = mul(mul(mul(U, T(el[0], el[1])), R(-eb)), T(-el[0], -el[1]))
    dFore = dUp + (up.fore0 - up.dir0) - eb
    if (th) F = mul(T(th * k * Math.cos(rad(dFore)), th * k * Math.sin(rad(dFore))), F)
    wrist = ap(F, wr)
    out.push({ name: `${art}_fore`, m: F, z }, { name: `${art}_upper`, m: U, z: z + 0.02 })
  } else {
    const nm = front ? sproutFront : sproutBack
    const la = parts[nm]
    if (!la) return []
    const sh = pointOf(la, 'shoulder')
    const wr = pointOf(la, 'wrist')
    dFore = pose.straight ? aimC : slot.dir - raise + armTurnShare * dc
    let Lm = mul(mul(mul(T(P[0], P[1]), R(dFore - la.dir0)), Sm(k)), T(-sh[0], -sh[1]))
    if (th) Lm = mul(T(th * k * Math.cos(rad(dFore)), th * k * Math.sin(rad(dFore))), Lm)
    wrist = ap(Lm, wr)
    out.push({ name: nm, m: Lm, z })
  }
  const hd = handD * k
  const gCam: [number, number] = [
    wrist[0] + hd * Math.cos(rad(dFore)),
    wrist[1] + hd * Math.sin(rad(dFore)),
  ]
  const useAlt = !!(w && pose.alt && w.alt)
  let Wm: Mat | null = null
  if (w) {
    const hname = front ? w.hand.front : w.hand.back
    const hp = parts[hname]
    if (!hp) return out
    let H: Mat
    let g: [number, number]
    if (hname === 'fist34') {
      const hw = pointOf(hp, 'wrist')
      H = mul(mul(mul(T(wrist[0], wrist[1]), R(aimC)), Sm(k)), T(-hw[0], -hw[1]))
      g = ap(H, pointOf(hp, 'grip'))
    } else {
      g = gCam
      const hg = pointOf(hp, 'grip')
      H = mul(mul(mul(T(g[0], g[1]), R(dFore - 22)), Sm(k)), T(-hg[0], -hg[1]))
    }
    if (useAlt && w.alt) {
      const an = w.alt.imgs[slot.index % w.alt.imgs.length] ?? w.alt.imgs[0]
      const apart = an ? parts[an] : undefined
      if (apart && an) {
        const ga = pointOf(apart, 'grip')
        Wm = mul(mul(mul(T(g[0], g[1]), R(aimC - apart.axis)), Sm(k)), T(-ga[0], -ga[1]))
        out.push({ name: an, m: Wm, z: z + 0.06 })
      }
    } else {
      const wp = parts[w.img]
      if (wp) {
        const gw = pointOf(wp, 'grip')
        Wm = mul(mul(mul(T(g[0], g[1]), R(aimC - wp.axis)), Sm(k)), T(-gw[0], -gw[1]))
        out.push({ name: w.img, m: Wm, z: z + 0.03 }, { name: hname, m: H, z: z + 0.06 })
      }
    }
    if (key && Wm && (key.show ?? []).includes('release') && w.fx?.release) {
      out.push(...fxLayers(w, Wm, P, aimC, k, z, front))
    }
  } else {
    const hname = front ? 'palm' : 'palm_dark'
    const hp = parts[hname]
    if (hp) {
      const hg = pointOf(hp, 'grip')
      const H = mul(
        mul(mul(T(gCam[0], gCam[1]), R(dFore - 22 + (pose.wrist ?? 0))), Sm(k)),
        T(-hg[0], -hg[1]),
      )
      out.push({ name: hname, m: H, z: z + 0.06 })
    }
  }
  if (front) {
    const b = parts.bud
    if (b) {
      const c = pointOf(b, 'center')
      out.push({ name: 'bud', m: mul(mul(T(P[0], P[1]), Sm(k)), T(-c[0], -c[1])), z: z + 0.04 })
    }
  }
  if (sd < 0) {
    const Wf = mul(mul(T(P[0], 0), [-1, 0, 0, 0, 1, 0, 0, 0, 1]), T(-P[0], 0))
    for (const layer of out) {
      if (layer.name !== 'bud') layer.m = mul(Wf, layer.m)
    }
  }
  return out
}

function fxLayers(w: WeaponPaint, Wm: Mat, P: [number, number], aimC: number, k: number, z: number, front: boolean): Layer[] {
  const fx = w.fx?.release
  if (!fx) return []
  const part = parts[fx.img]
  if (!part) return []
  const prm = fx.params ?? {}
  const zz = fx.z === 'behindBody' ? (front ? 9.5 : z - 0.05) : num(fx.z, 14)
  if (fx.rule === 'swingArc') {
    const club = parts[w.img]
    if (!club) return []
    const head = ap(Wm, pointOf(club, 'head'))
    const a = (Math.atan2(head[1] - P[1], head[0] - P[0]) * 180) / Math.PI
    const reach = Math.hypot(head[0] - P[0], head[1] - P[1])
    const mid = a - num(prm.back, 45)
    const radius = num(prm.radius, 0.92)
    const c: [number, number] = [
      P[0] + radius * reach * Math.cos(rad(mid)),
      P[1] + radius * reach * Math.sin(rad(mid)),
    ]
    const b = pointOf(part, 'bulge')
    return [{ name: fx.img, m: mul(mul(mul(T(c[0], c[1]), R(mid)), Sm(k)), T(-b[0], -b[1])), z: zz }]
  }
  const wp = parts[w.img]
  if (!wp || !fx.at) return []
  const at = ap(Wm, pointOf(wp, fx.at))
  const d = aimC + (fx.rule === 'alongShot' ? w.shotOffset : 0)
  const ahead = num(prm.ahead)
  const side = num(prm.side)
  const cx = at[0] + ahead * k * Math.cos(rad(d)) - side * k * Math.sin(rad(d))
  const cy = at[1] + ahead * k * Math.sin(rad(d)) + side * k * Math.cos(rad(d))
  const anchorName = fx.anchor ?? 'tip'
  const an = pointOf(part, anchorName)
  return [{ name: fx.img, m: mul(mul(mul(T(cx, cy), R(d)), Sm(k)), T(-an[0], -an[1])), z: zz }]
}

function sproutExtras(slot: Slot, st: SlotState): Layer[] {
  if (st.sproutMs < 0) return []
  const at = familyAt(sproutKeys, st.sproutMs)
  if (!at) return []
  const out: Layer[] = []
  const P = slot.pos
  if (at.key.bud) {
    const b = parts.bud
    if (b) {
      const c = pointOf(b, 'center')
      const s = at.key.bud * sproutScale
      out.push({ name: 'bud', m: mul(mul(T(P[0], P[1]), Sm(s)), T(-c[0], -c[1])), z: 10.5 })
    }
  }
  if (at.index < 3) {
    const dust = parts.fx_dust
    if (dust) {
      const c = pointOf(dust, 'center')
      out.push({ name: 'fx_dust', m: mul(mul(T(P[0], P[1]), Sm(1)), T(-c[0], -c[1])), z: 12 })
    }
  }
  return out
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
  ctx.save()
  ctx.transform(m[0], m[3], m[1], m[4], m[2], m[5])
  if (tint && tint.length >= 4 && (tint[3] ?? 0) > 0.01) {
    if (!scratch) {
      scratch = document.createElement('canvas')
      scratchCtx = scratch.getContext('2d')
    }
    const g = scratchCtx
    if (scratch && g) {
      if (scratch.width < w || scratch.height < h) {
        scratch.width = Math.max(scratch.width, Math.ceil(w))
        scratch.height = Math.max(scratch.height, Math.ceil(h))
      }
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, w, h)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.globalCompositeOperation = 'source-over'
      g.drawImage(img, sx, sy, w, h, 0, 0, w, h)
      g.globalCompositeOperation = 'source-atop'
      const r = Math.round((tint[0] ?? 1) * 255)
      const gg = Math.round((tint[1] ?? 1) * 255)
      const b = Math.round((tint[2] ?? 1) * 255)
      g.fillStyle = `rgba(${r},${gg},${b},${tint[3] ?? 0})`
      g.fillRect(0, 0, w, h)
      ctx.drawImage(scratch, 0, 0, w, h, 0, 0, w, h)
    }
  } else {
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  }
  ctx.restore()
}

export interface MultiArmDraw {
  weapons: readonly ArmIn[]
  clip: string
  r: number
  facing: 1 | -1
  alpha: number
  originX: number
  originY: number
  bodyRot: number
}

/** Draw arm parts in the same space as `drawActorSheet` (caller has translated to the hero). */
export function drawMultiArm(ctx: CanvasRenderingContext2D, which: 'back' | 'front', opts: MultiArmDraw): void {
  if (!ready || !bodySheet) return
  syncLoadout(opts.weapons)
  const located = actorClipFrame('player', bodySheet, opts.clip)
  if (!located) return
  const tr = tracks[opts.clip]?.[located.index]
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
    layers.push(...armLayers(slot, opts.clip, located.index, painted?.name ?? null, tAttack, grow, target, B))
  }
  const keep = which === 'back' ? (z: number) => z < behindZ : (z: number) => z > behindZ
  const sorted = layers.filter((layer) => keep(layer.z)).sort((a, b) => a.z - b.z)
  if (!sorted.length) return
  const frame = located.frame
  ctx.save()
  ctx.globalAlpha *= opts.alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(frame.ox * opts.facing, frame.oy)
  ctx.scale(opts.facing * fit * frame.scaleX, fit * frame.scaleY)
  ctx.translate(-ax, -ay)
  for (const layer of sorted) {
    const cell = mul(B, layer.m)
    drawPart(ctx, layer.name, cell, tr.tint)
  }
  ctx.restore()
}
