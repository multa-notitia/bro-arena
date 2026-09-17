import { Rng } from '../core/math.ts'
import type {
  AudioApi,
  CharacterDef,
  InputApi,
  LevelUpOption,
  RenderApi,
  RunPhase,
  UiApi,
  World,
} from '../core/types.ts'
import { CHARACTERS, characterById } from '../data/characters.ts'
import { rollLevelUps } from '../data/levelups.ts'
import { WAVE_COUNT, waveDef } from '../data/waves.ts'
import { peekKillSource, takeKillSource } from './combat.ts'
import { updateEnemies } from './enemies.ts'
import { applyLevelUp } from './levelup.ts'
import { collectAllNow, magnetAll, updatePickups } from './pickups.ts'
import { updatePlayer } from './player.ts'
import { updateProjectiles } from './projectiles.ts'
import {
  buildShopView,
  buyOffer,
  emptySession,
  generateOffers,
  rerollOffers,
  sellWeapon,
  toggleLock,
  type ShopSession,
} from './shop.ts'
import { hudSnapshot, runSummary } from './snapshots.ts'
import { updateWeapons } from './weapons.ts'
import { beginWave, settleWave, updateDirector } from './waves.ts'
import { createWorld, syncViewport, updateCamera, updateTrees, type SimCtx } from './world.ts'

export interface RunDeps {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  render: RenderApi
  ui: UiApi
  audio: AudioApi
  input: InputApi
}

export class Run {
  private deps: RunDeps
  private _phase: RunPhase = 'boot'
  private world: World | null = null
  private rng: Rng
  private lastNow = 0
  private bootT = 0
  private shop: ShopSession = emptySession()
  private killedBy: string | null = null
  private deathTimer = 0
  private dying = false
  private fps = 60
  private fpsAcc = 0
  private fpsFrames = 0
  private settling = false
  private settleT = 0
  private transitioning = false
  private chosen: CharacterDef | null = null
  private levelOptions: LevelUpOption[] = []

  constructor(deps: RunDeps) {
    this.deps = deps
    this.rng = new Rng()
  }

  get phase(): RunPhase {
    return this._phase
  }

  start(): void {
    const { ui, audio } = this.deps
    this._phase = 'boot'
    this.bootT = 0
    this.lastNow = 0
    ui.setHudVisible(false)
    ui.setJoystickVisible(false)
    ui.setBootCopy('Peeling the paddock…')
    ui.setBootCopy('Peeling the paddock…')
