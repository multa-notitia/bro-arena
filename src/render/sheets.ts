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
 *   fx-ink, pickups, prop-furrow, prop-bed, ground-garden
 *
 * The JSON is the animation. This player does not invent frame order, fps,
 * squash curves, or VFX sequences — it steps the clip data exactly.
 *
 * Frame `i` is a cell in row-major order using the JSON `columns`. Atlases are
 * not assumed square and are not assumed to be 1024 wide: spitter, charger
 * and the elite pea are 2048×1024.
 *
 * `event` / `events` fire once when the playhead enters the cell.
 * Gameplay (shots, dashes, slams) reads those events from `advanceActorSheet`
 * during the sim step. `drawActorSheet` only paints the frame the sim landed on.
 */
import { clamp } from '../core/math.ts'
import type { AnimState, EnemyKind, Form, ModelDir, Species } from '../core/types.ts'

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
  /** Grid columns from the JSON. Cell i → col = i % columns, row = floor(i / columns). */
  columns: number
  anchor: SheetAnchor
  clips: Record<string, SheetClip>
  image2x?: string
  pngFallback?: string
}

export interface LoadedSheet {
  id: string
  img: HTMLImageElement
  img2x?: HTMLImageElement
  manifest: SheetManifest
  columns: number
}

const BASE = '/sprites'

/** Actor sheets plus the fx, pickup and prop sheets the sim and the world draw. */
export const SHEET_PRELOAD: string[] = [
  'player-radish',
  'player-potato',
  'player-carrot',
  'player-chili',
  'enemy-blob',
  'enemy-charger',
  'enemy-spitter',
  'enemy-eliteBlob',
  'enemy-blob-light',
  'enemy-blob-mud',
  'enemy-charger-light',
  'enemy-charger-mud',
  'enemy-spitter-light',
  'enemy-spitter-mud',
  'enemy-beetle-light',
  'enemy-beetle-mud',
  'enemy-shroom-light',
  'enemy-shroom-mud',
  'fx-ink',
  'pickups',
  'prop-furrow',
  'prop-bed',
]

const cache = new Map<string, LoadedSheet>()
const missing = new Set<string>()
const inflight = new Map<string, Promise<LoadedSheet | null>>()

interface ClipHead {
  elapsed: number
  index: number
  duration: number
  loop: boolean
}

interface ActorHead {
  clip: string
  clips: Map<string, ClipHead>
}

const heads = new Map<string, ActorHead>()
const warned = new Set<string>()

interface InkBurst {
  clip: string
  elapsed: number
  duration: number
  x: number
  y: number
  angle: number
  scale: number
  rotate: boolean
}

const inkBursts: InkBurst[] = []
const INK_CAP = 48

const ground: { lo: HTMLImageElement | null; hi: HTMLImageElement | null } = { lo: null, hi: null }

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
    for (const e of list) if (typeof e === 'string' && e && !out.includes(e)) out.push(e)
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
  const columns = typeof o.columns === 'number' && o.columns > 0 ? Math.floor(o.columns) : 0
  const defaultMs = num(o.ms ?? o.durationMs, 100)
  const src = o.clips && typeof o.clips === 'object' ? (o.clips as Record<string, unknown>) : null
  if (!src) return null
  const clips: Record<string, SheetClip> = {}
  const grid = columns > 0 ? columns : 8
  for (const name of Object.keys(src)) {
    const clip = parseClip(src[name], grid, defaultMs)
    if (clip) clips[name] = clip
  }
  if (!Object.keys(clips).length) return null
  const meta = o.meta && typeof o.meta === 'object' ? (o.meta as Record<string, unknown>) : null
  const image2x = meta && typeof meta.image2x === 'string' ? meta.image2x : undefined
  const pngFallback = meta && typeof meta.pngFallback === 'string' ? meta.pngFallback : undefined
  return {
    image: o.image,
    frameWidth: o.frameWidth,
    frameHeight: o.frameHeight,
    columns,
    anchor: parseAnchor(o.anchor, { x: 0.5, y: 0.88 }),
    clips,
    image2x,
    pngFallback,
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

async function loadImageWithFallback(file: string, fallback?: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(imageUrl(file))
  } catch (err) {
    if (!fallback || fallback === file) throw err
    return loadImage(imageUrl(fallback))
  }
}

