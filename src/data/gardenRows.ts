/**
 * Garden v1 placement. The sheets are the copies from before garden v2,
 * under `-v1` ids, so the tidy art keeps the unsuffixed names.
 */
import type { GardenMark } from './garden.ts'
import raw from './garden_layout.json'

interface RawMark {
  sheet: string
  clip: string
  x: number
  y: number
  clipW?: number
  clipH?: number
  flipX?: boolean
  rot?: number
}

function mark(m: RawMark): GardenMark {
  const sheet =
    m.sheet === 'props-fence' || m.sheet === 'props-garden-decor' ? `${m.sheet}-v1` : m.sheet
  return {
    sheet,
    clip: m.clip,
    x: m.x,
    y: m.y,
    clipW: m.clipW,
    clipH: m.clipH,
    flipX: m.flipX,
    rot: m.rot,
  }
}

export const ROWS_FENCE_LINES = raw.fenceLines
export const ROWS_FENCE: GardenMark[] = raw.fence.map(mark)
export const ROWS_DECOR: GardenMark[] = raw.decor.map(mark)
export const ROWS_GROUND: GardenMark[] = raw.ground.map(mark)

/** Structures you walk around on the scattered-rows map. */
export const ROWS_SOLID: Record<string, number> = {
  shed_corner: 34,
  compost_bin: 16,
  bean_teepee: 20,
  wheelbarrow: 18,
  birdbath: 12,
  rain_barrel: 11,
  tomato_cage: 12,
}
