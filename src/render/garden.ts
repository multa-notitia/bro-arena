/**
 * Tidy garden floor and the outer wooden fence.
 * Draw order with the paddock: lawn, then this floor (paths, raised beds,
 * furrows, dips), then y-sorted fence, props, and actors.
 * The south run is the low see-through clip. Its alpha is already in the art.
 */
import { FEEL } from '../feel.ts'
import { arenaMap } from '../data/mapMode.ts'
import {
  FENCE_LINES,
  GARDEN_FENCE,
  GARDEN_PROPS,
  PATH_RECTS,
  RAISED_BEDS,
  type GardenMark,
} from '../data/garden.ts'
import { ROWS_DECOR, ROWS_FENCE, ROWS_FENCE_LINES, ROWS_GROUND } from '../data/gardenRows.ts'
import type { BedDepth } from './beds.ts'
import { clipDrawScale, drawNamedClip, drawProp, gardenPathGravel, resolveSheet, type LoadedSheet } from './sheets.ts'

const RAISED_SHEET = 'props-raised-beds'
const FURROW_W = Math.round(613 * FEEL.garden.scale)
const DIP_W = Math.round(118 * FEEL.garden.scale)
const EDGE = 3
const SHADOW = 4

function pieceRect(sheet: LoadedSheet, mark: GardenMark): { x: number; y: number; w: number; h: number } | null {
  if (mark.clipW == null && mark.clipH == null) return null
  const scale = clipDrawScale(sheet, mark.clip)
  const fw = sheet.manifest.frameWidth
  const fh = sheet.manifest.frameHeight
  const anchor = sheet.manifest.clips[mark.clip]?.anchor ?? sheet.manifest.anchor
  const ax = anchor.x * fw * scale
  const ay = anchor.y * fh * scale
  return {
    x: mark.x - ax,
    y: mark.y - ay,
    w: mark.clipW != null ? ax + mark.clipW : fw * scale,
    h: mark.clipH != null ? ay + mark.clipH : fh * scale,
  }
}

function paintMark(ctx: CanvasRenderingContext2D, mark: GardenMark, key: string): void {
  const sheet = resolveSheet([mark.sheet])
  if (!sheet?.manifest.clips[mark.clip]) return
  const rect = pieceRect(sheet, mark)
  ctx.save()
  if (rect && rect.w > 0.5 && rect.h > 0.5) {
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
  }
  ctx.translate(mark.x, mark.y)
  if (mark.rot) ctx.rotate((mark.rot * Math.PI) / 180)
  drawNamedClip(ctx, sheet, key, mark.clip, 0, {
    scale: clipDrawScale(sheet, mark.clip),
    facing: mark.flipX ? -1 : 1,
  })
  ctx.restore()
}

function seen(x: number, y: number, viewL: number, viewT: number, viewR: number, viewB: number, pad: number): boolean {
  return x >= viewL - pad && x <= viewR + pad && y >= viewT - pad && y <= viewB + pad
}

/** Stepping stones and soil stamps from the garden-v1 layout. */
export function drawRowsGround(ctx: CanvasRenderingContext2D): void {
  if (arenaMap() !== 'rows') return
  for (let i = 0; i < ROWS_GROUND.length; i++) {
    const mark = ROWS_GROUND[i]
    if (!mark) continue
    paintMark(ctx, mark, `rows-ground:${mark.clip}:${i}`)
  }
}