/**
 * Columns come from the JSON. Only when a manifest omits them do we derive the
 * count from the bitmap's real width — never from a 1024-wide or square guess.
 */
function columnsFor(manifest: SheetManifest, img: HTMLImageElement): number {
  if (manifest.columns > 0) return manifest.columns
  return Math.max(1, Math.floor(img.naturalWidth / manifest.frameWidth))
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
    const img = await loadImageWithFallback(manifest.image, manifest.pngFallback)
    let img2x: HTMLImageElement | undefined
    if (manifest.image2x) {
      const png2 = manifest.image2x.replace(/\.webp$/i, '.png')
      try {
        img2x = await loadImageWithFallback(manifest.image2x, png2 !== manifest.image2x ? png2 : undefined)
      } catch {
        img2x = undefined
      }
    }
    const columns = columnsFor(manifest, img)
    manifest.columns = columns
    const loaded: LoadedSheet = { id, img, img2x, manifest, columns }
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

async function loadGround(): Promise<void> {
  try {
    ground.lo = await loadImageWithFallback('ground-garden.webp', 'ground-garden.png')
  } catch {
    ground.lo = null
  }
  try {
    ground.hi = await loadImage(imageUrl('ground-garden@2x.png'))
  } catch {
    ground.hi = null
  }
}

export function sheetKeysForPlayer(species: Species, model?: ModelDir): string[] {
  const keys: string[] = []
  if (model) keys.push(`player-${species}-${model}`)
  keys.push(`player-${species}`)
  return keys
}

export function sheetKeysForEnemy(kind: EnemyKind, form: Form): string[] {
  const keys = [`enemy-${kind}-${form}`, `enemy-${kind}`]
  // Garlic (wisp) spits too. The worm sheet is the shooter; reuse it when no enemy-wisp file exists.
  if (kind === 'wisp') keys.push('enemy-spitter')
  return keys
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

export function sheetById(id: string): LoadedSheet | null {
  return resolveSheet([id])
}

/** Painted garden tile. `@2x` when the caller is on a dense viewport. */
export function gardenGround(hi: boolean): HTMLImageElement | null {
  if (hi && ground.hi) return ground.hi
  return ground.lo
}

export function chooseClip(
  sheet: LoadedSheet,
  opts: { dead?: boolean; hurt?: boolean; attacking?: boolean; moving?: boolean },
): string | null {
  const clips = sheet.manifest.clips
  const want: string[] = []
  if (opts.dead) want.push('death')
  if (opts.hurt) want.push('hurt')
  if (opts.attacking) want.push('attack')
  if (opts.moving) want.push('walk')
  want.push('idle', 'walk')
  for (const name of want) if (clips[name]) return name
  return null
}

export function pickClip(
  sheet: LoadedSheet,
  anim: AnimState,
  opts: { swinging?: boolean; attacking?: boolean; hurt?: boolean } = {},
): string | null {
  return chooseClip(sheet, {
    dead: anim.deathT >= 0,
    hurt: opts.hurt ?? false,
    attacking: !!(opts.attacking || opts.swinging),
    moving: anim.moving,
  })
}

function snapScale(s: number): number {
  return Math.max(0.25, Math.round(s * 2) / 2)
}

function clipDurationMs(clip: SheetClip): number {
  let total = 0
  for (const f of clip.frames) total += f.ms
  return total
}

export function sheetClipSeconds(sheet: LoadedSheet, name: string): number {
  const clip = sheet.manifest.clips[name]
  if (!clip) return 0
  return clipDurationMs(clip) / 1000
}

export function clipHasEvent(sheet: LoadedSheet, name: string, event: string): boolean {
  const clip = sheet.manifest.clips[name]
  if (!clip) return false
  for (const f of clip.frames) if (f.events.includes(event)) return true
  return false
}

interface Located {
  index: number
  start: number
  frame: SheetFrame
}

/** Frame index in clip order (the index `body_track` uses), not the cell index. */
export function actorClipFrame(
  playKey: string,
  sheet: LoadedSheet,
  clipName: string,
): { index: number; frame: SheetFrame } | null {
  const clip = sheet.manifest.clips[clipName]
  if (!clip || !clip.frames.length) return null
  const elapsed = heads.get(playKey)?.clips.get(clipName)?.elapsed ?? 0
  const at = locate(clip, elapsed)
  return { index: at.index, frame: at.frame }
}

function locate(clip: SheetClip, elapsed: number): Located {
  const frames = clip.frames
  const n = frames.length
  const empty: SheetFrame = { i: 0, ms: 1, scaleX: 1, scaleY: 1, ox: 0, oy: 0, events: [] }
  if (n === 0) return { index: 0, start: 0, frame: empty }
  const dur = clipDurationMs(clip)
  let local = elapsed
  if (clip.loop && dur > 0) local = elapsed % dur
  else if (local >= dur) local = Math.max(0, dur - 0.001)
  let t = 0
  for (let i = 0; i < n; i++) {
    const f = frames[i]!
    if (local < t + f.ms || i === n - 1) return { index: i, start: t, frame: f }
    t += f.ms
  }
  const last = frames[n - 1]!
  return { index: n - 1, start: dur - last.ms, frame: last }
}

function actor(playKey: string): ActorHead {
  let head = heads.get(playKey)
  if (!head) {
    head = { clip: '', clips: new Map() }
    heads.set(playKey, head)
  }
  return head
}

function bindClip(head: ActorHead, name: string, clip: SheetClip): ClipHead {
  let slot = head.clips.get(name)
  if (!slot) {
    slot = { elapsed: 0, index: -1, duration: clipDurationMs(clip), loop: clip.loop }
    head.clips.set(name, slot)
  }
  slot.loop = clip.loop
  slot.duration = clipDurationMs(clip)
  head.clip = name
  return slot
}

/** Start this clip over so its first frame (and its events) play again. */
export function restartActorClip(playKey: string, clipName: string): void {
  const head = actor(playKey)
  head.clip = clipName
  const slot = head.clips.get(clipName)
  if (slot) {
    slot.elapsed = 0
    slot.index = -1
  } else {
    head.clips.set(clipName, { elapsed: 0, index: -1, duration: 0, loop: false })
  }
}

export function forgetActor(playKey: string): void {
  heads.delete(playKey)
}

/** 0 at the first cell, 1 when the clip has played out. */
export function actorClipFraction(playKey: string, clipName: string): number {
  const slot = heads.get(playKey)?.clips.get(clipName)
  if (!slot || slot.duration <= 0) return 0
  return Math.min(1, slot.elapsed / slot.duration)
}

export function actorClipDone(playKey: string, clipName?: string): boolean {
  const head = heads.get(playKey)
  if (!head) return false
  const name = clipName || head.clip
  const slot = head.clips.get(name)
  if (!slot || slot.loop || slot.duration <= 0) return false
  return slot.elapsed + 0.01 >= slot.duration
}

/** True while a non-looping clip is still inside its authored frames. */
export function actorClipActive(playKey: string, clipName: string): boolean {
  const slot = heads.get(playKey)?.clips.get(clipName)
  if (!slot || slot.loop || slot.duration <= 0) return false
  return slot.elapsed + 0.5 < slot.duration
}

const hurtKicks = new Set<string>()

/** A new hit should replay the short authored hurt clip, including its cream flash frame. */
export function kickHurtClip(playKey: string): void {
  hurtKicks.add(playKey)
}

/** Death owns the body. Drop a pending hurt replay and the cream hurt cell. */
export function clearHurtState(playKey: string): void {
  hurtKicks.delete(playKey)
  heads.get(playKey)?.clips.delete('hurt')
}

export function consumeHurtKick(playKey: string): boolean {
  return hurtKicks.delete(playKey)
}

let playerRelease = false

export function notePlayerRelease(): void {
  playerRelease = true
}

export function takePlayerRelease(): boolean {
  const v = playerRelease
  playerRelease = false
  return v
}

/** World-px width of the painted body. Shadows stay inside this. */
export function actorFootprint(sheet: LoadedSheet, r: number): number {
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  const fit = snapScale((r * 2.35) / Math.max(fw, fh))
  return fw * fit * 0.62
}

/**
 * Step a clip by `dt` seconds and return every event whose frame was entered,
 * including frames a long step skipped. Looping clips keep their phase when
 * you come back to them; call `restartActorClip` to swing again from the top.
 */
export function advanceActorSheet(playKey: string, sheet: LoadedSheet, clipName: string, dt: number): string[] {
  const clip = sheet.manifest.clips[clipName]
  if (!clip || !clip.frames.length) return []
  const slot = bindClip(actor(playKey), clipName, clip)
  const dur = slot.duration
  if (dur <= 0) return []
  let left = Math.max(0, dt) * 1000
  if (!slot.loop) left = Math.min(left, Math.max(0, dur - slot.elapsed))
  const events: string[] = []
  let guard = 0
  while (left > 0.01 && guard++ < 48) {
    const local = slot.loop ? slot.elapsed % dur : Math.min(slot.elapsed, dur - 0.001)
    const at = locate(clip, local)
    if (at.index !== slot.index) {
      slot.index = at.index
      if (at.frame.events.length) events.push(...at.frame.events)
    }
    const into = local - at.start
    const remain = Math.max(0.01, at.frame.ms - into)
    const step = Math.min(remain, left)
    slot.elapsed += step
    left -= step
    if (slot.loop && slot.elapsed >= dur) {
      slot.elapsed -= dur
      slot.index = -1
    }
    if (step <= 0) break
  }
  return events
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  clip: SheetClip,
  frame: SheetFrame,
  opts: { fit: number; facing: 1 | -1; alpha: number },
): void {
  const { img, columns } = sheet
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  const col = frame.i % columns
  const row = Math.floor(frame.i / columns)
  const sx = col * fw
  const sy = row * fh
  if (sx + fw > img.naturalWidth + 0.5 || sy + fh > img.naturalHeight + 0.5) {
    const key = `${sheet.id}:${frame.i}`
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(
        `sheet ${sheet.id} cell ${frame.i} is outside ${img.naturalWidth}×${img.naturalHeight} (columns ${columns})`,
      )
    }
    return
  }
  const anchor = clip.anchor ?? sheet.manifest.anchor
  const ax = anchor.x * fw
  const ay = anchor.y * fh
  ctx.save()
  ctx.globalAlpha *= opts.alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(frame.ox * opts.facing, frame.oy)
  ctx.scale(opts.facing * opts.fit * frame.scaleX, opts.fit * frame.scaleY)
  ctx.drawImage(img, sx, sy, fw, fh, -ax, -ay, fw, fh)
  ctx.restore()
}

/** Paint the frame `advanceActorSheet` has already stepped. Does not move the playhead. */
export function drawActorSheet(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  playKey: string,
  clipName: string,
  opts: { r: number; facing: 1 | -1; alpha: number },
): void {
  const clip = sheet.manifest.clips[clipName]
  if (!clip || !clip.frames.length) return
  const slot = actor(playKey).clips.get(clipName)
  const elapsed = slot?.elapsed ?? 0
  const { frame } = locate(clip, elapsed)
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  const fit = snapScale((opts.r * 2.35) / Math.max(fw, fh))
  paintFrame(ctx, sheet, clip, frame, { fit, facing: opts.facing, alpha: opts.alpha })
}

/**
 * Step and paint a clip by name. Used for sheets whose clip names are not the
 * actor set (pickups: coin, heart, chest, …). `scale` is world px per image px.
 */
export function drawNamedClip(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  playKey: string,
  clipName: string,
  dt: number,
  opts: { scale: number; facing?: 1 | -1; alpha?: number },
): boolean {
  const clip = sheet.manifest.clips[clipName]
  if (!clip) return false
  advanceActorSheet(playKey, sheet, clipName, dt)
  const slot = actor(playKey).clips.get(clipName)
  const { frame } = locate(clip, slot?.elapsed ?? 0)
  paintFrame(ctx, sheet, clip, frame, {
    fit: opts.scale,
    facing: opts.facing ?? 1,
    alpha: opts.alpha ?? 1,
  })
  return true
}

/** Static prop. `width` is world px; height keeps the bitmap aspect. `@2x` when `hi`. */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  opts?: { width?: number; hi?: boolean },
): boolean {
  const sheet = resolveSheet([id])
  if (!sheet) return false
  const img = opts?.hi && sheet.img2x ? sheet.img2x : sheet.img
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  const w = opts?.width ?? fw
  const h = fh * (w / fw)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
  ctx.restore()
  return true
}

