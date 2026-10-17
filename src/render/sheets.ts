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
 *
 * The JSON is the animation. This player does not invent frame order, fps,
 * squash curves, or VFX sequences — it steps the clip data exactly.
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

export type ClipName = 'idle' | 'walk' | 'hurt' | 'attack' | 'death'

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
const CLIP_NAMES: ClipName[] = ['idle', 'walk', 'hurt', 'attack', 'death']

/** Extra ids to fetch during boot. */
export const SHEET_PRELOAD: string[] = []

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
  for (const name of CLIP_NAMES) {
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
    if (!missing.has(id) && !cache.has(id)) void requestSheet(id)
  }
  return null
}

export function pickClip(
  sheet: LoadedSheet,
  anim: AnimState,
  opts: { swinging?: boolean } = {},
): ClipName | null {
  const clips = sheet.manifest.clips
  const want: ClipName[] = []
  if (anim.deathT >= 0) want.push('death')
  if (anim.hitFlash > 0.35) want.push('hurt')
  if (opts.swinging) want.push('attack')
  if (anim.moving) want.push('walk')
  want.push('idle', 'walk')
  for (const name of want) if (clips[name]) return name
  return null
}

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

export function resetSheetPlayback(): void {
  heads.clear()
}

export function drawActorSheet(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  playKey: string,
  clipName: ClipName,
  dt: number,
  opts: { r: number; facing: 1 | -1; alpha: number },
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
  const fit = snapScale((opts.r * 2.35) / Math.max(fw, fh))

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
