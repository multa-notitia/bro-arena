/**
 * Side-view multi-arm maths. Each hero's compose_ref.py is the spec:
 * arm_layers() in body px, then body_track.m into the cell.
 * The game flips the whole figure when it faces left; this file stays unflipped.
 */
export type Mat = [number, number, number, number, number, number, number, number, number]

export interface Part {
  rect: [number, number, number, number]
  points: Record<string, [number, number]>
  dir0: number
  fore0: number
  axis: number
}

export interface Pose {
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
  weaponBehind?: boolean
  raised?: boolean
  rrot?: number
}

export interface TrackFrame {
  arms?: boolean
  m?: number[][]
  tint?: number[]
  native?: Record<string, Pose>
}

export interface Slot {
  name: string
  index: number
  pos: [number, number]
  side: number
  dir: number
  z: number
  native: boolean
  layer?: 'front' | 'back'
  /** body_track native key: slot.hero, else slot.nativeKey, else R/L from side. */
  hero?: string
  holds: boolean
}

export interface WeaponPaint {
  img: string
  family: string
  wood: boolean
  restAim: number
  shotOffset: number
  hand: { front: string; back: string }
  alt?: { imgs: string[]; imgsBack?: string[] }
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

export interface FamKey extends Pose {
  ms: number
}

export interface Layer {
  name: string
  m: Mat
  z: number
  alpha?: number
}

export interface ComposeRig {
  parts: Record<string, Part>
  weapons: Record<string, WeaponPaint>
  families: Record<string, FamKey[]>
  aimClamp: number
  sproutScale: number
  armTurnShare: number
  handD: number
  behindZ: number
  nativeArt: Record<string, string>
  sproutFront: string
  sproutBack: string
  tracks: Record<string, TrackFrame[]>
  secondary: Record<string, Pose[][]>
  /** null: the painted arm already ends in a fist. Absent palms use 'palm'. */
  emptyHand: string | null
  raisedFront: string | null
  raisedWeaponZ: number
  /** null: painted shoulders, no bud. sproutedOnly skips the hero's own arm. */
  bud: { sproutedOnly: boolean } | null
  /** 'layer' matches the chili/carrot/radish refs. 'side' matches the potato ref. */
  woodGroup: 'layer' | 'side'
}

/** Screen degrees of the painted rest aim (y down, 0 = right). */
export const NATIVE_REST_AIM = -62

export function T(x: number, y: number): Mat {
  return [1, 0, x, 0, 1, y, 0, 0, 1]
}

export function R(deg: number): Mat {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

export function Sm(k: number): Mat {
  return [k, 0, 0, 0, k, 0, 0, 0, 1]
}

export function mul(a: Mat, b: Mat): Mat {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] =
        a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
    }
  }
  return o as Mat
}

export function ap(m: Mat, p: [number, number]): [number, number] {
  return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]]
}

export function wrap(a: number): number {
  let x = (a + 180) % 360
  if (x < 0) x += 360
  return x - 180
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180
}

function pointOf(part: Part, name: string): [number, number] {
  return part.points[name] ?? [0, 0]
}

function familyKeys(rig: ComposeRig, name: string): FamKey[] | undefined {
  return rig.families[name] ?? (name === 'melee-slash' ? rig.families['melee-swing'] : undefined)
}

function familyAt(keys: FamKey[], t: number): FamKey | null {
  if (t < 0) return null
  let left = t
  for (const key of keys) {
    if (left < key.ms) return key
    left -= key.ms
  }
  return null
}

function bandOf(name: string): number {
  const band = name.slice(0, -1)
  if (band === 'top') return -1
  if (band === 'up') return 0
  if (band === 'mid') return 1
  return 2
}

function permutations(n: number): number[][] {
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
  return out
}

export interface AssignItem {
  id: string
  wood: boolean
}

