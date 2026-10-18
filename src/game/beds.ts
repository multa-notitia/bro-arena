import { clamp } from '../core/math.ts'
import type { BedOffer, World } from '../core/types.ts'
import { arenaMap } from '../data/mapMode.ts'
import {
  BED_OPEN_AT,
  BED_PEEK,
  BED_REVEAL_SEC,
  activeBeds,
  bedById,
  bedMouth,
  boundsOf,
  plotBounds,
  type BedBounds,
  type BedDef,
  type BedId,
} from '../data/beds.ts'

const CENTRE: BedId = 'C'

let owned = new Set<BedId>([CENTRE])
let revealed = new Set<BedId>([CENTRE])
let pending: BedId[] = []

interface Reveal {
  id: BedId
  t: number
  from: BedBounds
  to: BedBounds
}

let reveal: Reveal | null = null

function bedsAllRequested(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get('beds') === 'all'
}

function unionOf(ids: ReadonlySet<BedId>): BedBounds {
  return boundsOf(activeBeds().filter((b) => ids.has(b.id)))
}

function writeBounds(world: World, b: BedBounds): void {
  world.arenaMinX = b.minX
  world.arenaMaxX = b.maxX
  world.arenaMinY = b.minY
  world.arenaMaxY = b.maxY
  world.arenaHalfW = Math.max(-b.minX, b.maxX)
  world.arenaHalfH = Math.max(-b.minY, b.maxY)
}

function beginReveal(): void {
  const id = pending.shift()
  if (!id) return
  const from = unionOf(revealed)
  const next = new Set(revealed)
  next.add(id)
  reveal = { id, t: 0, from, to: unionOf(next) }
}

/** New run. `?beds=all` opens every bed with no reveal. */
export function resetBeds(world: World): void {
  const start: BedId[] = [CENTRE]
  if (arenaMap() === 'tidy') start.push('L1')
  owned = new Set<BedId>(start)
  revealed = new Set<BedId>(start)
  pending = []
  reveal = null
  if (bedsAllRequested()) {
    for (const bed of activeBeds()) {
      owned.add(bed.id)
      revealed.add(bed.id)
    }
  }
  writeBounds(world, unionOf(revealed))
}

export function bedRevealActive(): boolean {
  return reveal !== null || pending.length > 0
}

/** 0 while shut, 1 once the gate's `open` event has fired. */
export function bedOpenAmount(id: BedId): number {
  if (revealed.has(id)) return 1
  if (reveal?.id === id && reveal.t >= BED_OPEN_AT) return 1
  return 0
}

export function revealBedId(): BedId | null {
  return reveal?.id ?? null
}

export function bedPhase(id: BedId): 'locked' | 'opening' | 'open' {
  if (reveal?.id === id) return 'opening'
  if (revealed.has(id)) return 'open'
  return 'locked'
}

/** Elapsed seconds of the bed whose gate is playing. */
export function bedRevealAge(): { id: BedId; t: number } | null {
  if (!reveal) return null
  return { id: reveal.id, t: reveal.t }
}

/** A wing the player can already walk. Collision clears on `open`, not at the click. */
export function hasOpenWing(): boolean {
  for (const id of revealed) if (id !== CENTRE) return true
  return reveal !== null && reveal.id !== CENTRE && reveal.t >= BED_OPEN_AT
}

export function tickBeds(world: World, dt: number): boolean {
  if (!reveal && pending.length) beginReveal()
  if (!reveal) {
    writeBounds(world, unionOf(revealed))
    return false
  }
  reveal.t += dt
  if (reveal.t >= BED_REVEAL_SEC) {
    revealed.add(reveal.id)
    reveal = null
    if (pending.length) beginReveal()
  }
  if (!reveal) {
    writeBounds(world, unionOf(revealed))
    return false
  }
  writeBounds(world, reveal.t >= BED_OPEN_AT ? reveal.to : reveal.from)
  return true
}

/** How far the camera may look past an open outer edge, so the wooden fence stays in frame. */
const FENCE_PEEK = 100

/**
 * Walkable rect plus a short peek into any neighbour that is still shut,
 * so the hedge and a strip of locked soil stay in frame. An edge that already
 * sits on the outer plot also peeks far enough to show the perimeter fence.
 */
