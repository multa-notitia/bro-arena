import { clamp, damp, Rng } from '../core/math.ts'
import { CHAOS, getCameraZoom } from '../data/chaos.ts'
import { FEEL } from '../feel.ts'
import { cameraLimits, resetBeds, revealLook, zoomFloorForArena } from './beds.ts'
import type {
  AudioApi,
  CharacterDef,
  ModelDir,
  RenderApi,
  Tree,
  UiApi,
  Vec,
  WaveDef,
  World,
} from '../core/types.ts'
import { createFarm } from './farm.ts'
import { createPlayer } from './player.ts'

/** Starting centre bed. Live bounds come from src/data/beds.ts. */
export const ARENA_W = 1024
export const ARENA_H = 768
export const ARENA_HALF_W = 512
export const ARENA_HALF_H = 384

export interface SimCtx {
  render: RenderApi
  audio: AudioApi
  ui: UiApi
  rng: Rng
}

export function createWorld(
  character: CharacterDef,
  wdef: WaveDef,
  viewW: number,
  viewH: number,
  model: ModelDir = 'b',
): World {
  const player = createPlayer(character, model)
  const world = {
    time: 0,
    waveTime: 0,
    wave: wdef.index,
    waveDef: wdef,
    waveLeft: wdef.duration,
    arenaMinX: -ARENA_HALF_W,
    arenaMaxX: ARENA_HALF_W,
    arenaMinY: -ARENA_HALF_H,
    arenaMaxY: ARENA_HALF_H,
    arenaHalfW: ARENA_HALF_W,
    arenaHalfH: ARENA_HALF_H,
    player,
    enemies: [],
    projectiles: [],
    pickups: [],
    trees: [],
    markers: [],
    farm: createFarm(),
    camera: {
      x: player.x,
      y: player.y,
      prevX: player.x,
      prevY: player.y,
      w: viewW,
      h: viewH,
      shake: 0,
      shakeDirX: 0,
      shakeDirY: 1,
      zoom: 1,
    },
    renderAlpha: 1,
    boss: null,
    paused: false,
    slowMo: 1,
  }
  resetBeds(world)
  return world
}

export function resetForWave(world: World, wdef: WaveDef): void {
  world.wave = wdef.index
  world.waveDef = wdef
  world.waveTime = 0
  world.waveLeft = wdef.duration
  world.enemies = []
  world.projectiles = []
  world.pickups = []
  world.trees = []
  world.markers = []
  world.boss = null
  world.slowMo = 1
  world.paused = false
}

export function syncViewport(world: World, canvas: HTMLCanvasElement): void {
  const w = canvas.clientWidth || canvas.width
  const h = canvas.clientHeight || canvas.height
  world.camera.w = Math.max(1, w)
  world.camera.h = Math.max(1, h)
  let zoom = clamp(
    (world.camera.w / FEEL.camera.worldWidth) * getCameraZoom(),
    FEEL.camera.zoomMin,
    FEEL.camera.zoomMax,
  )
  const floor = zoomFloorForArena(world, world.camera.w, world.camera.h)
  if (zoom < floor) zoom = Math.min(floor, FEEL.camera.zoomMax)
  world.camera.zoom = zoom
}

export function clampToArena(world: World, x: number, y: number, r: number): Vec {
  return {
    x: clamp(x, world.arenaMinX + r, world.arenaMaxX - r),
    y: clamp(y, world.arenaMinY + r, world.arenaMaxY - r),
  }
}

export interface ViewRect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Visible world rect at the current zoom, grown by `pad` world px. */
export function zoomedView(world: World, pad = 0): ViewRect {
  const zoom = Math.max(0.05, world.camera.zoom || 1)
  const hw = world.camera.w / (2 * zoom) + pad
  const hh = world.camera.h / (2 * zoom) + pad
  return {
    minX: world.camera.x - hw,
    maxX: world.camera.x + hw,
    minY: world.camera.y - hh,
    maxY: world.camera.y + hh,
  }
}

export function inZoomedView(world: World, x: number, y: number, pad = 0): boolean {
  const v = zoomedView(world, pad)
  return x >= v.minX && x <= v.maxX && y >= v.minY && y <= v.maxY
}

/**
 * A point inside the open beds and outside the zoomed view, so a spawn
 * does not pop into a zoomed-out frame.
 */
