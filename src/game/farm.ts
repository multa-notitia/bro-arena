import { clamp, lerp, uid } from '../core/math.ts'
import type { CropId, EnemyKind, Farm, PlantView, Plot, World } from '../core/types.ts'
import { CROP_IDS, STARTER_CROP_IDS } from '../core/types.ts'
import { CROPS, CROP_LIST, cropByEnemy, cropUnlockedAt, GARDEN_COL_COUNT, GARDEN_ROW_COUNT, GARDEN_ROWS } from '../data/crops.ts'

export const COL_COUNT = GARDEN_COL_COUNT
export const ROW_COUNT = GARDEN_ROW_COUNT
export const PLOT_COUNT = COL_COUNT * ROW_COUNT
export const ROW_NAMES = GARDEN_ROWS

const XS = [-210, -70, 70, 210]
const YS = [-150, 48, 218]

export function emptySeeds(): Record<CropId, number> {
  return { pea: 0, sprout: 0, carrot: 0, garlic: 0, pumpkin: 0, chili: 0 }
}

export function starterSeeds(): Record<CropId, number> {
  return { pea: 6, sprout: 3, carrot: 1, garlic: 0, pumpkin: 0, chili: 0 }
}

export function createFarm(): Farm {
  const plots: Plot[] = []
  for (let r = 0; r < ROW_COUNT; r++) {
    for (let c = 0; c < COL_COUNT; c++) {
      const x = XS[c] ?? 0
      const y = YS[r] ?? 0
      plots.push({
        uid: uid(),
        row: r,
        col: c,
        x: x + ((r + c) % 2 === 0 ? -10 : 10),
        y: y + (c % 2 === 0 ? -7 : 7),
        crop: null,
        growth: 0,
        sway: (r * 3 + c) * 0.7,
      })
    }
  }
  return {
    plots,
    seeds: starterSeeds(),
    selected: 'pea',
    unlocked: [...STARTER_CROP_IDS],
    fertilizer: 0,
    pesticide: 0,
    lastHarvest: { materials: 0, xp: 0 },
  }
}

export function cropCounts(farm: Farm): Record<CropId, number> {
  const n = emptySeeds()
  for (const p of farm.plots) {
    if (p.crop) n[p.crop] += 1
  }
  return n
}

export function plantedCount(farm: Farm): number {
  let n = 0
  for (const p of farm.plots) if (p.crop) n += 1
  return n
}

export function farmRichness(farm: Farm): number {
  return plantedCount(farm) / Math.max(1, farm.plots.length)
}

export function farmThreat(farm: Farm): number {
  let t = 0
  for (const p of farm.plots) {
    if (p.crop) t += CROPS[p.crop].threat
  }
  return t
}

export function plantedPlots(farm: Farm): Plot[] {
  return farm.plots.filter((p) => p.crop)
}

export function farmSpawnInterval(base: number, farm: Farm): number {
  const r = farmRichness(farm)
  const pest = 1 + farm.pesticide * 0.18
  return Math.max(0.18, base * lerp(1.32, 0.52, r) * pest)
}

export function farmSpawnBatch(base: number, farm: Farm): number {
  const r = farmRichness(farm)
  let n = base
  if (r >= 0.5) n += 1
  if (r >= 0.85) n += 1
  n -= farm.pesticide >= 2 ? 1 : 0
  return Math.max(1, n)
}

export function farmHpMult(farm: Farm): number {
  const counts = cropCounts(farm)
  const planted = Math.max(1, plantedCount(farm))
  const heavy = (counts.carrot + counts.pumpkin + counts.chili) / planted
  return Math.max(0.7, 1 + farmRichness(farm) * 0.38 + heavy * 0.22 - farm.pesticide * 0.08)
}

export function farmNightmareBonus(farm: Farm): number {
  const counts = cropCounts(farm)
  return Math.max(0, farmRichness(farm) * 0.22 + counts.carrot * 0.045 + counts.pumpkin * 0.05 - farm.pesticide * 0.12)
}

export function expectedHarvest(farm: Farm): { materials: number; xp: number } {
  let materials = 0
  let xp = 0
  const fert = 1 + farm.fertilizer * 0.4
  for (const p of farm.plots) {
    if (!p.crop) continue
    const c = CROPS[p.crop]
    materials += Math.round(c.materials * fert)
    xp += Math.round(c.xp * fert)
  }
  return { materials, xp }
}

