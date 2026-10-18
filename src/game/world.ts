import { clamp, damp, Rng } from '../core/math.ts'
import { FEEL } from '../feel.ts'
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

export const ARENA_W = 1700
export const ARENA_H = 1150
export const ARENA_HALF_W = 850
export const ARENA_HALF_H = 575

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
  return {
    time: 0,
    waveTime: 0,
    wave: wdef.index,
    waveDef: wdef,
    waveLeft: wdef.duration,
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
  world.camera.zoom = clamp(
    world.camera.w / FEEL.camera.worldWidth,
    FEEL.camera.zoomMin,
    FEEL.camera.zoomMax,
  )
}

export function clampToArena(world: World, x: number, y: number, r: number): Vec {
  return {
    x: clamp(x, -world.arenaHalfW + r, world.arenaHalfW - r),
    y: clamp(y, -world.arenaHalfH + r, world.arenaHalfH - r),
  }
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
  cam.x = damp(cam.x, p.x, 8, dt)
  cam.y = damp(cam.y, p.y, 8, dt)
  const zoom = cam.zoom || 1
  const halfW = cam.w / (2 * zoom)
  const halfH = cam.h / (2 * zoom)
  const maxX = Math.max(0, world.arenaHalfW - halfW)
  const maxY = Math.max(0, world.arenaHalfH - halfH)
  cam.x = clamp(cam.x, -maxX, maxX)
  cam.y = clamp(cam.y, -maxY, maxY)
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