export function spawnInkClip(
  name: string,
  x: number,
  y: number,
  opts?: { angle?: number; scale?: number; rotate?: boolean },
): boolean {
  const sheet = resolveSheet(['fx-ink'])
  const clip = sheet?.manifest.clips[name]
  if (!sheet || !clip) return false
  if (inkBursts.length >= INK_CAP) inkBursts.shift()
  inkBursts.push({
    clip: name,
    elapsed: 0,
    duration: clipDurationMs(clip),
    x,
    y,
    angle: opts?.angle ?? 0,
    scale: opts?.scale ?? 0.36,
    rotate: !!opts?.rotate,
  })
  return true
}

export function tickInkClips(dt: number): void {
  const step = Math.max(0, dt) * 1000
  for (let i = inkBursts.length - 1; i >= 0; i--) {
    const b = inkBursts[i]
    if (!b) continue
    b.elapsed += step
    if (b.elapsed >= b.duration) inkBursts.splice(i, 1)
  }
}

export function drawInkClips(ctx: CanvasRenderingContext2D): void {
  const sheet = cache.get('fx-ink')
  if (!sheet || inkBursts.length === 0) return
  for (const b of inkBursts) {
    const clip = sheet.manifest.clips[b.clip]
    if (!clip) continue
    const { frame } = locate(clip, b.elapsed)
    const fw = sheet.manifest.frameWidth
    const fh = sheet.manifest.frameHeight
    const col = frame.i % sheet.columns
    const row = Math.floor(frame.i / sheet.columns)
    const anchor = clip.anchor ?? sheet.manifest.anchor
    ctx.save()
    ctx.translate(b.x, b.y)
    if (b.rotate) ctx.rotate(b.angle)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.scale(b.scale, b.scale)
    ctx.drawImage(
      sheet.img,
      col * fw,
      row * fh,
      fw,
      fh,
      -anchor.x * fw,
      -anchor.y * fh,
      fw,
      fh,
    )
    ctx.restore()
  }
}

