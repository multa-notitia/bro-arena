/**
 * Concept A painted sprites. The watercolor is the in-game graphic —
 * cut from the concept sheet, not a procedural redraw.
 */
import { TAU, clamp } from '../core/math.ts'
import type { AnimState } from '../core/types.ts'
import atlasJson from '../assets/concept-a/chili-atlas.json' with { type: 'json' }
import chiliIdleSmile from '../assets/concept-a/chili-idle-smile.png'
import chiliIdleTeeter from '../assets/concept-a/chili-idle-teeter.png'
import chiliIdleSmirk from '../assets/concept-a/chili-idle-smirk.png'
import chiliWalk0 from '../assets/concept-a/chili-walk-0.png'
import chiliWalk1 from '../assets/concept-a/chili-walk-1.png'
import chiliWalk2 from '../assets/concept-a/chili-walk-2.png'
import chiliPortrait from '../assets/concept-a/chili-portrait.png'

type FrameName = 'idle-smile' | 'idle-teeter' | 'idle-smirk' | 'walk-0' | 'walk-1' | 'walk-2' | 'portrait'

interface EyeMark {
  cx: number
  cy: number
  rx: number
  ry: number
}

interface MouthMark {
  cx: number
  cy: number
  rw: number
  rh: number
}

interface FrameMeta {
  file: string
  w: number
  h: number
  eyes: EyeMark[]
  mouth: MouthMark | null
}

interface Atlas {
  frames: Record<string, FrameMeta>
  idleCycle: FrameName[]
  walkCycle: FrameName[]
  hit: FrameName
}

const atlas = atlasJson as Atlas

const FRAME_URLS: Record<FrameName, string> = {
  'idle-smile': chiliIdleSmile,
  'idle-teeter': chiliIdleTeeter,
  'idle-smirk': chiliIdleSmirk,
  'walk-0': chiliWalk0,
  'walk-1': chiliWalk1,
  'walk-2': chiliWalk2,
  portrait: chiliPortrait,
}

const images = new Map<FrameName, HTMLImageElement>()
let ready = false
let loadPromise: Promise<void> | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Concept A sprite failed: ${url}`))
    img.src = url
  })
}

export function isConceptAReady(): boolean {
  return ready
}

export function preloadConceptA(): Promise<void> {
  if (ready) return Promise.resolve()
  if (loadPromise) return loadPromise
  const names = Object.keys(FRAME_URLS) as FrameName[]
  loadPromise = Promise.all(names.map((name) => loadImage(FRAME_URLS[name]).then((img) => images.set(name, img))))
    .then(() => {
      ready = true
    })
    .catch((err) => {
      loadPromise = null
      throw err
    })
  return loadPromise
}

function frameImage(name: FrameName): HTMLImageElement | null {
  return images.get(name) ?? null
}

export function pickChiliFrame(anim: AnimState): FrameName {
  if (anim.hitFlash > 0.22 || anim.mouth > 0.48) return atlas.hit
  if (anim.moving) {
    const cycle = atlas.walkCycle
    // 0-1-2-1 ping-pong so the painted squash/stretch reads as a step.
    const stepped = [cycle[0], cycle[1], cycle[2], cycle[1]] as FrameName[]
    const i = Math.floor((anim.gait % 1) * stepped.length)
    return stepped[i] ?? cycle[0] ?? 'walk-0'
  }
  const u = (Math.sin(anim.t * 2.35) + 1) / 2
  return u < 0.55 ? 'idle-smile' : 'idle-teeter'
}

export interface PaintedDrawOpts {
  x: number
  y: number
  r: number
  facing: 1 | -1
  squash: number
  alpha: number
  blink: number
  anim: AnimState
}

/**
 * Blit the concept chili, feet on the ground, stem up. Optional lid composite
 * over the painted eye whites. Does not redraw the vegetable.
 */
export function drawPaintedChili(ctx: CanvasRenderingContext2D, opts: PaintedDrawOpts): FrameName | null {
  const name = pickChiliFrame(opts.anim)
  const img = frameImage(name)
  if (!img || img.width < 2) return null
  const meta = atlas.frames[name]
  const aspect = img.width / img.height
  const h = opts.r * 3.55
  const w = h * aspect
  const squash = clamp(opts.squash, 0.82, 1.22)
  const walkStretch = opts.anim.moving ? 1 + Math.sin(opts.anim.gait * TAU) * 0.045 : 1
  const sx = squash * walkStretch
  const sy = walkStretch / squash

  ctx.save()
  ctx.translate(opts.x, opts.y)
  ctx.scale(opts.facing, 1)
  ctx.scale(sx, sy)
  ctx.globalAlpha = opts.alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const ox = -w / 2
  const oy = -h * 0.58
  ctx.drawImage(img, ox, oy, w, h)
  if (opts.blink >= 0 && meta?.eyes.length) {
    paintLids(ctx, meta.eyes, w, h, ox, oy, opts.blink)
  }
  ctx.restore()
  return name
}

function paintLids(
  ctx: CanvasRenderingContext2D,
  eyes: EyeMark[],
  w: number,
  h: number,
  ox: number,
  oy: number,
  blink: number,
): void {
  const closed = blink < 0.5 ? blink * 2 : (1 - blink) * 2
  if (closed < 0.08) return
  ctx.save()
  ctx.fillStyle = '#c53628'
  for (const eye of eyes) {
    const cx = ox + eye.cx * w
    const cy = oy + eye.cy * h
    const rx = eye.rx * w * 1.05
    const ry = Math.max(1.2, eye.ry * h * (0.35 + closed * 1.35))
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function paintConceptAPortrait(ctx: CanvasRenderingContext2D, size: number): boolean {
  const img = frameImage('portrait')
  if (!img || img.width < 2) return false
  const s = size
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.46, 0, TAU)
  ctx.clip()
  ctx.fillStyle = 'rgba(247, 241, 226, 0.95)'
  ctx.fill()
  const maxH = s * 0.9
  const maxW = s * 0.78
  const scale = Math.min(maxW / img.width, maxH / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -dw / 2, -dh * 0.46, dw, dh)
  ctx.restore()
  return true
}
