import type { CropId, EnemyKind, Plot, World } from '../core/types.ts'
import { FEEL } from '../feel.ts'
import { CHAOS } from '../data/chaos.ts'
import { spawnFunnyClip } from '../render/chaosFx.ts'
import {
  actorClipDone,
  actorClipFraction,
  advanceActorSheet,
  drawNamedClip,
  restartActorClip,
  resolveSheet,
  seekActorClip,
  type LoadedSheet,
} from '../render/sheets.ts'
export type GardenSpawnFn = (kind: EnemyKind, x: number, y: number, elite: boolean) => void

export const GARDEN_SHEET = 'props-garden'

export type GardenPlant =
  | 'pea'
  | 'sprout'
  | 'carrot'
  | 'garlic'
  | 'pumpkin'
  | 'chili'
  | 'tomato'
  | 'bean'
  | 'beetroot'

export interface GardenJob {
  uid: number
  plant: GardenPlant
  x: number
  y: number
  plotUid: number | null
  phase: 'rustle' | 'burst'
  rustleT: number
  spawned: boolean
  spawns: { kind: EnemyKind; elite: boolean; x: number; y: number }[]
}

const jobs: GardenJob[] = []
const burstingPlots = new Set<number>()
const swayStarted = new Set<number>()
let nextJob = 1

export function resetGardenPlants(): void {
  jobs.length = 0
  burstingPlots.clear()
  swayStarted.clear()
}

export function gardenSheet(): LoadedSheet | null {
  return resolveSheet([GARDEN_SHEET])
}

export function gardenDrawScale(): number {
  const sheet = gardenSheet()
  const base = sheet?.manifest.drawScale ?? 0.25
  return base * (FEEL.garden.scale / 0.4)
}

export function cropToPlant(crop: CropId): GardenPlant {
  return crop
}

export function plotBursting(uid: number): boolean {
  return burstingPlots.has(uid)
}

export function gardenPending(): number {
  let n = 0
  for (const j of jobs) {
    if (!j.spawned) n += j.spawns.length
  }
  return n
}

export function ambushGardenJobs(): GardenJob[] {
  return jobs.filter((j) => j.plotUid == null)
}

function playKey(job: GardenJob): string {
  return `garden:${job.uid}`
}

export function beginPlantBurst(opts: {
  plant: GardenPlant
  x: number
  y: number
  plotUid?: number | null
  spawns: GardenJob['spawns']
}): boolean {
  const sheet = gardenSheet()
  const burst = `${opts.plant}_burst`
  if (!sheet?.manifest.clips[burst]) return false
  if (opts.plotUid != null && burstingPlots.has(opts.plotUid)) return false
  const job: GardenJob = {
    uid: nextJob++,
    plant: opts.plant,
    x: opts.x,
    y: opts.y,
    plotUid: opts.plotUid ?? null,
    phase: sheet.manifest.clips[`${opts.plant}_sway`] ? 'rustle' : 'burst',
    rustleT: 0,
    spawned: false,
    spawns: opts.spawns,
  }
  jobs.push(job)
  if (job.plotUid != null) burstingPlots.add(job.plotUid)
  const key = playKey(job)
  if (job.phase === 'rustle') restartActorClip(key, `${job.plant}_sway`)
  else restartActorClip(key, burst)
  return true
}

