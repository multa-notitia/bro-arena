import { damp, Rng } from '../core/math.ts'
import type {
  AudioApi,
  CharacterDef,
  CropId,
  InputApi,
  LevelUpOption,
  ModelDir,
  PaintStyle,
  RenderApi,
  RunPhase,
  UiApi,
  World,
} from '../core/types.ts'
import { GATE_CHARACTERS, characterById } from '../data/characters.ts'
import { rollLevelUps } from '../data/levelups.ts'
import { WAVE_COUNT, waveDef } from '../data/waves.ts'
import { peekKillSource, takeKillSource } from './combat.ts'
import { nightmaresAlive, updateEnemies } from './enemies.ts'
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
import {
  buyFarmOffer,
  buildFarmShopView,
  emptyFarmSession,
  generateFarmOffers,
  rerollFarmOffers,
  toggleFarmLock,
  type FarmShopSession,
} from './farmshop.ts'
import { hudSnapshot, runSummary } from './snapshots.ts'
import { updateWeapons } from './weapons.ts'
import { beginWave, settleWave, updateDirector } from './waves.ts'
import { clearPlots, plantView, selectCrop, syncFarmUnlocks, togglePlot } from './farm.ts'
import { createWorld, syncViewport, updateCamera, updateTrees, type SimCtx } from './world.ts'
import { defaultModelForSpecies, getLastModel, getPaintStyle, modelsForSpecies, setLastModel, setPaintStyle } from '../render/look.ts'
import { isConceptAReady, preloadConceptA } from '../render/conceptA.ts'
import { isBoardReady, preloadBoard } from '../render/board.ts'

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
  private farmShop: FarmShopSession = emptyFarmSession()
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
  private chosenModel: ModelDir = 'b'
  private levelOptions: LevelUpOption[] = []
  private musicT = 0
  private plantFirst = true

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
    ui.setBootCopy('Wetting the paper…')
    ui.showScreen('boot')
    void preloadConceptA().catch(() => {
      /* painted chili falls back to Wash if the sheet fails to load */
    })
    void preloadBoard().catch(() => {
      /* board radish falls back to Wash if the cut frames fail to load */
    })
    ui.onPauseRequest(() => this.requestPause())
    ui.onTitle({
      play: () => this.playFromTitle(),
      toggleMute: () => this.toggleMute(),
      muted: audio.muted,
      paintStyle: getPaintStyle(),
      setPaintStyle: (s: PaintStyle) => this.changePaintStyle(s),
    })
  }

  frame(now: number): void {
    if (this.lastNow === 0) this.lastNow = now
    const raw = (now - this.lastNow) / 1000
    this.lastNow = now
    const dt = Math.min(raw, 1 / 30)

    this.fpsAcc += raw
    this.fpsFrames += 1
    if (this.fpsAcc >= 0.4) {
      this.fps = this.fpsFrames / this.fpsAcc
      this.fpsAcc = 0
      this.fpsFrames = 0
    }

    this.handleGlobalInput()

    if (this._phase === 'boot') {
      this.bootT += dt
      if (this.bootT > 0.2) this.deps.ui.setBootCopy('The soil is settling.')
      if (this.bootT > 0.45 && isConceptAReady() && isBoardReady()) this.enterTitle()
      else if (this.bootT > 1.8) this.enterTitle()
      return
    }

    const world = this.world
    if (world) {
      syncViewport(world, this.deps.canvas)
      if (this._phase === 'wave' && !world.paused && !this.transitioning) {
        this.tickWave(world, dt)
      } else if (this._phase === 'plant' || this._phase === 'farmshop') {
        for (const plot of world.farm.plots) plot.sway += dt
        world.camera.x = damp(world.camera.x, 0, 5, dt)
        world.camera.y = damp(world.camera.y, 0, 5, dt)
      }
      this.deps.render.draw(this.deps.ctx, world, dt)
      if (this._phase === 'wave' || this._phase === 'paused') {
        this.deps.ui.renderHud(hudSnapshot(world, this.fps))
      }
    }
  }

  private sim(): SimCtx {
    return {
      render: this.deps.render,
      audio: this.deps.audio,
      ui: this.deps.ui,
      rng: this.rng,
    }
  }

  private handleGlobalInput(): void {
    const { input } = this.deps
    if (input.consume('KeyM')) this.toggleMute()

    if (this._phase === 'wave') {
      if (input.consume('KeyP') || input.consume('Escape')) this.requestPause()
    } else if (this._phase === 'paused') {
      if (input.consume('KeyP') || input.consume('Escape')) this.resume()
    }
  }

  private toggleMute(): void {
    const { audio, ui } = this.deps
    audio.setMuted(!audio.muted)
    if (this._phase === 'title') {
      ui.onTitle({
        play: () => this.playFromTitle(),
        toggleMute: () => this.toggleMute(),
        muted: audio.muted,
        paintStyle: getPaintStyle(),
        setPaintStyle: (s: PaintStyle) => this.changePaintStyle(s),
      })
    } else if (this._phase === 'paused' && this.world) {
      this.renderPause()
    }
  }

  private playFromTitle(): void {
    const { audio } = this.deps
    audio.unlock()
    audio.play('uiClick')
    this.enterCharSelect()
  }

  private enterTitle(): void {
    const { ui, audio } = this.deps
    this.world = null
    this.dying = false
    this.settling = false
    this.transitioning = false
    this.shop = emptySession()
    this.farmShop = emptyFarmSession()
    this._phase = 'title'
    ui.setHudVisible(false)
    ui.setJoystickVisible(false)
    ui.showScreen('title')
    audio.setMusic('title')
    ui.onTitle({
      play: () => this.playFromTitle(),
      toggleMute: () => this.toggleMute(),
      muted: audio.muted,
      paintStyle: getPaintStyle(),
      setPaintStyle: (s: PaintStyle) => this.changePaintStyle(s),
    })
  }

  private enterCharSelect(): void {
    this._phase = 'charselect'
    this.deps.ui.showScreen('charselect')
    this.deps.ui.renderCharSelect(GATE_CHARACTERS, (id, model) => this.pickCharacter(id, model))
  }

  private pickCharacter(id: string, model: ModelDir = getLastModel()): void {
    const { audio, canvas } = this.deps
    audio.unlock()
    audio.play('uiClick')
    const ch = characterById(id)
    this.chosen = ch
    const allowed = modelsForSpecies(ch.species)
    this.chosenModel = allowed.includes(model) ? model : defaultModelForSpecies(ch.species)
    setLastModel(model)
    this.rng = new Rng()
    this.killedBy = null
    this.dying = false
    this.settling = false
    this.shop = emptySession()
    this.farmShop = emptyFarmSession()
    this.deps.render.fx.clear()
    this.world = createWorld(
      ch,
      waveDef(1),
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
      model,
    )
    this.enterPlant(true)
  }

  private enterPlant(first: boolean): void {
    if (!this.world) return
    this.plantFirst = first
    this._phase = 'plant'
    this.world.paused = true
    const nextWave = first ? Math.max(1, this.world.wave) : this.world.wave + 1
    syncFarmUnlocks(this.world.farm, nextWave, this.world.player.stats.luck)
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('plant')
    this.deps.audio.setMusic('shop')
    this.renderPlant()
  }

  private renderPlant(): void {
    if (!this.world) return
    const world = this.world
    this.deps.ui.renderPlant(plantView(world, this.plantFirst), {
      select: (crop: CropId) => {
        selectCrop(world.farm, crop)
        this.deps.audio.play('uiHover')
        this.renderPlant()
      },
      togglePlot: (index: number) => {
        if (togglePlot(world.farm, index)) this.deps.audio.play('uiClick')
        else this.deps.audio.play('uiHover')
        this.renderPlant()
      },
      clear: () => {
        clearPlots(world.farm)
        this.deps.audio.play('uiClick')
        this.renderPlant()
      },
      sow: () => this.sowAndGo(),
    })
  }

  private sowAndGo(): void {
    if (!this.world || this.transitioning) return
    this.deps.audio.play('uiClick')
    if (this.plantFirst) {
      this.transitioning = true
      this.deps.ui.showScreen(null)
      this.deps.ui.setHudVisible(false)
      this.deps.render.fx.transition('inkWipe', () => {
        if (!this.world) return
        beginWave(this.world, this.sim(), 1)
        this.enterWaveView()
        this.transitioning = false
      })
      return
    }
    this.enterShop()
  }

  private enterFarmShop(): void {
    if (!this.world) return
    this._phase = 'farmshop'
    this.world.paused = true
    syncFarmUnlocks(this.world.farm, this.world.wave + 1, this.world.player.stats.luck)
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('farmshop')
    this.deps.audio.setMusic('shop')
    const locked = this.farmShop.offers.filter((o) => o.locked)
    this.farmShop.rerolls = 0
    this.farmShop.offers = generateFarmOffers(this.world, this.sim(), locked)
    this.renderFarmShop()
  }

  private renderFarmShop(): void {
    if (!this.world) return
    const world = this.world
    this.deps.ui.renderFarmShop(buildFarmShopView(world, this.farmShop), {
      buy: (offerUid) => {
        buyFarmOffer(world, this.sim(), this.farmShop, offerUid)
        this.renderFarmShop()
      },
      toggleLock: (offerUid) => {
        toggleFarmLock(this.sim(), this.farmShop, offerUid)
        this.renderFarmShop()
      },
      reroll: () => {
        rerollFarmOffers(world, this.sim(), this.farmShop)
        this.renderFarmShop()
      },
      next: () => this.enterPlant(false),
    })
  }

  private enterWaveView(): void {
    if (!this.world) return
    this._phase = 'wave'
    this.world.paused = false
    this.world.slowMo = 1
    this.settling = false
    this.dying = false
    this.deps.ui.showScreen(null)
    this.deps.ui.setHudVisible(true)
    this.deps.ui.setJoystickVisible(this.deps.input.coarse)
    this.musicT = 2
    this.syncWaveMusic(this.world)
  }

  private syncWaveMusic(world: World): void {
    if (world.boss && world.boss.state !== 'dying' && world.boss.hp > 0) {
      this.deps.audio.setMusic('boss')
      return
    }
    if (nightmaresAlive(world) >= 5) {
      this.deps.audio.setMusic('nightmare')
      return
    }
    this.deps.audio.setMusic('wave')
  }

  private tickWave(world: World, dt: number): void {
    const ctx = this.sim()
    const simDt = dt * world.slowMo
    world.time += simDt
    this.deps.ui.setJoystickVisible(this.deps.input.coarse)
    this.musicT += simDt
    if (this.musicT >= 2) {
      this.musicT = 0
      this.syncWaveMusic(world)
    }

    if (this.dying) {
      this.deathTimer -= dt
      updatePlayer(world, simDt, { x: 0, y: 0 }, ctx)
      world.player.anim.deathT = Math.min(1, (0.6 - this.deathTimer) / 0.45)
      updateEnemies(world, simDt, ctx)
      updateProjectiles(world, simDt, ctx)
      updatePickups(world, simDt, ctx)
      updateTrees(world, simDt)
      updateCamera(world, simDt)
      if (this.deathTimer <= 0) this.enterGameOver()
      return
    }

    const move = this.deps.input.sample()
    updatePlayer(world, simDt, move, ctx)
    if (!this.settling) updateWeapons(world, simDt, ctx)
    updateProjectiles(world, simDt, ctx)
    updateEnemies(world, simDt, ctx)
    updatePickups(world, simDt, ctx)
    updateTrees(world, simDt)

    if (!this.settling) {
      const ended = updateDirector(world, simDt, ctx)
      if (ended) {
        this.settling = true
        this.settleT = 1
        settleWave(world, ctx)
      }
    } else {
      magnetAll(world)
      this.settleT -= simDt
      if (this.settleT <= 0) {
        collectAllNow(world, ctx)
        this.afterWave()
        return
      }
    }

    updateCamera(world, simDt)

    if (world.player.hp <= 0 && !this.dying) {
      this.dying = true
      this.deathTimer = 0.6
      world.slowMo = 0.22
      world.player.anim.deathT = 0
      this.killedBy = peekKillSource() ?? takeKillSource() ?? 'the soil'
      this.deps.ui.setJoystickVisible(false)
    }
  }

  private afterWave(): void {
    if (!this.world) return
    if (this.world.player.pendingLevelUps > 0) this.enterLevelUp()
    else if (this.world.wave >= WAVE_COUNT) this.enterVictory()
    else this.enterFarmShop()
  }

  private enterLevelUp(): void {
    if (!this.world) return
    this._phase = 'levelup'
    this.world.paused = true
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('levelup')
    this.deps.audio.setMusic('shop')
    this.showLevelCards()
  }

  private showLevelCards(): void {
    if (!this.world) return
    const luck = this.world.player.stats.luck
    this.levelOptions = rollLevelUps(this.rng, luck, this.world.wave, 4)
    this.deps.ui.renderLevelUp(this.levelOptions, this.world.player.pendingLevelUps, (id) => this.pickLevel(id))
  }

  private pickLevel(id: string): void {
    if (!this.world) return
    const option = this.levelOptions.find((o) => o.id === id)
    if (!option) return
    this.deps.audio.play('uiClick')
    applyLevelUp(this.world.player, option)
    this.world.player.pendingLevelUps = Math.max(0, this.world.player.pendingLevelUps - 1)
    if (this.world.player.pendingLevelUps > 0) this.showLevelCards()
    else if (this.world.wave >= WAVE_COUNT) this.enterVictory()
    else this.enterFarmShop()
  }

  private enterShop(): void {
    if (!this.world) return
    this._phase = 'shop'
    this.world.paused = true
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('shop')
    this.deps.audio.setMusic('shop')
    const locked = this.shop.offers.filter((o) => o.locked)
    this.shop.rerolls = 0
    this.shop.freeUsed = 0
    this.shop.offers = generateOffers(this.world, this.sim(), locked)
    this.renderShop()
  }

  private renderShop(): void {
    if (!this.world) return
    const world = this.world
    this.deps.ui.renderShop(buildShopView(world, this.shop), {
      buy: (offerUid) => {
        if (buyOffer(world, this.sim(), this.shop, offerUid)) this.renderShop()
        else this.renderShop()
      },
      toggleLock: (offerUid) => {
        toggleLock(this.sim(), this.shop, offerUid)
        this.renderShop()
      },
      reroll: () => {
        rerollOffers(world, this.sim(), this.shop)
        this.renderShop()
      },
      sell: (weaponUid) => {
        sellWeapon(world, this.sim(), weaponUid)
        this.renderShop()
      },
      next: () => this.nextWave(),
    })
  }

  private nextWave(): void {
    if (!this.world || this.transitioning) return
    this.deps.audio.play('uiClick')
    this.transitioning = true
    this.deps.ui.showScreen(null)
    this.deps.ui.setHudVisible(false)
    const next = this.world.wave + 1
    this.deps.render.fx.transition(
      'inkWipe',
      () => {
        if (!this.world) return
        beginWave(this.world, this.sim(), next)
        this.enterWaveView()
        this.transitioning = false
      },
    )
  }

  private requestPause(): void {
    if (this._phase !== 'wave' || !this.world) return
    if (this.dying || this.settling || this.transitioning) return
    this._phase = 'paused'
    this.world.paused = true
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('paused')
    this.renderPause()
  }

  private renderPause(): void {
    if (!this.world) return
    this.deps.ui.renderPause(buildShopView(this.world, this.shop), {
      resume: () => this.resume(),
      quit: () => {
        this.deps.audio.play('uiClick')
        this.enterTitle()
      },
      toggleMute: () => this.toggleMute(),
      muted: this.deps.audio.muted,
      paintStyle: getPaintStyle(),
      setPaintStyle: (s: PaintStyle) => this.changePaintStyle(s),
    })
  }

  private resume(): void {
    if (this._phase !== 'paused' || !this.world) return
    this.deps.audio.play('uiClick')
    this.enterWaveView()
  }

  private enterGameOver(): void {
    if (!this.world) return
    this._phase = 'gameover'
    this.world.paused = true
    const killedBy = this.killedBy ?? takeKillSource() ?? 'the Mud'
    this.deps.audio.play('gameOver')
    this.deps.audio.setMusic('none')
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('gameover')
    this.deps.ui.renderGameOver(runSummary(this.world, { won: false, killedBy }), {
      retry: () => this.retry(),
      title: () => this.enterTitle(),
    })
  }

  private enterVictory(): void {
    if (!this.world) return
    this._phase = 'victory'
    this.world.paused = true
    this.deps.audio.play('victory')
    this.deps.audio.setMusic('title')
    this.deps.ui.setHudVisible(false)
    this.deps.ui.setJoystickVisible(false)
    this.deps.ui.showScreen('victory')
    this.deps.ui.renderVictory(runSummary(this.world, { won: true, killedBy: null }), {
      again: () => this.retry(),
      title: () => this.enterTitle(),
    })
  }

  private changePaintStyle(style: PaintStyle): void {
    setPaintStyle(style)
    this.deps.audio.play('uiClick')
    if (this._phase === 'title') {
      this.deps.ui.onTitle({
        play: () => this.playFromTitle(),
        toggleMute: () => this.toggleMute(),
        muted: this.deps.audio.muted,
        paintStyle: getPaintStyle(),
        setPaintStyle: (s: PaintStyle) => this.changePaintStyle(s),
      })
    } else if (this._phase === 'paused') {
      this.renderPause()
    } else if (this._phase === 'charselect') {
      this.enterCharSelect()
    }
  }

  private retry(): void {
    if (!this.chosen) {
      this.enterCharSelect()
      return
    }
    this.deps.audio.unlock()
    this.deps.audio.play('uiClick')
    this.pickCharacter(this.chosen.id, this.chosenModel)
  }
}
