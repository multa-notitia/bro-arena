/**
 * Walkable regions in world px. Origin is the centre of the starting lawn.
 *
 * Centre C, 1024×768 at (-512, -384), is open lawn. The run starts there.
 * It is not a garden bed, and it has no rows.
 *
 * Six beds, centred in the unchanged unlock regions. Costs and gates stay:
 *   L1 560×768 at (-1072, -384)     L2 560×768 at (-1632, -384)
 *   R1 560×768 at (512, -384)       R2 560×768 at (1072, -384)
 *   N  1024×448 at (-512, -832)     S  1024×448 at (-512, 384)
 *
 * Raised soil comes from garden_layout_v2.json. Side beds are 340×460 with
 * three rows. N and S are 680×260 with a 2×2 of rows. East mirrors west,
 * south mirrors north. Gate sides match the layout: L1/L2 right, R1/R2 left,
 * N bottom, S top.
 * All seven regions together span x -1632..1632 and y -832..832.
 * Locked beds use props-bed-locked / props-bed-unlock.
 */
import layout from './garden_layout_v2.json'

export type BedId = 'C' | 'L1' | 'L2' | 'R1' | 'R2' | 'N' | 'S'

export interface GardenRow {
  /** Centre of the furrow, world px. */
  x: number
  y: number
}

export interface RaisedBed {
  /** Top-left of the soil rectangle, world px. */
  x: number
  y: number
  w: number
  h: number
}

export interface BedDef {
  id: BedId
  /** Short label on the shop row. */
  label: string
  /** Top-left of the unlockable area, world px. Centre is the open lawn. */
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
   * Padlock edge. `bottom` / `top` are the face-on gate. `left` / `right`
   * are `gate_side` on a vertical seam (anchor at the top of the gap).
   */
  gate: 'top' | 'bottom' | 'left' | 'right' | null
  /** Soil rectangle. Null on the centre lawn. */
  raised: RaisedBed | null
  /** Centres of the straight rows inside `raised`. Empty on the centre lawn. */
  rows: readonly GardenRow[]
}

type SideBed = keyof typeof layout.beds

function raisedOf(id: SideBed): RaisedBed {
  const r = layout.beds[id].raisedBed.rect
  return { x: r[0] ?? 0, y: r[1] ?? 0, w: r[2] ?? 0, h: r[3] ?? 0 }
}

function rowsOf(id: SideBed): GardenRow[] {
  return layout.beds[id].rows.map((pair) => ({ x: pair[0] ?? 0, y: pair[1] ?? 0 }))
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
    raised: null,
    rows: [],
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
    gate: 'right',
    raised: raisedOf('L1'),
    rows: rowsOf('L1'),
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
    gate: 'right',
    raised: raisedOf('L2'),
    rows: rowsOf('L2'),
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
    gate: 'left',
    raised: raisedOf('R1'),
    rows: rowsOf('R1'),
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
    gate: 'left',
    raised: raisedOf('R2'),
    rows: rowsOf('R2'),
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
    raised: raisedOf('N'),
    rows: rowsOf('N'),
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
    raised: raisedOf('S'),
    rows: rowsOf('S'),
  },
]

export function bedById(id: string): BedDef | null {
  for (const bed of BEDS) if (bed.id === id) return bed
  return null
}

/** Where the unlock reads from: the middle of the gate edge. */
export function bedMouth(bed: BedDef): { x: number; y: number } {
  if (bed.gate === 'bottom') return { x: bed.x + bed.w * 0.5, y: bed.y + bed.h }
  if (bed.gate === 'top') return { x: bed.x + bed.w * 0.5, y: bed.y }
  if (bed.gate === 'right') return { x: bed.x + bed.w, y: bed.y + bed.h * 0.5 }
  if (bed.gate === 'left') return { x: bed.x, y: bed.y + bed.h * 0.5 }
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
