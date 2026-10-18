import { GARDEN_CLUTTER, GARDEN_DECOR, GARDEN_SOLID } from '../data/garden.ts'

export interface GardenSolid {
  x: number
  y: number
  r: number
}

let solids: GardenSolid[] | null = null

const NONE: readonly GardenSolid[] = []

export function gardenSolids(): readonly GardenSolid[] {
  if (!GARDEN_CLUTTER) return NONE
  if (solids) return solids
  const out: GardenSolid[] = []
  for (const mark of GARDEN_DECOR) {
    const r = GARDEN_SOLID[mark.clip]
    if (!r) continue
    out.push({ x: mark.x, y: mark.y, r })
  }
  solids = out
  return out
}

/** Slide a body out of the shed, teepees, and the other solid props. */
export function pushGardenSolids(x: number, y: number, radius: number): { x: number; y: number } {
  const solids = gardenSolids()
  for (let pass = 0; pass < 2; pass++) {
    for (const solid of solids) {
      let dx = x - solid.x
      let dy = y - solid.y
      const min = radius + solid.r
      let d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      if (d2 < 1e-4) {
        dx = min
        dy = 0
        d2 = min * min
      }
      const d = Math.sqrt(d2)
      const k = min / d
      x = solid.x + dx * k
      y = solid.y + dy * k
    }
  }
  return { x, y }
}
