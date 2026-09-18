/**
 * Direction A wet-soil board radish. Torso is the cut painting; limbs, face,
 * and contact shadow are live so the vegetable can walk, look, and hold a knife.
 * Does not replace Wash/Sketch/Stain or the Painted chili sheet.
 */
import { TAU, clamp, ease, lerp, wrapAngle } from '../core/math.ts'
import type { AnimState } from '../core/types.ts'
import atlasJson from '../assets/concept-a/board/radish-atlas.json' with { type: 'json' }
import radishPortrait from '../assets/concept-a/board/radish-portrait.data.ts'
import radishBody from '../assets/concept-a/board/radish-body.data.ts'
import radishWalk0 from '../assets/concept-a/board/radish-walk-0.data.ts'
import radishWalk1 from '../assets/concept-a/board/radish-walk-1.data.ts'
import radishWalk2 from '../assets/concept-a/board/radish-walk-2.data.ts'

interface Mark {
  cx: number
  cy: number
  rx?: number
  ry?: number
  rw?: number
  rh?: number
}

interface Rig {
  w: number
  h: number
  eyeL: Mark
  eyeR: Mark
  mouth: Mark
  browL: { x0: number; y0: number; x1: number; y1: number }
  browR: { x0: number; y0: number; x1: number; y1: number }
  shL: Mark
  shR: Mark
  hipL: Mark
  hipR: Mark
  ground: number
  body: string
  limb: string
  fist: string
  foot: string
  ink: string
  sclera: string
  lid: string
}

const atlas = atlasJson as { rig: Rig }
const rig = atlas.rig