export function spawnOutsideView(
  world: World,
  rng: { range(a: number, b: number): number },
  minDist = 0,
  margin = 28,
): { x: number; y: number } {
  const minX = world.arenaMinX + margin
  const maxX = world.arenaMaxX - margin
  const minY = world.arenaMinY + margin
  const maxY = world.arenaMaxY - margin
  if (maxX <= minX || maxY <= minY) {
    return {
      x: (world.arenaMinX + world.arenaMaxX) * 0.5,
      y: (world.arenaMinY + world.arenaMaxY) * 0.5,
    }
  }
  const view = zoomedView(world, 64)
  const px = world.player.x
  const py = world.player.y
  for (let i = 0; i < 28; i++) {
    const x = rng.range(minX, maxX)
    const y = rng.range(minY, maxY)
    if (x > view.minX && x < view.maxX && y > view.minY && y < view.maxY) continue
    if (minDist > 0 && Math.hypot(x - px, y - py) < minDist) continue
    return { x, y }
  }
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ]
  let best = corners[0]!
  let bestD = -1
  for (const c of corners) {
    const d = Math.hypot(c.x - world.camera.x, c.y - world.camera.y)
    if (d > bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** Remember where everyone was so the next frame can blend into the new pose. */
export function captureRenderPoses(world: World): void {
  const p = world.player
  p.prevX = p.x
  p.prevY = p.y
  world.camera.prevX = world.camera.x
  world.camera.prevY = world.camera.y
  for (const e of world.enemies) {
    e.prevX = e.x
    e.prevY = e.y
  }
}

/** Menus and pauses draw the sim pose itself. */
export function pinRenderPoses(world: World): void {
  captureRenderPoses(world)
  world.renderAlpha = 1
}

/**
 * Move actors and the camera to the blended pose for drawing.
 * Returns a function that puts the sim coordinates back.
 */
export function presentRenderPoses(world: World): () => void {
  const a = world.renderAlpha
  const p = world.player
  const cam = world.camera
  const savedP = { x: p.x, y: p.y }
  const savedC = { x: cam.x, y: cam.y }
  const savedE = world.enemies.map((e) => ({ e, x: e.x, y: e.y }))
  const mix = (prev: number, curr: number) => prev + (curr - prev) * a
  p.x = mix(p.prevX, p.x)
  p.y = mix(p.prevY, p.y)
  cam.x = mix(cam.prevX, cam.x)
  cam.y = mix(cam.prevY, cam.y)
  for (const e of world.enemies) {
    e.x = mix(e.prevX, e.x)
    e.y = mix(e.prevY, e.y)
  }
  return () => {
    p.x = savedP.x
    p.y = savedP.y
    cam.x = savedC.x
    cam.y = savedC.y
    for (const row of savedE) {
      row.e.x = row.x
      row.e.y = row.y
    }
  }
}

export function updateCamera(world: World, dt: number): void {
  const cam = world.camera
  const p = world.player
  const look = CHAOS.read.lookAhead
  const lookMax = CHAOS.read.lookAheadMax
  let tx = p.x + clamp(p.vx * look, -lookMax, lookMax)
  let ty = p.y + clamp(p.vy * look, -lookMax, lookMax)
  const lookAt = revealLook()
  if (lookAt) {
    tx = tx + (lookAt.x - tx) * lookAt.pull
    ty = ty + (lookAt.y - ty) * lookAt.pull
  }
  cam.x = damp(cam.x, tx, CHAOS.read.followRate, dt)
  cam.y = damp(cam.y, ty, CHAOS.read.followRate, dt)
  const zoom = cam.zoom || 1
  const halfW = cam.w / (2 * zoom)
  const halfH = cam.h / (2 * zoom)
  const lim = cameraLimits(world)
  const minCamX = lim.minX + halfW
  const maxCamX = lim.maxX - halfW
  const minCamY = lim.minY + halfH
  const maxCamY = lim.maxY - halfH
  cam.x = minCamX <= maxCamX ? clamp(cam.x, minCamX, maxCamX) : (lim.minX + lim.maxX) * 0.5
  cam.y = minCamY <= maxCamY ? clamp(cam.y, minCamY, maxCamY) : (lim.minY + lim.maxY) * 0.5
  cam.shake = damp(cam.shake, 0, FEEL.shake.decay, dt)
  if (cam.shake < 0.05) {
    cam.shake = 0
    cam.shakeDirX = 0
    cam.shakeDirY = 1
  }
}

export function updateTrees(world: World, dt: number): void {
  const keep: Tree[] = []
  for (const tree of world.trees) {
    if (tree.hp <= 0) continue
    tree.sway += dt
    tree.hitFlash = Math.max(0, tree.hitFlash - dt * 5)
    keep.push(tree)
  }
  world.trees = keep
}

export function accentColor(world: World): string {
  return world.player.character.palette.accent
}
