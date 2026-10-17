/**
 * PNG/WebP sprite sheets + authored animation JSON.
 *
 * Drop-in files (first matching id wins; missing files fall back to Board /
 * Painted / procedural art):
 *
 *   public/sprites/<id>.json
 *   public/sprites/<id>.webp  (or .png — named by the JSON `image` field)
 *
 * Ids:
 *   player-<species>-<model>   e.g. player-chili-board
 *   player-<species>           e.g. player-chili
 *   enemy-<kind>-<form>        e.g. enemy-blob-nightmare
 *   enemy-<kind>               e.g. enemy-blob
 *   fx-ink, pickups, prop-furrow, prop-bed
 *
 * The JSON is the animation. This player does not invent frame order, fps,
 * squash curves, or VFX sequences — it steps the clip data exactly.
 * Any clip name in the JSON can be played (actors, fx, pickups).
 *
 *   {
 *     "image": "chili.webp",
 *     "frameWidth": 64,
 *     "frameHeight": 64,
 *     "columns": 8,
 *     "anchor": { "x": 0.5, "y": 0.88 },
 *     "clips": {
 *       "idle": {
 *         "loop": true,
 *         "frames": [
 *           { "i": 0, "ms": 140 },
 *           { "i": 1, "ms": 140, "scaleX": 1.04, "scaleY": 0.96, "ox": 0, "oy": -1 }
 *         ]
 *       },
 *       "walk": { "loop": true, "frames": [ { "i": 8, "ms": 80 }, { "i": 9, "ms": 80 } ] },
 *       "hurt": { "loop": false, "frames": [ { "i": 16, "ms": 60, "event": "hit" } ] },
 *       "attack": {
 *         "loop": false,
 *         "anchor": { "x": 0.45, "y": 0.88 },
 *         "frames": [
 *           { "i": 24, "ms": 50 },
 *           { "i": 25, "ms": 40, "event": "hit" },
 *           { "i": 26, "ms": 80, "events": ["spawnFx"] }
 *         ]
 *       },
 *       "death": { "loop": false, "frames": [ { "i": 32, "ms": 90 }, { "i": 33, "ms": 180 } ] }
 *     }
 *   }
 *
 * Frame `i` is a 0-based cell in the grid (left-to-right, top-to-bottom).
 * `col`/`row` also work. `ms` is that cell's duration. `event` / `events`
 * fire once when the playhead enters the cell (`hit`, `spawnFx`, …).
 * Add an id to SHEET_PRELOAD to fetch at boot instead of first draw.
 */
import { clamp } from '../core/math.ts'
import type { AnimState, EnemyKind, Form, ModelDir, Species } from '../core/types.ts'

/** Any clip name authored in the JSON. Actors use idle/walk/hurt/attack/death. */
export type ClipName = string

export interface SheetAnchor {
  x: number
  y: number
}

export interface SheetFrame {
  i: number
  ms: number
  scaleX: number
  scaleY: number
  ox: number
  oy: number
  events: string[]
}

export interface SheetClip {
  loop: boolean
  anchor?: SheetAnchor
  frames: SheetFrame[]
}

export interface SheetManifest {
  image: string
  frameWidth: number
  frameHeight: number
  columns?: number
  anchor: SheetAnchor
  clips: Partial<Record<ClipName, SheetClip>>
}

export interface LoadedSheet {
  id: string
  img: HTMLImageElement
  manifest: SheetManifest
  columns: number
}

const BASE = '/sprites'

/**
 * Shipped sheet ids. resolveSheet only fetches these, so model/form variants
 * that were never painted do not 404 in the console. Add an id here to ship it.
 */
export const SHEET_PRELOAD: string[] = [
  'player-radish',
  'player-potato',
  'player-carrot',
  'player-chili',
  'enemy-blob',
  'enemy-charger',
  'enemy-spitter',
  'enemy-eliteBlob',
  'fx-ink',
  'pickups',
  'prop-furrow',
  'prop-bed',
]

const SHIPPED = new Set(SHEET_PRELOAD)

/**
 * World-pixel fit for fx-ink cells (128px). Not an authored JSON scale —
 * the fx manifest has no game radius. Chosen so the painted bursts read
 * next to heroes at the combat camera.
 */
export const FX_CLIP_FIT: Record<string, number> = {
  muzzle: 0.42,
  hitSpark: 0.34,
  inkBurst: 0.5,
  dust: 0.36,
}