const images = new Map<string, HTMLImageElement>()
let ready = false
let loadPromise: Promise<void> | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Board radish sprite failed: ${url}`))
    img.src = url
  })
}

export function isBoardReady(): boolean {
  return ready
}

export function preloadBoard(): Promise<void> {
  if (ready) return Promise.resolve()
  if (loadPromise) return loadPromise
  const urls: Record<string, string> = {
    portrait: radishPortrait,
    body: radishBody,
    'walk-0': radishWalk0,
    'walk-1': radishWalk1,
    'walk-2': radishWalk2,
  }
  loadPromise = Promise.all(Object.entries(urls).map(([k, url]) => loadImage(url).then((img) => images.set(k, img))))
    .then(() => {
      ready = true
    })
    .catch((err) => {
      loadPromise = null
      throw err
    })
  return loadPromise
}

export interface BoardWeapon {
  slot: number
  angle: number
  swingT: number
  kind: string
}

export interface BoardHand {
  x: number
  y: number
  rot: number
}

export interface BoardDrawOpts {
  x: number
  y: number
  r: number
  facing: 1 | -1
  squash: number
  alpha: number
  anim: AnimState
  lookX: number
  lookY: number
  mouth: number
  blink: number
  weapons: readonly BoardWeapon[]
}

interface Joint {
  x: number
  y: number
  rot: number
  midX: number
  midY: number
  plant?: number
}

export interface BoardPose {
  w: number
  h: number
  ox: number
  oy: number
  ground: number
  bob: number
  lean: number
  shL: { x: number; y: number }
  shR: { x: number; y: number }
  hipL: { x: number; y: number }
  hipR: { x: number; y: number }
  left: Joint
  right: Joint
  footL: Joint
  footR: Joint
}

function layout(r: number): { w: number; h: number; ox: number; oy: number } {
  const h = r * 3.48
  const w = h * (rig.w / rig.h)
  return { w, h, ox: -w / 2, oy: -h * 0.58 }
}

function nx(mark: Mark, box: { w: number; ox: number }): number {
  return box.ox + mark.cx * box.w
}

function ny(mark: Mark, box: { h: number; oy: number }): number {
  return box.oy + mark.cy * box.h
}

function wrap01(v: number): number {
  return v - Math.floor(v)
}

/** 0 = wind-up, 1 = full extension. Holds the stab so a 0.18s swing still reads. */
function attackWeight(t: number): number {
  const u = clamp(t, 0, 1)
  if (u < 0.16) return u / 0.16
  if (u < 0.58) return 1
  return 1 - (u - 0.58) / 0.42
}

/**
 * Stance 0..0.55: foot planted, travels back under the body.
 * Swing 0.55..1: foot lifts and reaches forward. Opposite legs are 0.5 out of phase.
 */
function footLocal(
  hipX: number,
  ground: number,
  phase: number,
  stride: number,
  lift: number,
  moving: boolean,
): { x: number; y: number; plant: number; toe: number } {
  if (!moving) {
    return { x: hipX, y: ground, plant: 1, toe: 0 }
  }
  const p = wrap01(phase)
  if (p < 0.55) {
    const u = p / 0.55
    const plant = u < 0.82 ? 1 : lerp(1, 0.2, (u - 0.82) / 0.18)
    return {
      x: hipX + lerp(stride, -stride, u),
      y: ground,
      plant: clamp(plant, 0.2, 1),
      toe: 0,
    }
  }
  const u = (p - 0.55) / 0.45
  const e = ease.inOutCubic(u)
  return {
    x: hipX + lerp(-stride, stride, e),
    y: ground - Math.sin(u * Math.PI) * lift,
    plant: 0.06,
    toe: Math.sin(u * Math.PI) * 0.55,
  }
}

function twoBone(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lenA: number,
  lenB: number,
  bend: number,
): Joint {
  const dx = toX - fromX
  const dy = toY - fromY
  const d = Math.hypot(dx, dy) || 0.001
  const maxL = lenA + lenB
  const minL = Math.abs(lenA - lenB) + 0.8
  const reach = clamp(d, minL, maxL - 0.15)
  const ux = dx / d
  const uy = dy / d
  const endX = fromX + ux * Math.min(d, maxL)
  const endY = fromY + uy * Math.min(d, maxL)
  const cosA = clamp((lenA * lenA + reach * reach - lenB * lenB) / (2 * lenA * reach), -1, 1)
  const off = Math.acos(cosA)
  const base = Math.atan2(uy, ux)
  const midAng = base + bend * off
  const midX = fromX + Math.cos(midAng) * lenA
  const midY = fromY + Math.sin(midAng) * lenA
  return {
    x: endX,
    y: endY,
    midX,
    midY,
    rot: Math.atan2(endY - midY, endX - midX),
  }
}

function attackFor(side: -1 | 1, weapons: readonly BoardWeapon[]): BoardWeapon | null {
  const slot = side < 0 ? 1 : 0
  return weapons.find((it) => it.slot === slot && it.swingT >= 0) ?? null
}

function localAim(worldAngle: number, facing: 1 | -1): number {
  return Math.atan2(Math.sin(worldAngle), Math.cos(worldAngle) * facing)
}

function hangAngle(side: -1 | 1, t: number): number {
  const sway = Math.sin(t * 2.25 + side) * 0.06
  return (side < 0 ? Math.PI * 0.78 : Math.PI * 0.22) + sway
}

function armTarget(
  sh: { x: number; y: number },
  side: -1 | 1,
  len: number,
  anim: AnimState,
  facing: 1 | -1,
  weapons: readonly BoardWeapon[],
  chinY: number,
): { x: number; y: number; bend: number } {
  const atk = attackFor(side, weapons)
  const hang = hangAngle(side, anim.t)
  let ang = hang
  let reach = len
  let bend = side < 0 ? 0.32 : -0.32
  let attacking = false

  if (atk && atk.swingT >= 0) {
    attacking = true
    const t = clamp(atk.swingT, 0, 1)
    const w = attackWeight(t)
    const aim = localAim(atk.angle, facing)
    if (atk.kind === 'sweep') {
      const arc = 2.05
      const cocked = aim - side * 0.15 - arc * 0.55
      const follow = aim - side * 0.15 + arc * 0.5
      ang = lerp(cocked, follow, ease.outCubic(t))
      reach = len * (1.05 + w * 0.22)
      bend = lerp(side * 0.9, side * 0.15, w)
    } else if (atk.kind === 'thrust') {
      const cocked = hang + side * 0.12 - 0.4
      ang = lerp(cocked, aim, ease.outCubic(w))
      reach = len * (0.82 + w * 0.9)
      bend = lerp(side * 0.95, side * 0.1, w)
    } else if (atk.kind === 'shoot') {
      ang = lerp(hang, aim, 0.85)
      reach = len * (1 - Math.sin(t * Math.PI) * 0.22)
      bend = side * 0.35
    } else {
      ang = lerp(hang, aim, 0.7)
      reach = len * (1 + w * 0.2)
    }
  } else {
    const held = weapons.find((it) => it.slot === (side < 0 ? 1 : 0))
    if (anim.moving) {
      const swing = Math.sin(anim.gait * TAU) * -side
      ang = hang + swing * 0.55
      reach = len * (0.96 + Math.abs(swing) * 0.04)
      bend = (side < 0 ? 0.55 : -0.55) - swing * 0.22
    }
    if (held) {
      const aim = localAim(held.angle, facing)
      const mix = anim.moving ? 0.18 : 0.28
      ang = ang + wrapAngle(aim - ang) * mix
    }
  }

  let x = sh.x + Math.cos(ang) * reach
  let y = sh.y + Math.sin(ang) * reach
  if (!attacking) {
    y = Math.max(y, chinY)
    if (side < 0) x = Math.min(x, sh.x - 2.2)
    else x = Math.max(x, sh.x + 2.2)
  }
  return { x, y, bend }
}

export function poseBoardRadish(opts: BoardDrawOpts): BoardPose {
  const box = layout(opts.r)
  const moving = opts.anim.moving
  const gait = opts.anim.gait
  const bob = moving
    ? (1 - Math.abs(Math.cos(gait * TAU))) * opts.r * 0.09
    : Math.sin(opts.anim.t * 2.15) * opts.r * 0.04
  const ground = box.oy + rig.ground * box.h
  const stride = box.w * 0.42
  const lift = box.h * 0.095
  const hipSway = moving ? Math.sin(gait * TAU) * box.w * 0.045 : 0
  const hipL = { x: nx(rig.hipL, box) + hipSway, y: ny(rig.hipL, box) + bob }
  const hipR = { x: nx(rig.hipR, box) + hipSway, y: ny(rig.hipR, box) + bob }
  const shL = { x: nx(rig.shL, box), y: ny(rig.shL, box) + bob }
  const shR = { x: nx(rig.shR, box), y: ny(rig.shR, box) + bob }
  const armLen = opts.r * 0.78
  const upper = armLen * 0.48
  const lower = armLen * 0.52
  const legLen = Math.max(8, ground - hipL.y)
  const thigh = legLen * 0.52
  const shin = legLen * 0.5

  const fL = footLocal(hipL.x, ground, gait, stride, lift, moving)
  const fR = footLocal(hipR.x, ground, gait + 0.5, stride, lift, moving)
  const kneeBendL = moving ? (fL.plant > 0.5 ? 0.55 : 1.05) : 0.42
  const kneeBendR = moving ? (fR.plant > 0.5 ? 0.55 : 1.05) : 0.42
  const footL = {
    ...twoBone(hipL.x, hipL.y, fL.x, fL.y, thigh, shin, kneeBendL),
    plant: fL.plant,
  }
  const footR = {
    ...twoBone(hipR.x, hipR.y, fR.x, fR.y, thigh, shin, kneeBendR),
    plant: fR.plant,
  }

  const lT = armTarget(shL, -1, armLen, opts.anim, opts.facing, opts.weapons, box.oy + 0.5 * box.h + bob)
  const rT = armTarget(shR, 1, armLen, opts.anim, opts.facing, opts.weapons, box.oy + 0.5 * box.h + bob)
  const left = twoBone(shL.x, shL.y, lT.x, lT.y, upper, lower, lT.bend)
  const right = twoBone(shR.x, shR.y, rT.x, rT.y, upper, lower, rT.bend)

  const atk = opts.weapons.find((w) => w.swingT >= 0)
  const lean = atk && atk.swingT >= 0 ? Math.cos(localAim(atk.angle, opts.facing)) * attackWeight(atk.swingT) * 0.14 : 0

  return {
    ...box,
    ground,
    bob,
    lean,
    shL,
    shR,
    hipL,
    hipR,
    left,
    right,
    footL,
    footR,
  }
}

export function boardHeld(
  originX: number,
  originY: number,
  facing: 1 | -1,
  pose: BoardPose,
): { left: BoardHand; right: BoardHand } {
  return {
    left: worldHand(originX, originY, facing, pose.left),
    right: worldHand(originX, originY, facing, pose.right),
  }
}

function worldHand(
  originX: number,
  originY: number,
  facing: 1 | -1,
  hand: { x: number; y: number; rot: number },
): BoardHand {
  return {
    x: originX + hand.x * facing,
    y: originY + hand.y,
    rot: Math.atan2(Math.sin(hand.rot), Math.cos(hand.rot) * facing),
  }
}

function strokeLimb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  fill: string,
  ink: string,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = ink
  ctx.lineWidth = width + 1.8
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.strokeStyle = fill
  ctx.lineWidth = width
  ctx.stroke()
  ctx.restore()
}

function paintFoot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  toe: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(toe)
  ctx.fillStyle = rig.foot
  ctx.strokeStyle = rig.ink
  ctx.lineWidth = 1.35
  ctx.beginPath()
  ctx.ellipse(s * 0.28, 0, s * 1.22, s * 0.46, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function paintFist(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.fillStyle = rig.fist
  ctx.strokeStyle = rig.ink
  ctx.lineWidth = 1.35
  ctx.beginPath()
  ctx.ellipse(x, y, s, s * 0.9, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function coverAndPaintFace(
  ctx: CanvasRenderingContext2D,
  box: { w: number; h: number; ox: number; oy: number },
  bob: number,
  lookX: number,
  lookY: number,
  blink: number,
  mouth: number,
): void {
  const paintEye = (mark: Mark, lx: number, tilt: number) => {
    const cx = nx(mark, box)
    const cy = ny(mark, box) + bob
    const rx = (mark.rx ?? 0.05) * box.w
    const ry = (mark.ry ?? 0.028) * box.h
    ctx.fillStyle = rig.body
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx * 1.18, ry * 1.22, tilt, 0, TAU)
    ctx.fill()

    const ox = clamp(lx, -1, 1) * rx * 0.52
    const oy = clamp(lookY, -1, 1) * ry * 0.4
    const ex = cx + ox
    const ey = cy + oy

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, tilt, 0, TAU)
    ctx.clip()
    ctx.fillStyle = '#3a1418'
    ctx.fill()
    ctx.fillStyle = rig.ink
    ctx.beginPath()
    ctx.ellipse(ex, ey, rx * 0.72, ry * 0.78, tilt, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(ex - rx * 0.18, ey - ry * 0.22, Math.max(0.5, rx * 0.12), 0, TAU)
    ctx.fill()
    ctx.restore()

    const lid = blink < 0 ? 1 : 1 - Math.sin(clamp(blink, 0, 1) * Math.PI)
    if (lid < 0.94) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx * 1.04, ry * 1.08, tilt, 0, TAU)
      ctx.clip()
      ctx.fillStyle = rig.lid
      const close = 1 - lid
      ctx.beginPath()
      ctx.ellipse(cx, cy - ry * (1 - close) * 0.15, rx * 1.08, ry * close * 1.25, tilt, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    ctx.strokeStyle = rig.ink
    ctx.lineWidth = Math.max(1.1, rx * 0.16)
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, tilt, 0, TAU)
    ctx.stroke()
  }

  paintEye(rig.eyeL, lookX, 0.18)
  paintEye(rig.eyeR, lookX, -0.18)

  ctx.save()
  ctx.strokeStyle = rig.ink
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1.6, box.w * 0.022)
  const brow = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    ctx.beginPath()
    ctx.moveTo(box.ox + b.x0 * box.w, box.oy + b.y0 * box.h + bob)
    ctx.lineTo(box.ox + b.x1 * box.w, box.oy + b.y1 * box.h + bob)
    ctx.stroke()
  }
  brow(rig.browL)
  brow(rig.browR)
  ctx.restore()

  const mx = nx(rig.mouth, box)
  const my = ny(rig.mouth, box) + bob
  const mw = (rig.mouth.rw ?? 0.09) * box.w
  ctx.fillStyle = rig.body
  ctx.beginPath()
  ctx.ellipse(mx, my, mw * 1.15, mw * 0.62, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = rig.ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const open = clamp(mouth, 0, 1)
  if (open < 0.08) {
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(mx - mw, my + mw * 0.14)
    ctx.quadraticCurveTo(mx, my - mw * 0.36, mx + mw, my + mw * 0.14)
    ctx.stroke()
  } else {
    const hh = mw * (0.14 + open * 0.5)
    ctx.fillStyle = '#1a100c'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(mx - mw, my)
    ctx.quadraticCurveTo(mx, my - mw * 0.22, mx + mw, my)
    ctx.quadraticCurveTo(mx, my + hh, mx - mw, my)
    ctx.fill()
    ctx.stroke()
  }
}

export function drawBoardShadow(ctx: CanvasRenderingContext2D, opts: BoardDrawOpts, pose: BoardPose): void {
  const gy = opts.y + pose.ground
  const feet = [
    { x: pose.footL.x * opts.facing, plant: pose.footL.plant ?? 1 },
    { x: pose.footR.x * opts.facing, plant: pose.footR.plant ?? 1 },
  ]
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (const f of feet) {
    const gx = opts.x + f.x
    const rx = opts.r * (0.28 + f.plant * 0.22)
    const ry = Math.max(2.2, rx * 0.22)
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rx)
    g.addColorStop(0, `rgba(28, 18, 12, ${0.28 + f.plant * 0.32})`)
    g.addColorStop(0.5, `rgba(28, 18, 12, ${0.1 + f.plant * 0.12})`)
    g.addColorStop(1, 'rgba(28, 18, 12, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(gx, gy, rx, ry, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function drawBoardRadish(ctx: CanvasRenderingContext2D, opts: BoardDrawOpts): {
  left: BoardHand
  right: BoardHand
} | null {
  const img = images.get('body')
  if (!img || img.width < 2) return null
  const pose = poseBoardRadish(opts)
  const { w, h, ox, oy, bob } = pose
  const squash = clamp(opts.squash, 0.9, 1.12)
  const teeter = opts.anim.moving ? 0 : Math.sin(opts.anim.t * 2.3) * 0.028
  const lookX = clamp(opts.lookX * opts.facing, -1, 1)
  const lookY = clamp(opts.lookY * 0.55, -1, 1)
  const idleTalk = !opts.anim.moving && Math.sin(opts.anim.t * 1.15) > 0.35 ? (Math.sin(opts.anim.t * 11) * 0.5 + 0.5) * 0.22 : 0
  const mouth = clamp(Math.max(opts.mouth, idleTalk), 0, 1)

  ctx.save()
  ctx.translate(opts.x, opts.y)
  ctx.rotate(teeter + pose.lean * opts.facing)
  ctx.scale(opts.facing, 1)
  ctx.globalAlpha = opts.alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const backL = pose.footL.x < pose.footR.x
  const legs = backL
    ? ([
        [pose.hipL, pose.footL],
        [pose.hipR, pose.footR],
      ] as const)
    : ([
        [pose.hipR, pose.footR],
        [pose.hipL, pose.footL],
      ] as const)
  const legW = Math.max(2.8, opts.r * 0.13)
  for (const [hip, foot] of legs) {
    strokeLimb(ctx, hip.x, hip.y, foot.midX, foot.midY, legW, rig.limb, rig.ink)
    strokeLimb(ctx, foot.midX, foot.midY, foot.x, foot.y, legW * 0.9, rig.limb, rig.ink)
    const toe = (1 - (foot.plant ?? 1)) * 0.45
    paintFoot(ctx, foot.x, foot.y, opts.r * 0.1, toe)
  }

  ctx.save()
  ctx.translate(0, bob)
  ctx.scale(squash, 1 / squash)
  ctx.drawImage(img, ox, oy, w, h)
  ctx.restore()

  coverAndPaintFace(ctx, pose, bob, lookX, lookY, opts.blink, mouth)

  const arms = pose.left.x < pose.right.x
    ? ([
        [pose.shL, pose.left],
        [pose.shR, pose.right],
      ] as const)
    : ([
        [pose.shR, pose.right],
        [pose.shL, pose.left],
      ] as const)
  const armW = Math.max(2.6, opts.r * 0.125)
  for (const [sh, hand] of arms) {
    strokeLimb(ctx, sh.x, sh.y, hand.midX, hand.midY, armW, rig.limb, rig.ink)
    strokeLimb(ctx, hand.midX, hand.midY, hand.x, hand.y, armW * 0.92, rig.limb, rig.ink)
    paintFist(ctx, hand.x, hand.y, opts.r * 0.1)
  }

  ctx.restore()

  return {
    left: worldHand(opts.x, opts.y, opts.facing, pose.left),
    right: worldHand(opts.x, opts.y, opts.facing, pose.right),
  }
}

export function paintBoardPortrait(ctx: CanvasRenderingContext2D, size: number): boolean {
  const img = images.get('portrait')
  if (!img || img.width < 2) return false
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.46, 0, TAU)
  ctx.clip()
  ctx.fillStyle = 'rgba(247, 241, 226, 0.95)'
  ctx.fill()
  const maxH = size * 0.92
  const maxW = size * 0.72
  const scale = Math.min(maxW / img.width, maxH / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -dw / 2, -dh * 0.46, dw, dh)
  ctx.restore()
  return true
}