export function cameraLimits(world: World): BedBounds {
  let minX = world.arenaMinX
  let maxX = world.arenaMaxX
  let minY = world.arenaMinY
  let maxY = world.arenaMaxY
  if (reveal) {
    const bed = bedById(reveal.id)
    if (bed) {
      minX = Math.min(minX, bed.x)
      maxX = Math.max(maxX, bed.x + bed.w)
      minY = Math.min(minY, bed.y)
      maxY = Math.max(maxY, bed.y + bed.h)
    }
  }
  const openIds = new Set<BedId>(revealed)
  if (reveal) openIds.add(reveal.id)
  for (const bed of activeBeds()) {
    if (openIds.has(bed.id)) continue
    const right = bed.x + bed.w
    const bottom = bed.y + bed.h
    const yOverlap = bed.y < maxY - 0.5 && minY < bottom - 0.5
    const xOverlap = bed.x < maxX - 0.5 && minX < right - 0.5
    if (yOverlap && Math.abs(right - minX) < 1.5) minX -= Math.min(BED_PEEK, bed.w)
    if (yOverlap && Math.abs(bed.x - maxX) < 1.5) maxX += Math.min(BED_PEEK, bed.w)
    if (xOverlap && Math.abs(bottom - minY) < 1.5) minY -= Math.min(BED_PEEK, bed.h)
    if (xOverlap && Math.abs(bed.y - maxY) < 1.5) maxY += Math.min(BED_PEEK, bed.h)
  }
  const plot = plotBounds()
  if (arenaMap() !== 'classic') {
    if (minX <= plot.minX + 0.5) minX = plot.minX - FENCE_PEEK
    if (maxX >= plot.maxX - 0.5) maxX = plot.maxX + FENCE_PEEK
    if (minY <= plot.minY + 0.5) minY = plot.minY - FENCE_PEEK
    if (maxY >= plot.maxY - 0.5) maxY = plot.maxY + FENCE_PEEK
  }
  return { minX, maxX, minY, maxY }
}

/** World-pixel zoom that keeps the view inside the unlocked arena (plus peek). */
export function zoomFloorForArena(world: World, viewW: number, viewH: number): number {
  const lim = cameraLimits(world)
  const allowW = Math.max(64, lim.maxX - lim.minX)
  const allowH = Math.max(64, lim.maxY - lim.minY)
  return Math.max(viewW / allowW, viewH / allowH)
}

/** Look at the gate, or at the inner hedge when the bed has no side gate. */
export function revealLook(): { x: number; y: number; pull: number } | null {
  if (!reveal) return null
  const bed = bedById(reveal.id)
  if (!bed) return null
  const rise = clamp(reveal.t / 0.16, 0, 1)
  const fall = clamp((BED_REVEAL_SEC - reveal.t) / 0.28, 0, 1)
  const mouth = bedMouth(bed)
  const cx = bed.x + bed.w * 0.5
  const cy = bed.y + bed.h * 0.5
  return {
    x: mouth.x + (cx - mouth.x) * 0.22,
    y: mouth.y + (cy - mouth.y) * 0.16,
    pull: Math.min(rise, fall),
  }
}

export function tryBuyBed(world: World, id: string): BedDef | null {
  const bed = bedById(id)
  if (!bed || bed.cost <= 0) return null
  if (owned.has(bed.id)) return null
  if (bed.requires && !owned.has(bed.requires)) return null
  if (world.player.materials < bed.cost) return null
  world.player.materials -= bed.cost
  owned.add(bed.id)
  pending.push(bed.id)
  return bed
}

export function bedOffers(materials: number): BedOffer[] {
  return activeBeds().filter((bed) => bed.cost > 0).map((bed) => {
    if (owned.has(bed.id) || bed.cost <= 0) {
      return {
        id: bed.id,
        label: bed.label,
        cost: bed.cost,
        state: 'open' as const,
        affordable: true,
        hint: 'Open',
      }
    }
    if (bed.requires && !owned.has(bed.requires)) {
      return {
        id: bed.id,
        label: bed.label,
        cost: bed.cost,
        state: 'gated' as const,
        affordable: false,
        hint: bed.gated,
      }
    }
    return {
      id: bed.id,
      label: bed.label,
      cost: bed.cost,
      state: 'ready' as const,
      affordable: materials >= bed.cost,
      hint: `${bed.cost} scrap`,
    }
  })
}
