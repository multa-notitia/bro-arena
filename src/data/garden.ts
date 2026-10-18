/**
 * Placement for the wooden fence, the lawn dressing, and the corner props.
 * Generated with the beds; the game reads it as-is.
 */
import raw from './garden_layout.json'

export interface GardenMark {
  sheet: string
  clip: string
  x: number
  y: number
  clipW?: number
  clipH?: number
  flipX?: boolean
  /** Degrees, clockwise. Stepping stones only. */
  rot?: number
}

export const FENCE_LINES = raw.fenceLines
export const GARDEN_FENCE = raw.fence as GardenMark[]
export const GARDEN_DECOR = raw.decor as GardenMark[]
export const GARDEN_GROUND = raw.ground as GardenMark[]

/**
 * Wheelbarrow, gravel, soil stamps, and the other garden-v1 props.
 * Off until a tidy layout replaces them. The perimeter fence still draws.
 */
export const GARDEN_CLUTTER = false

/**
 * Structures you walk around. Flower borders, clumps, pots, and the watering
 * can stay decorative.
 */
export const GARDEN_SOLID: Record<string, number> = {
  shed_corner: 34,
  compost_bin: 16,
  bean_teepee: 20,
  wheelbarrow: 18,
  birdbath: 12,
  rain_barrel: 11,
  tomato_cage: 12,
}
