import { clamp, lerp } from '../core/math.ts'
import type { BedOffer, World } from '../core/types.ts'
import {
  BED_PEEK,
  BED_REVEAL_SEC,
  BEDS,
  bedById,
  boundsOf,
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

function smooth(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

function bedsAllRequested(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get('beds') === 'all'
}

function unionOf(ids: ReadonlySet<BedId>): BedBounds {
  return boundsOf(BEDS.filter((b) => ids.has(b.id)))
}

function writeBounds(world: World, b: BedBounds): void {
  world.arenaMinX = b.minX
  world.arenaMaxX = b.maxX
  world.arenaMinY = b.minY
  world.arenaMaxY = b.maxY
  world.arenaHalfW = Math.max(-b.minX, b.maxX)
  world.arenaHalfH = Math.max(-b.minY, b.maxY)
}

function lerpBounds(a: BedBounds, b: BedBounds, t: number): BedBounds {
  return {
    minX: lerp(a.minX, b.minX, t),
    maxX: lerp(a.maxX, b.maxX, t),
    minY: lerp(a.minY, b.minY, t),
    maxY: lerp(a.maxY, b.maxY, t),
  }
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
  owned = new Set<BedId>([CENTRE])
  revealed = new Set<BedId>([CENTRE])
  pending = []
  reveal = null
  if (bedsAllRequested()) {
    for (const bed of BEDS) {
      owned.add(bed.id)
      revealed.add(bed.id)
    }
  }
  writeBounds(world, unionOf(revealed))
}

export function bedRevealActive(): boolean {
  return reveal !== null || pending.length > 0
}

/** 0 while shut, 1 when the hedge is gone. Queued beds stay shut until their turn. */
export function bedOpenAmount(id: BedId): number {
  if (reveal?.id === id) return smooth(Math.min(1, reveal.t / BED_REVEAL_SEC))
  return revealed.has(id) ? 1 : 0
}

export function revealBedId(): BedId | null {
  return reveal?.id ?? null
}

/** A wing the player can already walk is open, including the one currently easing. */
export function hasOpenWing(): boolean {
  for (const id of revealed) if (id !== CENTRE) return true
  return reveal !== null && reveal.id !== CENTRE
}

export function tickBeds(world: World, dt: number): boolean {
  if (!reveal && pending.length) beginReveal()
  if (!reveal) {
    writeBounds(world, unionOf(revealed))
    return false
  }
  reveal.t += dt
  const u = smooth(Math.min(1, reveal.t / BED_REVEAL_SEC))
  writeBounds(world, lerpBounds(reveal.from, reveal.to, u))
  if (reveal.t >= BED_REVEAL_SEC) {
    revealed.add(reveal.id)
    reveal = null
    if (pending.length) beginReveal()
  }
  return reveal !== null
}

/**
 * Walkable rect plus a short peek into any neighbour that is still shut,
 * so the hedge and a strip of locked soil stay in frame.
 */
export function cameraLimits(world: World): BedBounds {
  let minX = world.arenaMinX
  let maxX = world.arenaMaxX
  let minY = world.arenaMinY
  let maxY = world.arenaMaxY
  const openIds = new Set<BedId>(revealed)
  if (reveal) openIds.add(reveal.id)
  for (const bed of BEDS) {
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
  return { minX, maxX, minY, maxY }
}

/** World-pixel zoom that keeps the view inside the unlocked arena (plus peek). */
export function zoomFloorForArena(world: World, viewW: number, viewH: number): number {
  const lim = cameraLimits(world)
  const allowW = Math.max(64, lim.maxX - lim.minX)
  const allowH = Math.max(64, lim.maxY - lim.minY)
  return Math.max(viewW / allowW, viewH / allowH)
}

/** Camera look-at while a bed is opening. `pull` peaks mid-reveal. */
export function revealLook(): { x: number; y: number; pull: number } | null {
  if (!reveal) return null
  const bed = bedById(reveal.id)
  if (!bed) return null
  const u = clamp(reveal.t / BED_REVEAL_SEC, 0, 1)
  const pull = Math.sin(u * Math.PI) * 0.92
  const seamX = clamp(0, bed.x, bed.x + bed.w)
  const seamY = clamp(0, bed.y, bed.y + bed.h)
  const cx = bed.x + bed.w * 0.5
  const cy = bed.y + bed.h * 0.5
  const dirX = cx - seamX
  const dirY = cy - seamY
  const len = Math.hypot(dirX, dirY) || 1
  const dist = 48 + u * Math.min(bed.w, bed.h) * 0.42
  return {
    x: seamX + (dirX / len) * dist,
    y: seamY + (dirY / len) * dist,
    pull,
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
  return BEDS.map((bed) => {
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
