/**
 * Painted ground decals, baked once per bed (and per outskirts tile) so a
 * frame is a handful of blits under the furrows, hedges, and actors.
 */
import { BEDS, type BedId } from '../data/beds.ts'
import { bedAt, scatterDecals, type GroundDecal } from '../data/groundScatter.ts'
import { clipDrawScale, drawNamedClip, resolveSheet } from './sheets.ts'

const PAD = 160
const OUT_TILE = 512
const SHEET = 'props-ground-decals'

interface Bake {
  canvas: HTMLCanvasElement
  x: number
  y: number
  w: number
  h: number
}

let baked: Bake[] | null = null
let bakedFor = 0

function paintOne(
  ctx: CanvasRenderingContext2D,
  sheet: NonNullable<ReturnType<typeof resolveSheet>>,
  mark: GroundDecal,
  originX: number,
  originY: number,
): void {
  const clip = sheet.manifest.clips[mark.name]
  if (!clip) return
  ctx.save()
  ctx.translate(mark.x - originX, mark.y - originY)
  ctx.rotate(mark.rot)
  if (mark.flipX || mark.flipY) ctx.scale(mark.flipX ? -1 : 1, mark.flipY ? -1 : 1)
  ctx.globalAlpha = mark.alpha
  drawNamedClip(ctx, sheet, `ground-decal:${mark.name}`, mark.name, 0, {
    scale: mark.scale * clipDrawScale(sheet, mark.name),
  })
  ctx.restore()
}

function bakeList(sheet: NonNullable<ReturnType<typeof resolveSheet>>, marks: GroundDecal[], x: number, y: number, w: number, h: number): Bake | null {
  if (!marks.length || w < 2 || h < 2) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w)
  canvas.height = Math.ceil(h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const mark of marks) paintOne(ctx, sheet, mark, x, y)
  return { canvas, x, y, w: canvas.width, h: canvas.height }
}

function regionOf(mark: GroundDecal): BedId | '-' {
  return bedAt(mark.x, mark.y) ?? '-'
}

function buildBakes(sheet: NonNullable<ReturnType<typeof resolveSheet>>): Bake[] {
  const marks = scatterDecals()
  const byBed = new Map<BedId | '-', GroundDecal[]>()
  for (const mark of marks) {
    const id = regionOf(mark)
    const list = byBed.get(id)
    if (list) list.push(mark)
    else byBed.set(id, [mark])
  }
  const out: Bake[] = []
  const outside = byBed.get('-') ?? []
  const tiles = new Map<string, GroundDecal[]>()
  for (const mark of outside) {
    const tx = Math.floor(mark.x / OUT_TILE)
    const ty = Math.floor(mark.y / OUT_TILE)
    const key = `${tx}:${ty}`
    const list = tiles.get(key)
    if (list) list.push(mark)
    else tiles.set(key, [mark])
  }
  for (const [key, list] of tiles) {
    const [tx, ty] = key.split(':').map((part) => Number(part))
    if (tx === undefined || ty === undefined) continue
    const x = tx * OUT_TILE - PAD
    const y = ty * OUT_TILE - PAD
    const bake = bakeList(sheet, list, x, y, OUT_TILE + PAD * 2, OUT_TILE + PAD * 2)
    if (bake) out.push(bake)
  }
  for (const bed of BEDS) {
    const list = byBed.get(bed.id)
    if (!list) continue
    const x = bed.x - PAD
    const y = bed.y - PAD
    const bake = bakeList(sheet, list, x, y, bed.w + PAD * 2, bed.h + PAD * 2)
    if (bake) out.push(bake)
  }
  return out
}

/** Ground tiles already drawn. Furrows, shade, and actors come after this. */
export function drawGroundDecals(
  ctx: CanvasRenderingContext2D,
  viewL: number,
  viewT: number,
  viewW: number,
  viewH: number,
): void {
  const sheet = resolveSheet([SHEET])
  if (!sheet || sheet.img.naturalWidth < 1) return
  const stamp = sheet.img.naturalWidth + sheet.img.naturalHeight * 4096
  if (!baked || bakedFor !== stamp) {
    baked = buildBakes(sheet)
    bakedFor = stamp
  }
  const x1 = viewL + viewW
  const y1 = viewT + viewH
  ctx.save()
  ctx.imageSmoothingEnabled = true
  for (const bake of baked) {
    if (bake.x > x1 || bake.y > y1 || bake.x + bake.w < viewL || bake.y + bake.h < viewT) continue
    ctx.drawImage(bake.canvas, bake.x, bake.y)
  }
  ctx.restore()
}