export function resetSheetPlayback(): void {
  heads.clear()
  inkBursts.length = 0
}

export function isSpriteSheetsReady(): boolean {
  return bootDone
}

/** Load a sheet whose images sit next to the JSON, not under `/sprites/<id>`. */
export function loadSheetAt(jsonUrl: string, id: string): Promise<LoadedSheet | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null)
  let pending = inflight.get(id)
  if (pending) return pending
  pending = (async () => {
    try {
      const res = await fetch(jsonUrl)
      if (!res.ok) return null
      const manifest = parseManifest(await res.json())
      if (!manifest) return null
      const dir = jsonUrl.slice(0, jsonUrl.lastIndexOf('/') + 1)
      let img: HTMLImageElement
      try {
        img = await loadImage(dir + manifest.image)
      } catch (err) {
        if (!manifest.pngFallback) throw err
        img = await loadImage(dir + manifest.pngFallback)
      }
      const columns = columnsFor(manifest, img)
      manifest.columns = columns
      const loaded: LoadedSheet = { id, img, manifest, columns }
      cache.set(id, loaded)
      return loaded
    } catch {
      return null
    }
  })().finally(() => inflight.delete(id))
  inflight.set(id, pending)
  return pending
}

export function preloadSpriteSheets(): Promise<void> {
  if (bootDone) return Promise.resolve()
  const ids = [...new Set(SHEET_PRELOAD)]
  return Promise.all([loadGround(), ...ids.map((id) => requestSheet(id))]).then(() => {
    bootDone = true
  })
}