/** Weapon ids onto slots. Matches compose_ref.assign, including holds:false. */
export function assignWeapons(
  rig: ComposeRig,
  loadout: (AssignItem | null)[],
  slots: Slot[],
  prev: (string | null)[],
): (string | null)[] {
  const n = slots.length
  let best = loadout.map((item) => (item ? item.id : null))
  let bestC = 1e9
  const groups = new Set<string>()
  for (const slot of slots) {
    groups.add(rig.woodGroup === 'layer' ? (slot.layer ?? String(slot.side)) : String(slot.side))
  }
  const groupList = [...groups].sort()
  for (const perm of permutations(n)) {
    const a = perm.map((p) => loadout[p] ?? null)
    if (a.some((item, i) => item && slots[i]!.holds === false)) continue
    let c = 0
    for (const group of groupList) {
      const wood = a
        .map((item, i) => {
          const slot = slots[i]!
          const key = rig.woodGroup === 'layer' ? (slot.layer ?? String(slot.side)) : String(slot.side)
          return item && item.wood && key === group ? bandOf(slot.name) : null
        })
        .filter((v): v is number => v !== null)
        .sort((x, y) => x - y)
      if (wood.length >= 2) {
        c += 10 * (wood.length - 1)
        for (let i = 1; i < wood.length; i++) if (wood[i]! - wood[i - 1]! === 1) c += 3
      }
    }
    const ref = prev.length === n ? prev : a.map((item) => (item ? item.id : null))
    for (let i = 0; i < n; i++) {
      const id = a[i] ? a[i]!.id : null
      if (ref[i] != null && id !== ref[i]) c += 1
    }
    if (c < bestC) {
      bestC = c
      best = a.map((item) => (item ? item.id : null))
    }
  }
  return best
}

function fxLayers(
  rig: ComposeRig,
  w: WeaponPaint,
  Wm: Mat,
  P: [number, number],
  aimC: number,
  k: number,
  z: number,
  front: boolean,
): Layer[] {
  const fx = w.fx?.release
  if (!fx) return []
  const part = rig.parts[fx.img]
  if (!part) return []
  const prm = fx.params ?? {}
  const zz =
    fx.z === 'behindBody' ? (front ? 9.5 : z - 0.05) : fx.z === 'aboveArm' ? z + 0.5 : Number(fx.z)
  if (fx.rule === 'swingArc') {
    const club = rig.parts[w.img]
    if (!club) return []
    const head = ap(Wm, pointOf(club, 'head'))
    const a = (Math.atan2(head[1] - P[1], head[0] - P[0]) * 180) / Math.PI
    const reach = Math.hypot(head[0] - P[0], head[1] - P[1])
    const mid = a - (prm.back ?? 0)
    const radius = prm.radius ?? 0
    const c: [number, number] = [
      P[0] + radius * reach * Math.cos(rad(mid)),
      P[1] + radius * reach * Math.sin(rad(mid)),
    ]
    const b = pointOf(part, 'bulge')
    return [{ name: fx.img, m: mul(mul(mul(T(c[0], c[1]), R(mid)), Sm(k)), T(-b[0], -b[1])), z: zz }]
  }
  const wp = rig.parts[w.img]
  if (!wp || !fx.at) return []
  const at = ap(Wm, pointOf(wp, fx.at))
  const d = aimC + (fx.rule === 'alongShot' ? w.shotOffset : 0)
  const ahead = prm.ahead ?? 0
  const side = prm.side ?? 0
  const cx = at[0] + ahead * k * Math.cos(rad(d)) - side * k * Math.sin(rad(d))
  const cy = at[1] + ahead * k * Math.sin(rad(d)) + side * k * Math.cos(rad(d))
  const an = pointOf(part, fx.anchor ?? 'tip')
  return [{ name: fx.img, m: mul(mul(mul(T(cx, cy), R(d)), Sm(k)), T(-an[0], -an[1])), z: zz }]
}