/** Gravel paths, raised-bed sprites, furrows, and planting dips. No centre rows. */
export function drawGardenFloor(
  ctx: CanvasRenderingContext2D,
  hi: boolean,
  viewL: number,
  viewT: number,
  viewW: number,
  viewH: number,
): void {
  if (arenaMap() !== 'tidy') return
  const viewR = viewL + viewW
  const viewB = viewT + viewH
  ctx.save()
  ctx.fillStyle = 'rgba(20, 24, 10, 0.25)'
  ctx.beginPath()
  for (const r of PATH_RECTS) {
    ctx.rect(r.x - EDGE + SHADOW, r.y - EDGE + SHADOW, r.w + EDGE * 2, r.h + EDGE * 2)
  }
  ctx.fill()
  ctx.fillStyle = '#4a4232'
  ctx.beginPath()
  for (const r of PATH_RECTS) ctx.rect(r.x - EDGE, r.y - EDGE, r.w + EDGE * 2, r.h + EDGE * 2)
  ctx.fill()
  const gravel = gardenPathGravel(hi) ?? gardenPathGravel(false)
  if (gravel) {
    ctx.beginPath()
    for (const r of PATH_RECTS) ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    const t0x = Math.floor(viewL / 512)
    const t0y = Math.floor(viewT / 512)
    const t1x = Math.floor(viewR / 512)
    const t1y = Math.floor(viewB / 512)
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) ctx.drawImage(gravel, tx * 512, ty * 512, 512, 512)
    }
  }
  ctx.restore()

  const raised = resolveSheet([RAISED_SHEET])
  if (raised) {
    for (const bed of RAISED_BEDS) {
      if (!seen(bed.x, bed.y, viewL, viewT, viewR, viewB, 420)) continue
      if (!raised.manifest.clips[bed.clip]) continue
      ctx.save()
      ctx.translate(bed.x, bed.y)
      drawNamedClip(ctx, raised, `raised:${bed.id}`, bed.clip, 0, {
        scale: clipDrawScale(raised, bed.clip),
      })
      ctx.restore()
    }
  }

  for (const bed of RAISED_BEDS) {
    for (const row of bed.rows) {
      if (!seen(row.x, row.y, viewL, viewT, viewR, viewB, 180)) continue
      drawProp(ctx, 'prop-furrow', row.x, row.y + 6, { width: FURROW_W, hi })
      for (const dx of bed.plotOffsetsX) {
        drawProp(ctx, 'prop-bed', row.x + dx, row.y + 4, { width: DIP_W, hi })
      }
    }
  }
}

function fenceSortY(mark: GardenMark): number {
  if (mark.clip.startsWith('fence_w') || mark.clip.startsWith('fence_e')) return mark.y + 78
  return mark.y
}

function depthOf(fence: readonly GardenMark[], props: readonly GardenMark[], key: string): BedDepth[] {
  const out: BedDepth[] = []
  for (let i = 0; i < fence.length; i++) {
    const mark = fence[i]
    if (!mark) continue
    if (!resolveSheet([mark.sheet])) continue
    const sortY = fenceSortY(mark)
    out.push({
      x: mark.x,
      y: mark.y,
      sortY,
      draw: (ctx) => paintMark(ctx, mark, `${key}-fence:${mark.clip}:${i}`),
    })
  }
  for (let i = 0; i < props.length; i++) {
    const mark = props[i]
    if (!mark) continue
    out.push({
      x: mark.x,
      y: mark.y,
      sortY: mark.y,
      draw: (ctx) => paintMark(ctx, mark, `${key}-prop:${mark.clip}:${i}`),
    })
  }
  return out
}

/** Outer fence and the layout props, y-sorted with the actors. */
export function gardenDepth(): BedDepth[] {
  if (arenaMap() === 'classic') return []
  if (arenaMap() === 'rows') return depthOf(ROWS_FENCE, ROWS_DECOR, 'rows')
  return depthOf(GARDEN_FENCE, GARDEN_PROPS, 'tidy')
}

/** Outside this rect the lawn falls off. The fence sits just inside it. */
export function gardenFadeRect(): { x: number; y: number; w: number; h: number } {
  const lines = arenaMap() === 'rows' ? ROWS_FENCE_LINES : FENCE_LINES
  const pad = 72
  const x0 = lines.x0 - pad
  const y0 = lines.y0 - pad
  const x1 = lines.x1 + pad
  const y1 = lines.y1 + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
