/**
 * Walkable regions in world px. Origin is the centre of the starting green.
 *
 * Starting green C, 1024×768 at (-512, -384). Its three garden rows are
 * spread across that rect (see `rows` on C). You sow those.
 *
 * Six extra beds, each a patch of the same furrow and bed props:
 *   L1 560×768 at (-1072, -384)     L2 560×768 at (-1632, -384)
 *   R1 560×768 at (512, -384)       R2 560×768 at (1072, -384)
 *   N  1024×448 at (-512, -832)     S  1024×448 at (-512, 384)
 *
 * All seven together span x -1632..1632 and y -832..832.
 * Locked extras use props-bed-locked / props-bed-unlock. The face-on gate
 * sits on N (south edge) and S (north edge). L and R are hedge only.
 */

export type BedId = 'C' | 'L1' | 'L2' | 'R1' | 'R2' | 'N' | 'S'

export interface GardenRow {
  /** Centre of the furrow, world px. */
  x: number
  y: number
}

export interface BedDef {
  id: BedId
  /** Short label on the shop row. */
  label: string
  /** Top-left corner, world px. */
  x: number
  y: number
  w: number
  h: number
  /** Outward beds need the inner one. Centre is always open. */
  requires: BedId | null
  /** Materials. Centre costs nothing and is not sold. */
  cost: number
  /** Shop line while the inner bed is still shut. */
  gated: string
  /**
   * Face-on padlock. `bottom` is the south edge, `top` the north edge.
   * Side beds stay null until a side gate exists.
   */
  gate: 'top' | 'bottom' | null
  /** Furrow centres. C is the sown rows. The extras are the same props. */
  rows: readonly GardenRow[]
}

/** How far the camera may look into a still-locked neighbour, world px. */
export const BED_PEEK = 72

/** Seconds from the click until the hedge is gone. */
export const BED_REVEAL_SEC = 1.35

/** `gate_unlock` fires `open` at 230 ms. The bed becomes passable then. */
export const BED_OPEN_AT = 0.23

export const BED_SHEET = {
  soil: 'props-bed-soil',
  edge: 'props-bed-edge',
  locked: 'props-bed-locked',
  unlock: 'props-bed-unlock',
} as const

export const BEDS: readonly BedDef[] = [
  {
    id: 'C',
    label: 'Centre',
    x: -512,
    y: -384,
    w: 1024,
    h: 768,
    requires: null,
    cost: 0,
    gated: '',
    gate: null,
    rows: [
      { x: -220, y: -230 },
      { x: 80, y: 10 },
      { x: -40, y: 250 },
    ],
  },
  {
    id: 'L1',
    label: 'West bed',
    x: -1072,
    y: -384,
    w: 560,
    h: 768,
    requires: null,
    cost: 12,
    gated: '',
    gate: null,
    rows: [
      { x: -860, y: -150 },
      { x: -720, y: 170 },
    ],
  },
  {
    id: 'L2',
    label: 'Far west',
    x: -1632,
    y: -384,
    w: 560,
    h: 768,
    requires: 'L1',
    cost: 36,
    gated: 'Open the west bed first',
    gate: null,
    rows: [
      { x: -1420, y: -160 },
      { x: -1280, y: 150 },
    ],
  },
  {
    id: 'R1',
    label: 'East bed',
    x: 512,
    y: -384,
    w: 560,
    h: 768,
    requires: null,
    cost: 12,
    gated: '',
    gate: null,
    rows: [
      { x: 720, y: -150 },
      { x: 860, y: 170 },
    ],
  },
  {
    id: 'R2',
    label: 'Far east',
    x: 1072,
    y: -384,
    w: 560,
    h: 768,
    requires: 'R1',
    cost: 36,
    gated: 'Open the east bed first',
    gate: null,
    rows: [
      { x: 1280, y: -160 },
      { x: 1420, y: 150 },
    ],
  },
  {
    id: 'N',
    label: 'North bed',
    x: -512,
    y: -832,
    w: 1024,
    h: 448,
    requires: null,
    cost: 18,
    gated: '',
    gate: 'bottom',
    rows: [
      { x: -240, y: -680 },
      { x: 220, y: -520 },
    ],
  },
  {
    id: 'S',
    label: 'South bed',
    x: -512,
    y: 384,
    w: 1024,
    h: 448,
    requires: null,
    cost: 18,
    gated: '',
    gate: 'top',
    rows: [
      { x: -200, y: 520 },
      { x: 240, y: 700 },
    ],
  },
]

export function bedById(id: string): BedDef | null {
  for (const bed of BEDS) if (bed.id === id) return bed
  return null
}

/** Where the unlock reads from: the gate, or the inner hedge on a side bed. */
export function bedMouth(bed: BedDef): { x: number; y: number } {
  if (bed.gate === 'bottom') return { x: bed.x + bed.w * 0.5, y: bed.y + bed.h }
  if (bed.gate === 'top') return { x: bed.x + bed.w * 0.5, y: bed.y }
  if (bed.x + bed.w <= 0) return { x: bed.x + bed.w, y: bed.y + bed.h * 0.5 }
  return { x: bed.x, y: bed.y + bed.h * 0.5 }
}

export interface BedBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function boundsOf(beds: readonly BedDef[]): BedBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const bed of beds) {
    minX = Math.min(minX, bed.x)
    maxX = Math.max(maxX, bed.x + bed.w)
    minY = Math.min(minY, bed.y)
    maxY = Math.max(maxY, bed.y + bed.h)
  }
  if (!Number.isFinite(minX)) return { minX: -512, maxX: 512, minY: -384, maxY: 384 }
  return { minX, maxX, minY, maxY }
}

/** Union of every bed, locked or not. The dark void starts outside this. */
export function plotBounds(): BedBounds {
  return boundsOf(BEDS)
}