/** One arm, body px. `tAttack` is ms into the family clip, already past the jitter. */
export function composeArmLayers(
  rig: ComposeRig,
  slot: Slot,
  clip: string,
  fi: number,
  weaponName: string | null,
  tAttack: number | null,
  grow: number,
  target: [number, number] | null,
  B: Mat,
  weaponScale = 1,
): Layer[] {
  const P = slot.pos
  const sd = slot.side
  const tr = rig.tracks[clip]?.[fi]
  if (!tr) return []
  const sec = rig.secondary[clip]?.[fi]?.[slot.index]
  const w = weaponName ? rig.weapons[weaponName] : undefined
  let pose: Pose = sec ? { ...sec } : {}
  if (slot.native && tr.native) {
    const nativeKey = slot.hero ?? (sd > 0 ? 'R' : 'L')
    const hp = tr.native[nativeKey] ?? {}
    pose = {}
    if (hp.raise !== undefined) pose.raise = hp.raise
    if (hp.elbow !== undefined) pose.elbow = hp.elbow
    if (hp.wrist !== undefined) pose.wrist = hp.wrist
    if (hp.thrust !== undefined) pose.thrust = hp.thrust
    if (hp.raised !== undefined) pose.raised = hp.raised
    if (hp.rrot !== undefined) pose.rrot = hp.rrot
    if (w && hp.aim !== undefined) pose.wrist = hp.aim - NATIVE_REST_AIM
  }
  const keys = w ? familyKeys(rig, w.family) : undefined
  const key = w && keys && tAttack !== null ? familyAt(keys, tAttack) : null
  let ref = w ? w.restAim : 0
  if (key) {
    const baseRaise = pose.raise ?? 0
    const next: Pose = {}
    if (key.raise !== undefined) next.raise = key.raise
    if (key.elbow !== undefined) next.elbow = key.elbow
    if (key.wrist !== undefined) next.wrist = key.wrist
    if (key.thrust !== undefined) next.thrust = key.thrust
    if (key.aim !== undefined) next.aim = key.aim
    if (key.straight) next.straight = true
    if (key.alt) next.alt = true
    if (key.show) next.show = key.show
    if (key.raised) next.raised = true
    if (key.rrot !== undefined) next.rrot = key.rrot
    next.raise = (next.raise ?? 0) + 0.3 * baseRaise
    pose = next
    ref = key.aim ?? ref
  }
  let aimC = pose.aim !== undefined ? pose.aim : w ? w.restAim + (pose.wrist ?? 0) : 0
  let dc = 0
  if (target && w) {
    const sw = ap(B, P)
    const tAng = (Math.atan2(target[1] - sw[1], target[0] - sw[0]) * 180) / Math.PI
    const refc = ref + w.shotOffset
    const refW = sd > 0 ? refc : 180 - refc
    const delta = Math.max(-rig.aimClamp, Math.min(rig.aimClamp, wrap(tAng - refW)))
    dc = sd > 0 ? delta : -delta
  }
  aimC += dc
  const k = (slot.native ? 1 : rig.sproutScale) * grow
  const wk = k * weaponScale
  const front = slot.z > rig.behindZ
  const z = slot.z
  const out: Layer[] = []
  const raisedArt = front ? rig.raisedFront : null
  if (pose.raised && raisedArt && rig.parts[raisedArt]) {
    const ra = rig.parts[raisedArt]!
    const sh = pointOf(ra, 'shoulder')
    const Lm = mul(mul(mul(T(P[0], P[1]), R((pose.rrot ?? 0) + rig.armTurnShare * dc)), Sm(k)), T(-sh[0], -sh[1]))
    out.push({ name: raisedArt, m: Lm, z })
    if (w) {
      const wp = rig.parts[w.img]
      if (wp) {
        const g = ap(Lm, pointOf(ra, 'grip'))
        const gw = pointOf(wp, 'grip')
        const Wm = mul(mul(mul(T(g[0], g[1]), R(aimC - wp.axis)), Sm(wk)), T(-gw[0], -gw[1]))
        out.push({ name: w.img, m: Wm, z: rig.raisedWeaponZ })
      }
    }
    return mirrorSlot(out, sd, P)
  }
  const raise = pose.raise ?? 0
  const th = pose.thrust ?? 0
  const straight = !slot.native || !!pose.straight
  let wrist: [number, number]
  let dFore: number
  if (!straight) {
    const art = rig.nativeArt[slot.name] ?? 'arm4'
    const up = rig.parts[`${art}_upper`]
    const fo = rig.parts[`${art}_fore`]
    if (!up || !fo) return []
    const sh = pointOf(up, 'shoulder')
    const el = pointOf(up, 'elbow')
    const wr = pointOf(up, 'wrist')
    const dUp = slot.dir - raise + rig.armTurnShare * dc
    const U = mul(mul(mul(T(P[0], P[1]), R(dUp - up.dir0)), Sm(k)), T(-sh[0], -sh[1]))
    const eb = pose.elbow ?? 0
    dFore = dUp + (up.fore0 - up.dir0) - eb
    let F = mul(mul(mul(U, T(el[0], el[1])), R(-eb)), T(-el[0], -el[1]))
    if (th) F = mul(T(th * k * Math.cos(rad(dFore)), th * k * Math.sin(rad(dFore))), F)
    wrist = ap(F, wr)
    out.push({ name: `${art}_fore`, m: F, z }, { name: `${art}_upper`, m: U, z: z + 0.02 })
  } else {
    const nm = front ? rig.sproutFront : rig.sproutBack
    const la = rig.parts[nm]
    if (!la) return []
    const sh = pointOf(la, 'shoulder')
    const wr = pointOf(la, 'wrist')
    dFore = pose.straight ? aimC : slot.dir - raise + rig.armTurnShare * dc
    let Lm = mul(mul(mul(T(P[0], P[1]), R(dFore - la.dir0)), Sm(k)), T(-sh[0], -sh[1]))
    if (th) Lm = mul(T(th * k * Math.cos(rad(dFore)), th * k * Math.sin(rad(dFore))), Lm)
    wrist = ap(Lm, wr)
    out.push({ name: nm, m: Lm, z })
  }
  const hd = rig.handD * k
  const gCam: [number, number] = [wrist[0] + hd * Math.cos(rad(dFore)), wrist[1] + hd * Math.sin(rad(dFore))]
  const useAlt = !!(w && pose.alt && w.alt)
  if (w) {
    const hname = front ? w.hand.front : w.hand.back
    const hp = rig.parts[hname]
    if (hp) {
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
        const alts = front ? w.alt.imgs : (w.alt.imgsBack ?? w.alt.imgs)
        const an = alts[slot.index % alts.length] ?? alts[0]
        const apart = an ? rig.parts[an] : undefined
        if (apart && an) {
          const ga = pointOf(apart, 'grip')
          const Wm = mul(mul(mul(T(g[0], g[1]), R(aimC - apart.axis)), Sm(wk)), T(-ga[0], -ga[1]))
          out.push({ name: an, m: Wm, z: z + 0.06 })
          if (key && (key.show ?? []).includes('release') && w.fx?.release) {
            out.push(...fxLayers(rig, w, Wm, P, aimC, k, z, front))
          }
        }
      } else {
        const wp = rig.parts[w.img]
        if (wp) {
          const gw = pointOf(wp, 'grip')
          const Wm = mul(mul(mul(T(g[0], g[1]), R(aimC - wp.axis)), Sm(wk)), T(-gw[0], -gw[1]))
          const zw = front && key?.weaponBehind ? rig.behindZ - 0.6 : z + 0.03
          out.push({ name: w.img, m: Wm, z: zw }, { name: hname, m: H, z: z + 0.06 })
          if (key && (key.show ?? []).includes('release') && w.fx?.release) {
            out.push(...fxLayers(rig, w, Wm, P, aimC, k, z, front))
          }
        }
      }
    }
  } else if (rig.emptyHand !== null) {
    const hname = front ? rig.emptyHand || 'palm' : 'palm_dark'
    const hp = rig.parts[hname]
    if (hp) {
      const hg = pointOf(hp, 'grip')
      const H = mul(
        mul(mul(T(gCam[0], gCam[1]), R(dFore - 22 + (pose.wrist ?? 0))), Sm(k)),
        T(-hg[0], -hg[1]),
      )
      out.push({ name: hname, m: H, z: z + 0.06 })
    }
  }
  if (front && rig.bud && !(slot.native && rig.bud.sproutedOnly)) {
    const b = rig.parts.bud
    if (b) {
      const c = pointOf(b, 'center')
      out.push({ name: 'bud', m: mul(mul(T(P[0], P[1]), Sm(k)), T(-c[0], -c[1])), z: z + 0.04 })
    }
  }
  return mirrorSlot(out, sd, P)
}

function mirrorSlot(out: Layer[], sd: number, P: [number, number]): Layer[] {
  if (sd < 0) {
    const Wf = mul(mul(T(P[0], 0), [-1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat), T(-P[0], 0))
    for (const layer of out) {
      if (layer.name !== 'bud') layer.m = mul(Wf, layer.m)
    }
  }
  return out
}
