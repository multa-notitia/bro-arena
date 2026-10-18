/**
 * Garden beds in world px. Origin is the centre of bed C.
 *
 *   L2 512×768 at (-1536, -384)    L1 512×768 at (-1024, -384)
 *   C  1024×768 at (-512, -384)
 *   R1 512×768 at (512, -384)      R2 512×768 at (1024, -384)
 *
 * All five together are 3072×768. A run starts on C.
 * Sprite sheets tile at 1 world px per image px:
 * props-bed-soil, props-bed-edge, props-bed-locked, props-bed-unlock.
 */

export type BedId = 'L2' | 'L1' | 'C' | 'R1' | 'R2'

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
  /** Materials. Centre costs nothing. */
  cost: number
  /** Shop line while the inner bed is still shut. */
  gated: string
}

/** How far the camera may look into a still-locked neighbour, world px. */
export const BED_PEEK = 72

/** Seconds the hedge takes to open. */
export const BED_REVEAL_SEC = 1.35

export const BED_SHEET = {
  soil: 'props-bed-soil',
  edge: 'props-bed-edge',
  locked: 'props-bed-locked',
  unlock: 'props-bed-unlock',
} as const

export const BEDS: readonly BedDef[] = [
  {
    id: 'L2',
    label: 'West outer',
    x: -1536,
    y: -384,
    w: 512,
    h: 768,
    requires: 'L1',
    cost: 36,
    gated: 'Open the west bed first',
  },
  {
    id: 'L1',
    label: 'West bed',
    x: -1024,
    y: -384,
    w: 512,
    h: 768,
    requires: null,
    cost: 12,
    gated: '',
  },
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
  },
  {
    id: 'R1',
    label: 'East bed',
    x: 512,
    y: -384,
    w: 512,
    h: 768,
    requires: null,
    cost: 12,
    gated: '',
  },
  {
    id: 'R2',
    label: 'East outer',
    x: 1024,
    y: -384,
    w: 512,
    h: 768,
    requires: 'R1',
    cost: 36,
    gated: 'Open the east bed first',
  },
]

export function bedById(id: string): BedDef | null {
  for (const bed of BEDS) if (bed.id === id) return bed
  return null
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
