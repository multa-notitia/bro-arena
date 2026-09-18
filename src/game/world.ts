import { clamp, damp, Rng } from '../core/math.ts'
import type {
  AudioApi,
  CharacterDef,
  Form,
  RenderApi,
  Tree,
  UiApi,
  Vec,
  WaveDef,
  World,
} from '../core/types.ts'
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
  form: Form = 'normal',
): World {
  const player = createPlayer(character, form)
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
    camera: { x: player.x, y: player.y, w: viewW, h: viewH, shake: 0, zoom: 1 },
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
  // ~1050 world px across on desktop so the vegetable reads at a playable size.
  // ~780 world px across on desktop so faces and limbs read; phones stay wider.
  world.camera.zoom = clamp(world.camera.w / 780, 1.0, 2.4)
}

export function clampToArena(world: World, x: number, y: number, r: number): Vec {
  return {
    x: clamp(x, -world.arenaHalfW + r, world.arenaHalfW - r),
    y: clamp(y, -world.arenaHalfH + r, world.arenaHalfH - r),
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
  cam.shake = damp(cam.shake, 0, 7, dt)
  if (cam.shake < 0.05) cam.shake = 0
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