const cache = new Map<string, LoadedSheet>()
const missing = new Set<string>()
const inflight = new Map<string, Promise<LoadedSheet | null>>()

interface Playhead {
  clip: ClipName
  elapsed: number
  index: number
  fired: boolean
}

const heads = new Map<string, Playhead>()
let bootDone = false

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function parseAnchor(raw: unknown, fallback: SheetAnchor): SheetAnchor {
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as { x?: unknown; y?: unknown }
  return { x: clamp(num(o.x, fallback.x), 0, 1), y: clamp(num(o.y, fallback.y), 0, 1) }
}

function parseEvents(frame: Record<string, unknown>): string[] {
  const out: string[] = []
  if (typeof frame.event === 'string' && frame.event) out.push(frame.event)
  const list = frame.events
  if (Array.isArray(list)) {
    for (const e of list) if (typeof e === 'string' && e) out.push(e)
  }
  return out
}

function cellIndex(frame: Record<string, unknown>, columns: number): number | null {
  if (typeof frame.i === 'number' && frame.i >= 0) return Math.floor(frame.i)
  if (typeof frame.index === 'number' && frame.index >= 0) return Math.floor(frame.index)
  const col = typeof frame.col === 'number' ? frame.col : null
  const row = typeof frame.row === 'number' ? frame.row : null
  if (col !== null && row !== null && col >= 0 && row >= 0) return Math.floor(row) * columns + Math.floor(col)
  return null
}

function parseFrame(raw: unknown, defaultMs: number, columns: number): SheetFrame | null {
  if (typeof raw === 'number' && raw >= 0) {
    return { i: Math.floor(raw), ms: defaultMs, scaleX: 1, scaleY: 1, ox: 0, oy: 0, events: [] }
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const i = cellIndex(o, columns)
  if (i === null) return null
  const ms = num(o.ms ?? o.durationMs, defaultMs)
  return {
    i,
    ms: Math.max(1, ms),
    scaleX: num(o.scaleX, 1),
    scaleY: num(o.scaleY, 1),
    ox: num(o.ox ?? o.offsetX, 0),
    oy: num(o.oy ?? o.offsetY, 0),
    events: parseEvents(o),
  }
}

function parseClip(raw: unknown, columns: number, defaultMs: number): SheetClip | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const list = o.frames
  if (!Array.isArray(list) || list.length === 0) return null
  const clipMs = num(o.ms ?? o.durationMs, defaultMs)
  const frames: SheetFrame[] = []
  for (const item of list) {
    const f = parseFrame(item, clipMs, columns)
    if (f) frames.push(f)
  }
  if (!frames.length) return null
  return {
    loop: o.loop !== false,
    anchor: o.anchor ? parseAnchor(o.anchor, { x: 0.5, y: 0.88 }) : undefined,
    frames,
  }
}

function parseManifest(raw: unknown): SheetManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.image !== 'string' || typeof o.frameWidth !== 'number' || typeof o.frameHeight !== 'number') return null
  if (o.frameWidth <= 0 || o.frameHeight <= 0) return null
  const columns = typeof o.columns === 'number' && o.columns > 0 ? o.columns : 8
  const defaultMs = num(o.ms ?? o.durationMs, 100)
  const clips: Partial<Record<ClipName, SheetClip>> = {}
  const src = o.clips && typeof o.clips === 'object' ? (o.clips as Record<string, unknown>) : null
  if (!src) return null
  for (const name of Object.keys(src)) {
    const clip = parseClip(src[name], columns, defaultMs)
    if (clip) clips[name] = clip
  }
  if (!Object.keys(clips).length) return null
  return {
    image: o.image,
    frameWidth: o.frameWidth,
    frameHeight: o.frameHeight,
    columns,
    anchor: parseAnchor(o.anchor, { x: 0.5, y: 0.88 }),
    clips,
  }
}

function imageUrl(file: string): string {
  if (file.startsWith('/') || file.startsWith('http')) return file
  return `${BASE}/${file}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sheet image failed: ${url}`))
    img.src = url
  })
}