export function tickGardenPlants(world: World, dt: number, spawn: GardenSpawnFn): void {
  const sheet = gardenSheet()
  if (!sheet) {
    for (const j of jobs) flushSpawns(j, spawn)
    jobs.length = 0
    burstingPlots.clear()
    return
  }
  const keep: GardenJob[] = []
  for (const j of jobs) {
    const key = playKey(j)
    if (j.phase === 'rustle') {
      j.rustleT += dt
      advanceActorSheet(key, sheet, `${j.plant}_sway`, dt, 200 / 80)
      if (j.rustleT >= 0.4) {
        j.phase = 'burst'
        restartActorClip(key, `${j.plant}_burst`)
      }
      keep.push(j)
      continue
    }
    const events = advanceActorSheet(key, sheet, `${j.plant}_burst`, dt)
    if (events.includes('burst') && !j.spawned) {
      j.spawned = true
      spawnFunnyClip('dust', j.x, j.y + 4, { scale: CHAOS.sheets.drawScale })
      spawnFunnyClip(CHAOS.sheets.vegBurst, j.x, j.y, { scale: CHAOS.sheets.drawScale })
      flushSpawns(j, spawn)
    }
    if (actorClipDone(key, `${j.plant}_burst`)) {
      if (!j.spawned) {
        j.spawned = true
        flushSpawns(j, spawn)
      }
      if (j.plotUid != null) {
        burstingPlots.delete(j.plotUid)
        const plot = world.farm.plots.find((p) => p.uid === j.plotUid)
        if (plot) plot.growth = Math.min(plot.growth, 0.28)
      }
      continue
    }
    keep.push(j)
  }
  jobs.length = 0
  jobs.push(...keep)
}

function flushSpawns(j: GardenJob, spawn: GardenSpawnFn): void {
  for (const s of j.spawns) spawn(s.kind, s.x, s.y, s.elite)
}

export function drawGardenJob(ctx: CanvasRenderingContext2D, job: GardenJob): void {
  const sheet = gardenSheet()
  if (!sheet) return
  const key = playKey(job)
  const clip = job.phase === 'rustle' ? `${job.plant}_sway` : `${job.plant}_burst`
  let alpha = 1
  if (job.phase === 'burst') {
    const u = actorClipFraction(key, `${job.plant}_burst`)
    const remain = (1 - u) * 0.41
    if (remain < 0.15) alpha = Math.max(0, remain / 0.15)
  }
  ctx.save()
  ctx.translate(job.x, job.y + 2)
  drawNamedClip(ctx, sheet, key, clip, 0, { scale: gardenDrawScale(), alpha })
  ctx.restore()
}

const wobbleStarted = new Set<number>()

export function drawPaintedCrop(ctx: CanvasRenderingContext2D, plot: Plot, time: number): boolean {
  if (!plot.crop) return false
  const sheet = gardenSheet()
  if (!sheet) return false
  if (plotBursting(plot.uid)) {
    const job = jobs.find((j) => j.plotUid === plot.uid)
    if (job) drawGardenJob(ctx, job)
    return true
  }
  const plant = cropToPlant(plot.crop)
  const g = plot.growth
  const stage = g < 0.34 ? 1 : g < 0.67 ? 2 : 3
  const grown = stage === 3 && !!sheet.manifest.clips[`${plant}_sway`]
  const clip = grown ? `${plant}_sway` : `${plant}_stage${stage}`
  if (!sheet.manifest.clips[clip]) return false
  const key = `crop:${plot.uid}`
  if (grown && !swayStarted.has(plot.uid)) {
    swayStarted.add(plot.uid)
    seekActorClip(key, clip, (plot.uid % 4) * 200)
  }
  ctx.save()
  ctx.translate(plot.x, plot.y + 2)
  if (stage < 3) {
    const wobble = 1 + Math.sin(time * 7 + plot.uid) * 0.03
    ctx.scale(wobble, 1)
  }
  drawNamedClip(ctx, sheet, key, clip, 1 / 60, { scale: gardenDrawScale(), alpha: 1 })
  ctx.restore()
  wobbleStarted.add(plot.uid)
  return true
}

export function drawGardenPeaBush(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, uid: number): boolean {
  const sheet = gardenSheet()
  if (!sheet?.manifest.clips.pea_sway && !sheet?.manifest.clips.pea_stage3) return false
  const clip = sheet.manifest.clips.pea_sway ? 'pea_sway' : 'pea_stage3'
  ctx.save()
  ctx.translate(x, y + 2)
  ctx.globalAlpha = alpha
  drawNamedClip(ctx, sheet, `peabush:${uid}`, clip, 0, { scale: gardenDrawScale(), alpha: 1 })
  ctx.restore()
  return true
}
