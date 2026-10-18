/**
 * Lawn dressing and the outer wooden fence. Pieces come from
 * `data/garden_layout.json`. The south run is the low see-through clip, so a
 * body at that edge still reads through the planks.
 */
import {
  FENCE_LINES,
  GARDEN_CLUTTER,
  GARDEN_DECOR,
  GARDEN_FENCE,
  GARDEN_GROUND,
  type GardenMark,
} from '../data/garden.ts'
import type { BedDepth } from './beds.ts'
import { clipDrawScale, drawNamedClip, resolveSheet, type LoadedSheet } from './sheets.ts'

const FENCE_SHEET = 'props-fence'

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

/** Soil stamps, gravel, and stepping stones. Skipped while clutter is off. */
export function drawGardenGround(ctx: CanvasRenderingContext2D): void {
  if (!GARDEN_CLUTTER) return
  for (let i = 0; i < GARDEN_GROUND.length; i++) {
    const mark = GARDEN_GROUND[i]
    if (!mark) continue
    paintMark(ctx, mark, `garden-ground:${mark.clip}:${i}`)
  }
}

function fenceSortY(mark: GardenMark): number {
  if (mark.clip.startsWith('fence_w') || mark.clip.startsWith('fence_e')) return mark.y + 78
  return mark.y
}

/** Outer fence, y-sorted with the actors. Corner props wait on the clutter flag. */
export function gardenDepth(): BedDepth[] {
  const out: BedDepth[] = []
  if (resolveSheet([FENCE_SHEET])) {
    for (let i = 0; i < GARDEN_FENCE.length; i++) {
      const mark = GARDEN_FENCE[i]
      if (!mark) continue
      const sortY = fenceSortY(mark)
      out.push({
        x: mark.x,
        y: mark.y,
        sortY,
        draw: (ctx) => paintMark(ctx, mark, `garden-fence:${mark.clip}:${i}`),
      })
    }
  }
  if (!GARDEN_CLUTTER) return out
  for (let i = 0; i < GARDEN_DECOR.length; i++) {
    const mark = GARDEN_DECOR[i]
    if (!mark) continue
    out.push({
      x: mark.x,
      y: mark.y,
      sortY: mark.y,
      draw: (ctx) => paintMark(ctx, mark, `garden-decor:${mark.clip}:${i}`),
    })
  }
  return out
}

/** Outside this rect the lawn falls off. The fence sits just inside it. */
export function gardenFadeRect(): { x: number; y: number; w: number; h: number } {
  const pad = 72
  const x0 = FENCE_LINES.x0 - pad
  const y0 = FENCE_LINES.y0 - pad
  const x1 = FENCE_LINES.x1 + pad
  const y1 = FENCE_LINES.y1 + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