async function fetchSheet(id: string): Promise<LoadedSheet | null> {
  if (cache.has(id) || missing.has(id)) return cache.get(id) ?? null
  try {
    const res = await fetch(`${BASE}/${id}.json`)
    if (!res.ok) {
      missing.add(id)
      return null
    }
    const manifest = parseManifest(await res.json())
    if (!manifest) {
      missing.add(id)
      return null
    }
    const img = await loadImage(imageUrl(manifest.image))
    const columns = manifest.columns ?? Math.max(1, Math.floor(img.naturalWidth / manifest.frameWidth))
    const loaded: LoadedSheet = { id, img, manifest, columns }
    cache.set(id, loaded)
    return loaded
  } catch {
    missing.add(id)
    return null
  }
}

function requestSheet(id: string): Promise<LoadedSheet | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null)
  if (missing.has(id)) return Promise.resolve(null)
  let p = inflight.get(id)
  if (!p) {
    p = fetchSheet(id).finally(() => inflight.delete(id))
    inflight.set(id, p)
  }
  return p
}

export function sheetKeysForPlayer(species: Species, model?: ModelDir): string[] {
  const keys: string[] = []
  if (model) keys.push(`player-${species}-${model}`)
  keys.push(`player-${species}`)
  return keys
}

export function sheetKeysForEnemy(kind: EnemyKind, form: Form): string[] {
  return [`enemy-${kind}-${form}`, `enemy-${kind}`]
}

export function resolveSheet(keys: readonly string[]): LoadedSheet | null {
  for (const id of keys) {
    const hit = cache.get(id)
    if (hit) return hit
  }
  for (const id of keys) {
    if (!SHIPPED.has(id)) continue
    if (!missing.has(id) && !cache.has(id)) void requestSheet(id)
  }
  return null
}

/** Authored clip length in seconds, once that sheet has loaded. */
export function sheetClipSeconds(id: string, clip: ClipName): number | null {
  const c = cache.get(id)?.manifest.clips[clip]
  if (!c || !c.frames.length) return null
  let ms = 0
  for (const f of c.frames) ms += f.ms
  return ms / 1000
}

/**
 * Keep a non-looping attack on screen until its authored frames finish.
 * Weapon swing windows are shorter than several attack clips (chili wand
 * swing is 180ms; the painted slash is 255ms). Damage timing stays on the
 * weapon. This only stops the clip from being cut off.
 */
export function attackClipActive(playKey: string, sheet: LoadedSheet): boolean {
  const head = heads.get(playKey)
  if (!head || head.clip !== 'attack') return false
  const clip = sheet.manifest.clips.attack
  if (!clip || clip.loop || clip.frames.length === 0) return false
  let total = 0
  for (const f of clip.frames) total += f.ms
  return head.elapsed < total - 20
}

export function pickClip(
  sheet: LoadedSheet,
  anim: AnimState,
  opts: { swinging?: boolean } = {},
): ClipName | null {
  const clips = sheet.manifest.clips
  const want: string[] = []
  if (anim.deathT >= 0) want.push('death')
  // A started attack runs through its authored frames. A hurt flash used to
  // restart the clip, so the Great Pea telegraph never reached the slam.
  if (opts.swinging) want.push('attack')
  if (anim.hitFlash > 0.28) want.push('hurt')
  if (anim.moving) want.push('walk')
  want.push('idle', 'walk')
  for (const name of want) if (clips[name]) return name
  return null
}

/**
 * Actors were registered so this lands on 0.25. Feet anchors and the oy
 * foot-plant correction in the JSON assume that fit. Do not loosen it;
 * on-screen size is the camera's job.
 */
function snapScale(s: number): number {
  return Math.max(0.25, Math.round(s * 2) / 2)
}

function sampleFrame(clip: SheetClip, elapsed: number): { index: number; frame: SheetFrame } {
  const frames = clip.frames
  const n = frames.length
  if (n === 0) return { index: 0, frame: { i: 0, ms: 1, scaleX: 1, scaleY: 1, ox: 0, oy: 0, events: [] } }
  let total = 0
  for (const f of frames) total += f.ms
  if (total <= 0) return { index: 0, frame: frames[0]! }
  let t = clip.loop ? elapsed % total : Math.min(elapsed, total - 1)
  for (let i = 0; i < n; i++) {
    const f = frames[i]!
    if (t < f.ms || i === n - 1) return { index: i, frame: f }
    t -= f.ms
  }
  return { index: n - 1, frame: frames[n - 1]! }
}

interface LiveClip {
  key: string
  sheetId: string
  clip: string
  x: number
  y: number
  angle: number
  fit: number
  facing: 1 | -1
  age: number
  life: number
}

