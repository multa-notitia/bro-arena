/**
 * Tidy allotment. `garden_layout_v2.json` is the authority for rects,
 * fence pieces, paths, and the six corner props.
 */
import raw from './garden_layout_v2.json'

export interface GardenMark {
  sheet: string
  clip: string
  x: number
  y: number
  clipW?: number
  clipH?: number
  flipX?: boolean
  /** Degrees, clockwise. */
  rot?: number
}

export interface PathRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface RaisedSprite {
  id: string
  clip: string
  /** Centre of the bed sprite, world px. */
  x: number
  y: number
  rows: { x: number; y: number }[]
  plotOffsetsX: readonly number[]
}

export const FENCE_LINES = raw.fence.lines
export const GARDEN_FENCE = raw.fence.pieces as GardenMark[]
export const GARDEN_PROPS = raw.props as GardenMark[]

export const PATH_RECTS: PathRect[] = raw.paths.rects.map((p) => ({
  id: p.id,
  x: p.rect[0] ?? 0,
  y: p.rect[1] ?? 0,
  w: p.rect[2] ?? 0,
  h: p.rect[3] ?? 0,
}))

const BED_IDS = ['L1', 'L2', 'R1', 'R2', 'N', 'S'] as const

export const RAISED_BEDS: RaisedSprite[] = BED_IDS.map((id) => {
  const bed = raw.beds[id]
  const centre = bed.raisedBed.centre
  return {
    id,
    clip: bed.raisedBed.clip,
    x: centre[0] ?? 0,
    y: centre[1] ?? 0,
    rows: bed.rows.map((pair) => ({ x: pair[0] ?? 0, y: pair[1] ?? 0 })),
    plotOffsetsX: bed.plotOffsetsX,
  }
})

/**
 * Structures you walk around. The two apple trees use the same clip name.
 */
export const GARDEN_SOLID: Record<string, number> = {
  shed_corner: 34,
  rain_barrel: 11,
  wheelbarrow: 18,
  compost_bin: 16,
  tree_apple: 26,
}