function threatCopy(farm: Farm): { label: string; blurb: string; comesUp: string } {
  const n = plantedCount(farm)
  const counts = cropCounts(farm)
  const parts: string[] = []
  for (const id of CROP_IDS) {
    if (counts[id] > 0) parts.push(`${counts[id]} ${CROPS[id].enemyName}${counts[id] === 1 ? '' : 's'}`)
  }
  const rowBits: string[] = []
  for (let r = 0; r < ROW_COUNT; r++) {
    const inRow = farm.plots.filter((p) => p.row === r && p.crop)
    if (inRow.length) rowBits.push(`${ROW_NAMES[r]} (${inRow.length})`)
  }
  const head = parts.length ? parts.join(', ') : 'Almost nothing. A stray Pea, maybe'
  const comesUp = rowBits.length ? `${head}. From ${rowBits.join(', ')}.` : `${head}.`
  if (n === 0) {
    return {
      label: 'Fallow',
      blurb: 'Nothing in the ground. A stray Pea may still crawl out of an empty bed.',
      comesUp,
    }
  }
  if (n <= 3) {
    return {
      label: 'Quiet',
      blurb: 'A timid sowing. They come up from those beds only.',
      comesUp,
    }
  }
  if (n <= 6) {
    return {
      label: 'Stirring',
      blurb: 'Enough to eat. Leave a row empty if you need a path.',
      comesUp,
    }
  }
  if (n <= 9) {
    return {
      label: 'Loud',
      blurb: 'Faces come up out of every sown bed.',
      comesUp,
    }
  }
  return {
    label: counts.pumpkin + counts.carrot >= 4 ? 'Greedy' : 'Packed',
    blurb:
      counts.pumpkin + counts.carrot >= 4
        ? 'The heavy roots will come up in your face. Harvest will be fat if you live.'
        : 'The whole garden is sown. Nowhere to stand that does not come up.',
    comesUp,
  }
}

export function plantView(world: World, first: boolean): PlantView {
  const farm = world.farm
  const harvest = expectedHarvest(farm)
  const threat = threatCopy(farm)
  return {
    first,
    wave: world.wave,
    nextWave: first ? world.wave : world.wave + 1,
    seeds: { ...farm.seeds },
    selected: farm.selected,
    unlocked: [...farm.unlocked],
    plots: farm.plots.map((p) => ({ crop: p.crop, row: p.row, col: p.col })),
    rowNames: [...ROW_NAMES],
    counts: cropCounts(farm),
    planted: plantedCount(farm),
    capacity: farm.plots.length,
    harvestMats: harvest.materials,
    harvestXp: harvest.xp,
    lastHarvest: { ...farm.lastHarvest },
    fertilizer: farm.fertilizer,
    pesticide: farm.pesticide,
    threatLabel: threat.label,
    threatBlurb: threat.blurb,
    comesUp: threat.comesUp,
  }
}

export function selectCrop(farm: Farm, crop: CropId): void {
  if (!farm.unlocked.includes(crop)) return
  farm.selected = crop
}

/** Plant selected seed, or uproot and refund. Refund only before you sow. */
export function togglePlot(farm: Farm, index: number): boolean {
  const plot = farm.plots[index]
  if (!plot) return false
  if (plot.crop) {
    farm.seeds[plot.crop] += 1
    plot.crop = null
    plot.growth = 0
    return true
  }
  const id = farm.selected
  if (!farm.unlocked.includes(id)) return false
  if (farm.seeds[id] <= 0) return false
  farm.seeds[id] -= 1
  plot.crop = id
  plot.growth = 0.22
  return true
}

export function clearPlots(farm: Farm): void {
  for (const p of farm.plots) {
    if (p.crop) farm.seeds[p.crop] += 1
    p.crop = null
    p.growth = 0
  }
}

export function unlockCrop(farm: Farm, crop: CropId): void {
  if (!farm.unlocked.includes(crop)) farm.unlocked.push(crop)
}

/** Shed stock and the pouch grow with wave count and luck. */
export function syncFarmUnlocks(farm: Farm, nextWave: number, luck: number): void {
  for (const id of CROP_IDS) {
    if (cropUnlockedAt(id, nextWave, luck)) unlockCrop(farm, id)
  }
  if (!farm.unlocked.includes(farm.selected)) {
    const fallback = farm.unlocked[0]
    if (fallback) farm.selected = fallback
  }
}

export function addSeed(farm: Farm, crop: CropId, n = 1): void {
  farm.seeds[crop] += n
  if (n > 0) unlockCrop(farm, crop)
}

export function tickFarm(world: World, dt: number): void {
  const dur = Math.max(1, world.waveDef.duration)
  const g = clamp(0.22 + (world.waveTime / dur) * 0.78, 0.22, 1)
  for (const p of world.farm.plots) {
    p.sway += dt
    if (p.crop) p.growth = g
  }
}

export function harvestFarm(world: World, harvesting: number): { materials: number; xp: number } {
  const pay = expectedHarvest(world.farm)
  const bonus = Math.max(0, Math.round(harvesting * 0.25))
  pay.materials += bonus
  world.farm.lastHarvest = pay
  for (const p of world.farm.plots) {
    p.crop = null
    p.growth = 0
  }
  world.farm.fertilizer = 0
  world.farm.pesticide = 0
  return pay
}

export function seedDropChance(kind: EnemyKind, elite: boolean, luck: number): number {
  const crop = cropByEnemy(kind)
  if (!crop) return 0
  const base = CROPS[crop].seedChance
  return clamp(base * (elite ? 2.1 : 1) * (1 + luck / 140), 0, 0.72)
}

export { CROP_LIST }