const liveClips: LiveClip[] = []
let liveSerial = 1
const MAX_LIVE_CLIPS = 48

/** One-shot (or short) world-space clip. Used for fx-ink. Does not invent frames. */
export function spawnSheetClip(
  sheetId: string,
  clip: string,
  x: number,
  y: number,
  opts: { fit?: number; angle?: number; facing?: 1 | -1 } = {},
): void {
  if (!SHIPPED.has(sheetId)) return
  if (missing.has(sheetId)) return
  const sheet = cache.get(sheetId)
  if (!sheet) {
    void requestSheet(sheetId)
    return
  }
  const authored = sheet.manifest.clips[clip]
  if (!authored || !authored.frames.length) return
  let life = 0
  for (const f of authored.frames) life += f.ms
  life = life / 1000 + 0.02
  if (liveClips.length >= MAX_LIVE_CLIPS) liveClips.shift()
  liveClips.push({
    key: `live:${liveSerial++}`,
    sheetId,
    clip,
    x,
    y,
    angle: opts.angle ?? 0,
    fit: opts.fit ?? FX_CLIP_FIT[clip] ?? 0.5,
    facing: opts.facing ?? 1,
    age: 0,
    life,
  })
}

export function drawSpawnedClips(ctx: CanvasRenderingContext2D, dt: number): void {
  const step = Math.max(0, dt)
  let w = 0
  for (let i = 0; i < liveClips.length; i++) {
    const fx = liveClips[i]
    if (!fx) continue
    fx.age += step
    if (fx.age > fx.life) {
      heads.delete(fx.key)
      continue
    }
    const sheet = cache.get(fx.sheetId)
    if (!sheet) continue
    ctx.save()
    ctx.translate(fx.x, fx.y)
    if (fx.angle) ctx.rotate(fx.angle)
    drawActorSheet(ctx, sheet, fx.key, fx.clip, step, {
      r: 1,
      facing: fx.facing,
      alpha: 1,
      fit: fx.fit,
    })
    ctx.restore()
    liveClips[w++] = fx
  }
  liveClips.length = w
}

export function resetSheetPlayback(): void {
  heads.clear()
  liveClips.length = 0
}

export function drawActorSheet(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  playKey: string,
  clipName: ClipName,
  dt: number,
  opts: { r: number; facing: 1 | -1; alpha: number; fit?: number },
): string[] {
  const clip = sheet.manifest.clips[clipName]
  if (!clip || !clip.frames.length) return []

  let head = heads.get(playKey)
  if (!head || head.clip !== clipName) {
    head = { clip: clipName, elapsed: 0, index: -1, fired: false }
    heads.set(playKey, head)
  }
  head.elapsed += Math.max(0, dt) * 1000
  const { index, frame } = sampleFrame(clip, head.elapsed)
  const entered = index !== head.index
  if (entered) {
    head.index = index
    head.fired = false
  }
  const events = entered && !head.fired ? frame.events : []
  if (entered) head.fired = true

  const { manifest, img, columns } = sheet
  const fw = manifest.frameWidth
  const fh = manifest.frameHeight
  const col = frame.i % columns
  const row = Math.floor(frame.i / columns)
  const sx = col * fw
  const sy = row * fh
  if (sx + fw > img.naturalWidth + 0.5 || sy + fh > img.naturalHeight + 0.5) return events

  const anchor = clip.anchor ?? manifest.anchor
  const ax = anchor.x * fw
  const ay = anchor.y * fh
  const fit =
    opts.fit !== undefined && opts.fit > 0
      ? opts.fit
      : snapScale((opts.r * 2.35) / Math.max(fw, fh))

  ctx.save()
  ctx.globalAlpha *= opts.alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(frame.ox * opts.facing, frame.oy)
  ctx.scale(opts.facing * fit * frame.scaleX, fit * frame.scaleY)
  ctx.drawImage(img, sx, sy, fw, fh, -ax, -ay, fw, fh)
  ctx.restore()
  return events
}

export function isSpriteSheetsReady(): boolean {
  return bootDone
}

export function preloadSpriteSheets(): Promise<void> {
  if (bootDone) return Promise.resolve()
  const ids = [...new Set(SHEET_PRELOAD)]
  if (ids.length === 0) {
    bootDone = true
    return Promise.resolve()
  }
  return Promise.all(ids.map((id) => requestSheet(id))).then(() => {
    bootDone = true
  })
}
