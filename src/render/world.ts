import { TAU, clamp, dist, ease, hashNoise, lerp } from '../core/math.ts'
import { CHAOS, fxOn } from '../data/chaos.ts'
import { comboCount, corpseClipName, deathClipName } from '../game/chaosJuice.ts'
import { vineOf } from '../game/emerge.ts'
import { hopHeight, isLeaping } from '../game/leap.ts'
import { cameraShakeOffset, FEEL } from '../feel.ts'
import type {
  Enemy,
  Form,
  FxApi,
  ModelDir,
  Pickup,
  Player,
  Projectile,
  SpawnMarker,
  Tree,
  WeaponBehavior,
  WeaponDef,
  WeaponId,
  World,
} from '../core/types.ts'
import { ENEMIES } from '../data/enemies.ts'
import { WEAPONS } from '../data/weapons.ts'
import {
  glowOf,
  creatureSprite,
  handLocal,
  mudOf,
  paintLiveFeatures,
  resolveMouth,
  resolveScream,
  resolveSpecies,
  screamScale,
  sizeBucket,
  speciesRig,
  SPECIES_PALETTES,
} from './creatures.ts'
import { boardKnifeSlash, getPaintStyle, proceduralModel, usesBoardArt, usesPaintedArt } from './look.ts'
import { drawPaintedChili } from './conceptA.ts'
import { drawBoard, drawBoardShadow, poseBoard, boardHeld, type BoardHero } from './board.ts'
import { drawFarmBeds, drawFarmPlant, drawFarmRows } from './crops.ts'
import { drawPaddock } from './ground.ts'
import { paperColor } from './paintLang.ts'
import { drawMultiArm, multiArmSheet, potatoMultiArm } from './multiarm.ts'
import { enemySpawnClip } from '../game/enemies.ts'
import { presentRenderPoses } from '../game/world.ts'
import {
  actorClipActive,
  actorFootprint,
  drawActorSheet,
  drawNamedClip,
  gardenGround,
  locomotionBlend,
  pickClip,
  resolveSheet,
  sheetById,
  sheetKeysForPlayer,
} from './sheets.ts'
import { hasClip, resolveEnemySheet } from './chaosSheets.ts'
import { drawChaosFloor, drawChaosMarker, drawComboHud, drawFunnyBursts, drawLeapShadow, tickChaosFx } from './chaosFx.ts'
import {
  markerSprite,
  pickupSprite,
  projectileSprite,
  qualityBucket,
  type SpriteCache,
  treeSprite,
  weaponSprite,
} from './sprites.ts'
import {
  n01,
  rgba,
  vignette,
} from './watercolor.ts'

export interface ViewSize {
  w: number
  h: number
  dpr: number
}

const cmds: { y: number; z: number; kind: number; idx: number }[] = []
let cmdN = 0

function pushCmd(y: number, z: number, kind: number, idx: number): void {
  const c = cmds[cmdN]
  if (c) {
    c.y = y
    c.z = z
    c.kind = kind
    c.idx = idx
  } else {
    cmds[cmdN] = { y, z, kind, idx }
  }
  cmdN++
}

function slotOffset(slot: number, r: number): { x: number; y: number; a: number } {
  const a = -Math.PI / 2 + (slot / 6) * TAU
  return { x: Math.cos(a) * r * 1.62, y: Math.sin(a) * r * 1.18, a }
}

function weaponLook(id: WeaponId): WeaponDef {
  return WEAPONS[id]
}

let qScale = 2

function blit(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  worldScale: number,
  alpha = 1,
): void {
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const s = worldScale / qScale
  ctx.scale(s, s)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()
}

let rimBake: HTMLCanvasElement | null = null
let rimBakeCtx: CanvasRenderingContext2D | null = null
let rimRing: HTMLCanvasElement | null = null
let rimRingCtx: CanvasRenderingContext2D | null = null
const RIM_BAKE = 384

function ensureRimCanvases(): { body: CanvasRenderingContext2D; ring: CanvasRenderingContext2D } | null {
  if (!rimBake) {
    rimBake = document.createElement('canvas')
    rimBake.width = RIM_BAKE
    rimBake.height = RIM_BAKE
    rimBakeCtx = rimBake.getContext('2d')
  }
  if (!rimRing) {
    rimRing = document.createElement('canvas')
    rimRing.width = RIM_BAKE
    rimRing.height = RIM_BAKE
    rimRingCtx = rimRing.getContext('2d')
  }
  if (!rimBakeCtx || !rimRingCtx) return null
  return { body: rimBakeCtx, ring: rimRingCtx }
}

/** Tight cream outline: dilate sprite alpha, no blur. */
function paintWithRim(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  paint: (c: CanvasRenderingContext2D) => void,
): void {
  const layers = ensureRimCanvases()
  const bake = rimBake
  const ring = rimRing
  if (!layers || !bake || !ring) {
    paint(ctx)
    return
  }
  const { body: g, ring: rg } = layers
  const m = ctx.getTransform()
  const zoom = (Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d)) * 0.5 || 1
  const o = CHAOS.read.heroRimPx * zoom
  const mid = RIM_BAKE * 0.5
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, RIM_BAKE, RIM_BAKE)
  g.setTransform(
    m.a,
    m.b,
    m.c,
    m.d,
    mid - (m.a * originX + m.c * originY),
    mid - (m.b * originX + m.d * originY),
  )
  paint(g)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = CHAOS.read.heroRim
  g.fillRect(0, 0, RIM_BAKE, RIM_BAKE)
  g.globalCompositeOperation = 'source-over'

  rg.setTransform(1, 0, 0, 1, 0, 0)
  rg.clearRect(0, 0, RIM_BAKE, RIM_BAKE)
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU
    rg.drawImage(bake, Math.cos(a) * o, Math.sin(a) * o)
  }
  rg.globalCompositeOperation = 'destination-out'
  rg.drawImage(bake, 0, 0)
  rg.globalCompositeOperation = 'source-over'

  const sx = m.a * originX + m.c * originY + m.e
  const sy = m.b * originX + m.d * originY + m.f
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha *= CHAOS.read.heroRimAlpha
  ctx.drawImage(ring, sx - mid, sy - mid)
  ctx.restore()
  paint(ctx)
}

function smearTint(id: WeaponId, fallback: string): string {
  switch (id) {
    case 'knife':
      return '#c5d0b4'
    case 'hammer':
      return '#e2b45a'
    case 'fist':
      return '#edd6c4'
    case 'stick':
      return '#c4a06a'
    case 'sword':
      return '#d5dde6'
    case 'spear':
      return '#cbb48a'
    case 'scythe':
      return '#9aaa72'
    default:
      return fallback
  }
}

/** Curved swing stroke. Dies in smearLife seconds of a typical 0.18s swing. */
function smearFade(swingT: number): number {
  if (swingT < 0) return 0
  const real = swingT * 0.18
  return clamp(1 - real / CHAOS.read.smearLife, 0, 1)
}

/** Soft contact shadow. `footprint` is the painted body width; the ellipse stays under 0.8× that. */
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, footprint: number, strength = 1): void {
  const width = Math.max(6, footprint * FEEL.shadow.footprint)
  const peak = FEEL.shadow.alpha * clamp(strength, 0, 1)
  if (peak < 0.02) return
  const radius = width * 0.5
  ctx.save()
  ctx.translate(x, y + 1)
  ctx.scale(1, 0.42)
  const g = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius)
  g.addColorStop(0, `rgba(58, 36, 22, ${peak.toFixed(3)})`)
  g.addColorStop(0.62, `rgba(58, 36, 22, ${(peak * 0.4).toFixed(3)})`)
  g.addColorStop(1, 'rgba(58, 36, 22, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** Faint warm pool so painted figures separate from the soil. */
function drawReadHalo(ctx: CanvasRenderingContext2D, x: number, y: number, footprint: number, strength = 1): void {
  if (!fxOn('telegraphs')) return
  const rx = Math.max(6, footprint * 0.42)
  const peak = 0.12 * clamp(strength, 0, 1)
  if (peak < 0.02) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, 0.46)
  const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx)
  g.addColorStop(0, `rgba(255, 228, 186, ${peak.toFixed(3)})`)
  g.addColorStop(1, 'rgba(255, 228, 186, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** Screen-blend pool around the hero so the night edge stays dark and the figure stays warm. */
function drawWarmPool(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  if (!fxOn('telegraphs')) return
  const r = 72
  const g = ctx.createRadialGradient(x, y + 8, 16, x, y, r)
  g.addColorStop(0, 'rgba(255, 198, 120, 0.42)')
  g.addColorStop(0.38, 'rgba(255, 156, 72, 0.16)')
  g.addColorStop(0.72, 'rgba(180, 90, 40, 0.05)')
  g.addColorStop(1, 'rgba(120, 60, 20, 0)')
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** About 12% darker and a little less saturated, warm. Actors are drawn after this. */
function darkenGround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = '#e0d8cc'
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function drawOffscreen(
  ctx: CanvasRenderingContext2D,
  world: World,
  cssW: number,
  cssH: number,
): void {
  const cam = world.camera
  const zoom = cam.zoom > 0 ? cam.zoom : 1
  const margin = 22
  ctx.save()
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i]
    if (!e || e.state === 'dying' || e.state === 'spawning') continue
    const sx = (e.x - cam.x) * zoom + cssW * 0.5
    const sy = (e.y - cam.y) * zoom + cssH * 0.5
    if (sx >= -8 && sx <= cssW + 8 && sy >= -8 && sy <= cssH + 8) continue
    const cx = clamp(sx, margin, cssW - margin)
    const cy = clamp(sy, margin, cssH - margin)
    const ang = Math.atan2(sy - cssH * 0.5, sx - cssW * 0.5)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ang)
    ctx.globalAlpha = e.boss ? 0.95 : 0.7
    ctx.fillStyle = e.boss ? '#d4b060' : e.def.palette.accent
    ctx.beginPath()
    ctx.moveTo(10, 0)
    ctx.lineTo(-7, 6)
    ctx.lineTo(-4, 0)
    ctx.lineTo(-7, -6)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#0c0806'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function hpArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  frac: number,
  boss: boolean,
): void {
  const f = clamp(frac, 0, 1)
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = rgba('#2a221c', 0.35)
  ctx.lineWidth = boss ? 4 : 3
  ctx.beginPath()
  ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()
  ctx.strokeStyle = boss ? '#d4b060' : '#c4453c'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.15 + Math.PI * 0.7 * f)
  ctx.stroke()
  ctx.restore()
}

function drawTrail(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const pts = p.trail
  if (pts.length < 2 || p.def.trail === 'none') return
  const player = p.owner === 'player'
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const start = player ? Math.max(1, pts.length - 4) : 1
  for (let i = start; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (!a || !b) continue
    const u = i / pts.length
    const col =
      p.def.trail === 'ember'
        ? '#ff9040'
        : p.def.trail === 'spark'
          ? '#e8f6ff'
          : p.def.paint === 'spit'
            ? '#b8e05a'
            : player
              ? '#e2b45a'
              : '#2a221c'
    ctx.strokeStyle = rgba(col, player ? 0.2 + u * 0.35 : 0.22 + u * 0.55)
    ctx.lineWidth = player ? Math.max(1.4, p.r * 0.55) : p.r * (0.7 + u * 1.15)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, cache: SpriteCache): void {
  drawTrail(ctx, p)
  const spr = projectileSprite(cache, p.def.paint, qScale)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.angle)
  const spd = Math.hypot(p.vx, p.vy)
  const stretch = p.owner === 'player' ? 1 : 1 + clamp(spd / 520, 0, FEEL.projectile.stretch)
  ctx.scale(stretch, 1 / Math.sqrt(stretch))
  const sc = (p.r * 2.4) / 14
  if (p.owner === 'player') {
    ctx.save()
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = '#e2b45a'
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-p.r * 0.8, 0)
    ctx.lineTo(p.r * 1.6, 0)
    ctx.stroke()
    ctx.restore()
  }
  blit(ctx, spr, sc, clamp(p.life / Math.max(0.05, p.maxLife), 0.45, 1))
  ctx.restore()
}

function drawTree(ctx: CanvasRenderingContext2D, t: Tree, cache: SpriteCache): void {
  const spr = treeSprite(cache, qScale)
  ctx.save()
  ctx.translate(t.x, t.y)
  ctx.rotate(Math.sin(t.sway) * 0.12)
  const sc = (t.r * 2) / 70
  blit(ctx, spr, sc, 1)
  if (t.hitFlash > 0.02) {
    ctx.globalAlpha = t.hitFlash * 0.45
    ctx.fillStyle = '#fff6e8'
    ctx.beginPath()
    ctx.ellipse(0, -8, t.r * 0.95, t.r * 0.75, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

const PICKUP_CLIP: Record<Pickup['type'], string> = {
  material: 'coin',
  materialBig: 'xpLarge',
  fruit: 'heart',
  chest: 'chest',
  seed: 'xpSmall',
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, cache: SpriteCache, time: number, dt: number): void {
  const sheet = sheetById('pickups')
  const clip = PICKUP_CLIP[p.type]
  const pr = p.type === 'chest' ? 12 : p.type === 'materialBig' ? 10 : 8
  const bob = sheet ? Math.sin(p.t * 3.2 + time) * 1.2 : Math.sin(p.t * 3.2 + time) * 3
  drawShadow(ctx, p.x, p.y + bob + 2, pr * 1.6, 0.75)
  ctx.save()
  ctx.translate(p.x, p.y + bob)
  if (p.magnet) {
    const ang = Math.atan2(p.vy, p.vx)
    const spd = Math.hypot(p.vx, p.vy)
    ctx.rotate(ang)
    const stretch = 1 + clamp(spd / 380, 0, 0.85)
    ctx.scale(stretch, 1 / Math.sqrt(stretch))
  }
  let scale = p.type === 'chest' ? 0.22 : p.type === 'materialBig' ? 0.2 : 0.17
  const coin = p.type === 'material'
  if (coin) {
    scale *= CHAOS.read.coinScale
    ctx.filter = `saturate(${CHAOS.read.coinSat})`
  }
  if (!sheet || !drawNamedClip(ctx, sheet, `pick:${p.uid}`, clip, dt, { scale })) {
    const spr = pickupSprite(cache, p.type, qScale, p.crop)
    const sc = p.type === 'chest' ? 0.85 : p.type === 'materialBig' ? 0.95 : coin ? 0.72 * CHAOS.read.coinScale : 0.72
    blit(ctx, spr, sc)
  }
  if (coin) ctx.filter = 'none'
  ctx.restore()
}

function markerForm(kind: SpawnMarker['kind']): Form {
  return ENEMIES[kind]?.form === 'nightmare' ? 'nightmare' : 'normal'
}

function drawMarker(ctx: CanvasRenderingContext2D, m: SpawnMarker, cache: SpriteCache, time: number): void {
  if (m.style) {
    drawChaosMarker(ctx, m, time)
    return
  }
  const form = markerForm(m.kind)
  const spr = markerSprite(cache, form, qScale)
  const u = m.life > 0 ? m.t / m.life : 1
  const bloom = lerp(0.55, 1.35, ease.outCubic(clamp(u, 0, 1)))
  const pulse = 0.35 + 0.65 * Math.sin(clamp(u, 0, 1) * Math.PI)
  ctx.save()
  ctx.translate(m.x, m.y)
  if (fxOn('telegraphs')) {
    ctx.globalAlpha = pulse * 0.55
    ctx.strokeStyle = form === 'nightmare' ? '#d9ff5c' : '#c4a050'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(0, 6, 18 + bloom * 10, 8 + bloom * 4, 0, 0, TAU)
    ctx.stroke()
  }
  blit(ctx, spr, bloom, pulse)
  ctx.restore()
}

function drawEmbers(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, uid: number): void {
  ctx.save()
  for (let i = 0; i < 5; i++) {
    const a = t * 3 + i * 1.3 + n01(uid + i, 3) * TAU
    const d = r * (0.4 + n01(i, uid) * 0.7)
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 8 + i)
    ctx.fillStyle = i % 2 === 0 ? '#e07038' : '#f0d060'
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7 - r * 0.2, 1.4 + (i % 3) * 0.6, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function foeModel(form: Form): ModelDir {
  return form === 'nightmare' ? 'b' : getPaintStyle()
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  cache: SpriteCache,
  time: number,
): void {
  const species = resolveSpecies(e.def.paint, e.def.species, e.kind)
  const form: Form = e.form ?? e.def.form ?? 'normal'
  const model = foeModel(form)
  const pal = e.def.palette ?? SPECIES_PALETTES[species]
  const artR = sizeBucket(e.r)
  const sheet = resolveEnemySheet(e.kind, form)
  // A killing slash used to hide the body and leave watercolor chunks.
  // Authored deaths play the sheet instead; that clip is the corpse.
  if (e.sliced && !sheet?.manifest.clips.death) return
  const spr = sheet ? null : creatureSprite(cache, species, pal, form, artR, qScale, model, true)
  const spawn = clamp(e.anim.spawnT, 0, 1)
  const dying = e.anim.deathT >= 0
  const death = dying ? clamp(e.anim.deathT, 0, 1) : 0
  // Authored emerge is the body. The shadow only arrives over the clip's second half.
  // emerge_vine is the plant drop; it falls back to emerge when that clip is absent.
  const spawnName = enemySpawnClip(e)
  const spawnClip =
    spawnName && sheet?.manifest.clips[spawnName]
      ? spawnName
      : sheet?.manifest.clips.emerge
        ? 'emerge'
        : sheet?.manifest.clips.emerge_vine
          ? 'emerge_vine'
          : null
  const emerging = e.state === 'spawning' && !!spawnClip
  const appear = emerging ? 1 : ease.outCubic(spawn)
  const shadowIn = emerging ? (spawn <= 0.5 ? 0 : (spawn - 0.5) / 0.5) : appear
  const scream = resolveScream(e.anim, e.state, e.stateT)
  const ss = screamScale(scream)
  const mouth = resolveMouth(e.anim, form, scream)
  const gait = e.anim.gait ?? 0
  const blink = e.anim.blink ?? -1
  const facing = e.anim.facing ?? 1
  let ox = e.x + e.anim.kick.x
  let oy = e.y + e.anim.kick.y + (sheet ? 0 : e.anim.bob)
  if (!sheet && (e.state === 'windup' || e.state === 'charging')) {
    const mag = e.state === 'windup' ? 2.4 : 0.9
    ox += (hashNoise(Math.floor(time * 48), e.uid) - 0.5) * mag * 2
    oy += (hashNoise(Math.floor(time * 48), e.uid + 9) - 0.5) * mag * 2
  }
  const foot = sheet ? actorFootprint(sheet, e.r) : e.r * 1.7
  const shade = shadowIn * (1 - death)
  const hop = hopHeight(e)
  if (sheet) drawReadHalo(ctx, ox, e.y, foot, shade)
  drawShadow(ctx, ox, sheet ? e.y : e.y + e.r * 0.45, foot, shade * (hop > 1 ? 0.65 : 1))
  drawLeapShadow(ctx, ox, e.y, foot, hop)
  const vine = vineOf(e)
  if (vine && sheet && hasClip(sheet, 'prop_vine')) {
    ctx.save()
    ctx.translate(vine.x, vine.y)
    ctx.globalAlpha = vine.alpha * appear
    drawActorSheet(ctx, sheet, `vine:${e.uid}`, 'prop_vine', { r: e.r, facing: 1, alpha: 1 })
    ctx.restore()
  }
  ctx.save()
  ctx.translate(ox, oy - hop)
  if (sheet) {
    const playKey = `e:${e.uid}`
    const dyingSheet = e.state === 'dying' || e.anim.deathT >= 0
    const deathName = corpseClipName(e) ?? (e.corpse && sheet.manifest.clips[e.corpse] ? e.corpse : deathClipName(e))
    const leaping = isLeaping(e) && hasClip(sheet, 'leap')
    const screaming = e.state === 'screaming' && hasClip(sheet, 'scream')
    const clip = dyingSheet && deathName && sheet.manifest.clips[deathName]
      ? deathName
      : emerging
        ? 'emerge'
        : leaping
          ? 'leap'
          : screaming
            ? 'scream'
            : e.perform && sheet.manifest.clips[e.perform]
              ? e.perform
              : pickClip(sheet, e.anim, {
                  attacking: e.state === 'windup' || e.state === 'charging' || e.state === 'shooting',
                  hurt: !dyingSheet && actorClipActive(playKey, 'hurt'),
                })
    const squash = clamp(e.anim.squash || 1, 0.45, 1.8)
    ctx.globalAlpha = appear * (1 - (deathName && dyingSheet ? 0 : death))
    ctx.scale(squash, 1 / squash)
    if (clip) {
      drawActorSheet(ctx, sheet, playKey, clip, {
        r: e.r,
        facing,
        alpha: 1,
      })
    }
    ctx.restore()
    if (e.burn > 0) drawEmbers(ctx, ox, oy, e.r, time, e.uid)
    if (e.elite || e.boss) {
      hpArc(ctx, ox, oy - e.r - 8, e.boss ? 22 : 14, e.maxHp > 0 ? e.hp / e.maxHp : 0, e.boss)
    }
    return
  }
  if (dying) ctx.rotate((n01(e.uid, 2) - 0.5) * 0.5 * death)
  const bloom = lerp(1.7, 1, appear) * (1 + death * 0.75)
  const squash = clamp(e.anim.squash || 1, 0.45, 1.8)
  ctx.scale(squash * bloom * ss.sx, (1 / squash) * bloom * ss.sy * (1 + death * 0.15))
  ctx.globalAlpha = appear * (1 - death)
  if (spawn < 0.85) {
    ctx.save()
    ctx.globalAlpha = (1 - spawn) * 0.45
    ctx.fillStyle = form === 'nightmare' ? mudOf(pal) : pal.body
    ctx.beginPath()
    ctx.arc(0, 0, e.r * 2.1, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
  const sc = e.r / artR
  ctx.save()
  ctx.scale(facing, 1)
  blit(ctx, spr, sc)
  ctx.restore()
  ctx.save()
  ctx.scale(sc, sc)
  paintLiveFeatures(ctx, {
    species,
    pal,
    r: artR,
    form,
    mouth,
    blink,
    gait,
    scream,
    facing,
    lookX: e.aim.x !== 0 || e.aim.y !== 0 ? Math.cos(Math.atan2(e.aim.y, e.aim.x)) : 0.25 * facing,
    lookY: e.aim.y !== 0 ? Math.sign(e.aim.y) * 0.2 : 0.1,
    t: e.anim.t,
    uid: e.uid,
    model,
  })
  ctx.restore()
  if (e.anim.hitFlash > 0.02 && e.anim.deathT < 0 && e.state !== 'dying') {
    ctx.save()
    ctx.globalAlpha = e.anim.hitFlash * 0.65
    ctx.fillStyle = '#fff6e8'
    ctx.beginPath()
    ctx.ellipse(0, 0, e.r * 1.05, e.r * 0.9, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
  if (e.slow > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = clamp(e.slow / 2, 0.15, 0.4)
    ctx.fillStyle = '#6a88b8'
    ctx.beginPath()
    ctx.ellipse(0, 0, e.r * 1.05, e.r * 0.9, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
  if (e.burn > 0) drawEmbers(ctx, ox, oy, e.r, time, e.uid)
  if (e.elite || e.boss) {
    hpArc(ctx, ox, oy - e.r * bloom * ss.sy - 8, e.boss ? 22 : 14, e.maxHp > 0 ? e.hp / e.maxHp : 0, e.boss)
  }
  if ((e.state === 'windup' || e.state === 'charging') && (e.aim.x !== 0 || e.aim.y !== 0)) {
    const ang = Math.atan2(e.aim.y, e.aim.x)
    const len = e.state === 'charging' ? e.r * 5 : e.r * 3.5
    ctx.save()
    ctx.strokeStyle = rgba('#c4453c', e.state === 'windup' ? 0.45 : 0.25)
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len)
    ctx.stroke()
    ctx.restore()
  }
}

function muzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, t: number): void {
  const u = clamp(1 - t / 0.18, 0, 1)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.globalAlpha = u * 0.9
  ctx.fillStyle = '#f0d060'
  ctx.beginPath()
  ctx.ellipse(8, 0, 10 * u, 5 * u, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff6e8'
  ctx.beginPath()
  ctx.ellipse(12, 0, 5 * u, 3 * u, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawChainBolt(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  t: number,
): void {
  const n = 8
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const fade = Math.sin(clamp(t, 0, 1) * Math.PI)
  ctx.globalAlpha = 0.35 * fade
  ctx.strokeStyle = '#88ddff'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i < n; i++) {
    const u = i / n
    const jig = (hashNoise(i + Math.floor(t * 18), seed) - 0.5) * 22
    ctx.lineTo(x0 + dx * u + nx * jig, y0 + dy * u + ny * jig)
  }
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.globalAlpha = 0.9 * fade
  ctx.strokeStyle = '#e8f6ff'
  ctx.lineWidth = 1.8
  ctx.stroke()
  ctx.restore()
}

function drawAuraRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number): void {
  const flick = 0.55 + 0.45 * Math.abs(Math.sin(time * 9) * Math.sin(time * 13.1))
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = 0.28 * flick
  ctx.strokeStyle = '#e09040'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.ellipse(0, 0, radius, radius * 0.88, 0, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.14 * flick
  ctx.strokeStyle = '#f0d060'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(0, 0, radius * 0.86, radius * 0.76, 0, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function weaponAngleAndPos(
  player: Player,
  slot: number,
  angle: number,
  swingT: number,
  behavior: WeaponBehavior,
): { x: number; y: number; rot: number; smear?: { a0: number; a1: number; r: number } } {
  const off = slotOffset(slot, player.r)
  let x = player.x + off.x + player.anim.kick.x
  let y = player.y + off.y + player.anim.bob + player.anim.kick.y
  let rot = angle
  let smear: { a0: number; a1: number; r: number } | undefined
  if (swingT >= 0) {
    const t = clamp(swingT, 0, 1)
    if (behavior.type === 'sweep') {
      const e = ease.outCubic(t)
      const a0 = angle - behavior.arc * 0.5
      const a1 = angle + behavior.arc * 0.5
      rot = lerp(a0, a1, e)
      smear = { a0, a1: rot, r: Math.hypot(off.x, off.y) + 8 }
    } else if (behavior.type === 'thrust') {
      const lung = Math.sin(t * Math.PI) * behavior.reach * 0.55
      x += Math.cos(angle) * lung
      y += Math.sin(angle) * lung
    } else if (behavior.type === 'shoot') {
      const rec = ease.punch(t) * 14
      x -= Math.cos(angle) * rec
      y -= Math.sin(angle) * rec
    }
  }
  return { x, y, rot, smear }
}

function drawPlayerWeapons(
  ctx: CanvasRenderingContext2D,
  world: World,
  cache: SpriteCache,
  behind: boolean,
  held?: Record<number, { x: number; y: number; rot?: number }>,
  hideHeld = false,
): void {
  const player = world.player
  const frame = Math.floor(world.time * 8) % 4
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i]
    if (!w) continue
    const look = weaponLook(w.id)
    const behavior = look.behavior
    if (behavior.type === 'orbit') continue
    if (behavior.type === 'aura' && !behind) {
      drawAuraRing(ctx, player.x, player.y, behavior.radius, world.time)
    }
    const heldPos = w.slot === 0 || w.slot === 1 ? held?.[w.slot] : undefined
    const off = slotOffset(w.slot, player.r)
    // A live swing stays in front of the body so the blade is not hidden by the pepper.
    const isBack = w.swingT >= 0 ? false : heldPos ? heldPos.y < player.y + player.anim.bob : off.y < 0
    if (isBack !== behind) continue
    const pose = heldPos
      ? { x: heldPos.x, y: heldPos.y, rot: heldPos.rot ?? w.angle, smear: undefined as { a0: number; a1: number; r: number } | undefined }
      : weaponAngleAndPos(player, w.slot, w.angle, w.swingT, behavior)
    const fade = smearFade(w.swingT)
    if (fade > 0.02 && (behavior.type === 'sweep' || behavior.type === 'thrust')) {
      const cx = player.x
      const cy = player.y + player.anim.bob
      const tint = smearTint(w.id, player.character.palette.accent)
      ctx.save()
      ctx.globalAlpha = 0.72 * fade
      ctx.strokeStyle = tint
      ctx.lineWidth = CHAOS.read.smearWidth
      ctx.lineCap = 'round'
      ctx.beginPath()
      const tip = behavior.type === 'sweep' ? pose.rot : w.angle
      const span = CHAOS.read.smearSpan
      const r =
        behavior.type === 'sweep'
          ? (pose.smear?.r ?? Math.hypot(off.x, off.y) + 10)
          : player.r + 12 + behavior.reach * 0.4
      ctx.arc(cx, cy, r, tip - span, tip)
      ctx.stroke()
      ctx.restore()
    }
    if (!hideHeld) {
      const spr = weaponSprite(cache, look.paint, look.paint === 'torch' || look.paint === 'wand' ? frame : 0, qScale)
      ctx.save()
      ctx.translate(pose.x, pose.y)
      ctx.rotate(pose.rot)
      if (heldPos) ctx.translate(10, 0)
      blit(ctx, spr, 0.7)
      ctx.restore()
      if (behavior.type === 'shoot' && w.swingT >= 0 && w.swingT < 0.18) {
        muzzleFlash(ctx, pose.x, pose.y, pose.rot, w.swingT)
      }
    }
    if (behavior.type === 'chain' && w.swingT >= 0 && w.targetUid != null) {
      const jumps = behavior.jumps
      const jumpRange = behavior.jumpRange
      const hit = new Set<number>()
      let fromX = pose.x
      let fromY = pose.y
      let next: Enemy | undefined = world.enemies.find((en) => en.uid === w.targetUid)
      for (let j = 0; j < jumps && next; j++) {
        drawChainBolt(ctx, fromX, fromY, next.x, next.y, w.uid + j, w.swingT)
        hit.add(next.uid)
        fromX = next.x
        fromY = next.y
        let best: Enemy | undefined
        let bestD = jumpRange
        for (let k = 0; k < world.enemies.length; k++) {
          const en = world.enemies[k]
          if (!en || hit.has(en.uid) || en.anim.deathT >= 0) continue
          const d = dist(fromX, fromY, en.x, en.y)
          if (d < bestD) {
            bestD = d
            best = en
          }
        }
        next = best
      }
    }
  }
}

function drawOrbitWeapons(ctx: CanvasRenderingContext2D, world: World, cache: SpriteCache): void {
  const player = world.player
  const frame = Math.floor(world.time * 8) % 4
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i]
    if (!w) continue
    const look = weaponLook(w.id)
    if (look.behavior.type !== 'orbit') continue
    const { count, radius } = look.behavior
    const spin = world.time * 2.35
    for (let b = 0; b < count; b++) {
      const a = spin + (b / count) * TAU
      const x = player.x + Math.cos(a) * radius
      const y = player.y + Math.sin(a) * radius + player.anim.bob * 0.3
      const spr = weaponSprite(cache, look.paint, frame, qScale)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a + Math.PI / 2)
      const pulse = w.swingT >= 0 ? 1 + Math.sin(w.swingT * Math.PI) * 0.12 : 1
      blit(ctx, spr, 0.65 * pulse)
      ctx.restore()
    }
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, world: World, cache: SpriteCache): void {
  const p = world.player
  const pal = p.character.palette
  const species = resolveSpecies(p.character.species ?? 'potato', p.character.species, p.character.id)
  const form: Form = 'normal'
  const model: ModelDir = p.model ?? 'b'
  const sheet = resolveSheet(sheetKeysForPlayer(species, model))
  const painted = !sheet && usesPaintedArt(species, model)
  const board = !sheet && usesBoardArt(species, model)
  const imageHero = painted || board
  const drawR = p.r * CHAOS.read.heroScale
  const artR = sizeBucket(drawR)
  const procModel = proceduralModel(model)
  const spr = imageHero ? null : creatureSprite(cache, species, pal, form, artR, qScale, procModel)
  const x = p.x + p.anim.kick.x
  const y = board || sheet ? p.y + p.anim.kick.y : p.y + p.anim.kick.y + p.anim.bob
  const scream = resolveScream(p.anim, undefined, undefined)
  const ss = screamScale(scream)
  const mouth = resolveMouth(p.anim, form, scream)
  const gait = p.anim.gait ?? (p.anim.moving ? (p.anim.t * 1.7) % 1 : 0)
  const blink = p.anim.blink ?? -1
  const facing = p.anim.facing ?? 1
  const squash = clamp(p.anim.squash || 1, 0.45, 1.8)
  const sc = drawR / artR
  // Sheet heroes stay upright. A small negative lean plus high-quality
  // smoothing makes Chrome smear the cell into a wide cloud.
  const bodyRot = sheet
    ? 0
    : imageHero
      ? clamp(p.vx / 220, -0.18, 0.18)
      : clamp(p.vx / 180, -0.36, 0.36) * FEEL.motion.lean +
        clamp(Math.hypot(p.vx, p.vy) / 400, 0, 0.1) * Math.sign(p.vx || p.anim.facing)
  const squashAmt = imageHero ? lerp(1, squash, 0.28) : squash
  const sx = sc * squashAmt * ss.sx
  const sy = (sc * ss.sy) / squashAmt
  const rig = speciesRig(species, artR, procModel)
  const has0 = p.weapons.some((w) => w && w.slot === 0)
  const has1 = p.weapons.some((w) => w && w.slot === 1)
  const localL = !imageHero && has1 ? handLocal(rig, gait, -1, facing) : undefined
  const localR = !imageHero && has0 ? handLocal(rig, gait, 1, facing) : undefined
  const held: Record<number, { x: number; y: number; rot?: number }> = {}
  const c = Math.cos(bodyRot)
  const s = Math.sin(bodyRot)
  if (localR) {
    held[0] = { x: x + localR.x * sx * c - localR.y * sy * s, y: y + localR.x * sx * s + localR.y * sy * c }
  }
  if (localL) {
    held[1] = { x: x + localL.x * sx * c - localL.y * sy * s, y: y + localL.x * sx * s + localL.y * sy * c }
  }

  let alpha = 1
  if (p.invuln > 0) alpha = Math.sin(p.anim.t * 24) > 0 ? 1 : 0.32

  if (sheet) {
    const arms = potatoMultiArm(species) ? multiArmSheet(species) : null
    const body = arms ?? sheet
    const swinging = !arms && p.weapons.some((w) => w.swingT >= 0)
    const shade = p.invuln > 0 && Math.sin(p.anim.t * 24) < 0 ? 0.35 : 1
    const foot = actorFootprint(body, drawR)
    drawShadow(ctx, x, p.y, foot, shade * CHAOS.read.heroShadow)
    drawPlayerWeapons(ctx, world, cache, true, held, true)
    const clip = pickClip(body, p.anim, { swinging, hurt: actorClipActive('player', 'hurt') })
    const paintFacing: 1 | -1 = arms ? 1 : facing
    const blend = clip && (clip === 'idle' || clip === 'walk') ? locomotionBlend('player') : null
    const paintHero = (c: CanvasRenderingContext2D) => {
      c.save()
      c.translate(x, y)
      c.rotate(bodyRot)
      // Side-facing heroes are authored facing right. One scale flips the body
      // and every arm together, so near arms stay in front and far arms stay behind.
      if (arms) c.scale(facing, 1)
      const paintArms = (which: 'back' | 'front') => {
        if (!arms || !clip) return
        const base = {
          species,
          weapons: p.weapons.map((w) => ({ uid: w.uid, id: w.id })),
          r: drawR,
          facing,
          originX: x,
          originY: y,
          bodyRot,
        }
        if (blend && blend.from !== clip) {
          drawMultiArm(c, which, { ...base, clip: blend.from, alpha: alpha * blend.old })
          drawMultiArm(c, which, { ...base, clip, alpha: alpha * blend.neu })
          return
        }
        drawMultiArm(c, which, { ...base, clip, alpha })
      }
      paintArms('back')
      if (clip) drawActorSheet(c, body, 'player', clip, { r: drawR, facing: paintFacing, alpha })
      paintArms('front')
      c.restore()
    }
    paintWithRim(ctx, x, y, paintHero)
    drawPlayerWeapons(ctx, world, cache, false, held, true)
    drawOrbitWeapons(ctx, world, cache)
    return
  }

  if (board) {
    const aimW = p.weapons.find((w) => w.swingT >= 0) ?? p.weapons[0]
    const lookAng = aimW ? aimW.angle : p.facingAngle
    const boardOpts = {
      x,
      y,
      r: drawR,
      facing,
      squash: squashAmt,
      alpha,
      anim: p.anim,
      lookX: Math.cos(lookAng),
      lookY: Math.sin(lookAng),
      mouth,
      blink,
      weapons: p.weapons.map((w) => {
        const slash = boardKnifeSlash(species, model, w.id)
        return {
          slot: w.slot,
          angle: w.angle,
          swingT: w.swingT,
          kind: slash ? 'sweep' : weaponLook(w.id).behavior.type,
          arc: slash ? 2.25 : undefined,
          snap: slash,
        }
      }),
    }
    const hero: BoardHero = species === 'chili' ? 'chili' : 'radish'
    const pose = poseBoard(hero, boardOpts)
    const hands = boardHeld(x, y, facing, pose)
    held[0] = hands.right
    held[1] = hands.left
    drawBoardShadow(ctx, boardOpts, pose)
    drawPlayerWeapons(ctx, world, cache, true, held)
    drawBoard(ctx, boardOpts, hero)
    drawPlayerWeapons(ctx, world, cache, false, held)
    drawOrbitWeapons(ctx, world, cache)
    const arena = typeof document !== 'undefined' ? document.getElementById('arena') : null
    if (arena) arena.dataset.swing = String(p.weapons[0]?.swingT ?? -1)
    return
  }

  drawShadow(
    ctx,
    x,
    p.y + drawR * 0.45,
    drawR * 1.7,
    (p.invuln > 0 && Math.sin(p.anim.t * 24) < 0 ? 0.35 : 1) * CHAOS.read.heroShadow,
  )
  drawPlayerWeapons(ctx, world, cache, true, held)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(bodyRot)
  ctx.scale(squashAmt * ss.sx, ss.sy / squashAmt)
  if (form === 'normal') {
    ctx.save()
    ctx.globalAlpha = 0.2 * alpha
    ctx.fillStyle = '#f7f1e2'
    ctx.beginPath()
    ctx.ellipse(0, 2, p.r * 1.55, p.r * 1.32, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  } else {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.16 * alpha
    ctx.fillStyle = glowOf(pal)
    ctx.beginPath()
    ctx.ellipse(0, 0, p.r * 1.35, p.r * 1.2, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = alpha
  if (painted) {
    ctx.save()
    ctx.scale(1 / (squashAmt * ss.sx), 1 / (ss.sy / squashAmt))
    drawPaintedChili(ctx, {
      x: 0,
      y: 0,
      r: drawR,
      facing,
      squash: squashAmt,
      alpha,
      blink,
      anim: p.anim,
    })
    ctx.restore()
  } else if (spr) {
    ctx.save()
    ctx.scale(facing, 1)
    blit(ctx, spr, sc)
    ctx.restore()
    ctx.save()
    ctx.scale(sc, sc)
    paintLiveFeatures(ctx, {
      species,
      pal,
      r: artR,
      form,
      mouth,
      blink,
      gait,
      scream,
      facing,
      lookX: Math.cos(p.facingAngle),
      lookY: Math.sin(p.facingAngle) * 0.3,
      t: p.anim.t,
      holdL: localL,
      holdR: localR,
      uid: 1,
      model: procModel,
    })
    ctx.restore()
  }
  if (p.anim.hitFlash > 0.02) {
    ctx.globalAlpha = p.anim.hitFlash * 0.7 * alpha
    ctx.fillStyle = '#fff6e8'
    ctx.beginPath()
    ctx.ellipse(0, 0, p.r * 1.05, p.r * 0.9, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  drawPlayerWeapons(ctx, world, cache, false, held)
  drawOrbitWeapons(ctx, world, cache)
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  dt: number,
  fx: FxApi & { drawFloor(ctx: CanvasRenderingContext2D): void },
  cache: SpriteCache,
  view: ViewSize,
): void {
  fx.update(dt)
  const restorePoses = presentRenderPoses(world)
  try {
  const cam = world.camera
  const cssW = cam.w > 0 ? cam.w : view.w
  const cssH = cam.h > 0 ? cam.h : view.h
  const zoom = cam.zoom > 0 ? cam.zoom : 1
  qScale = qualityBucket(zoom, view.dpr)
  const night = !!gardenGround(false)
  ctx.save()
  ctx.fillStyle = night ? '#100e0c' : paperColor()
  ctx.fillRect(0, 0, cssW, cssH)

  const shakeOff = cameraShakeOffset(world)
  const sx = shakeOff.x
  const sy = shakeOff.y
  const shake = cam.shake

  ctx.save()
  ctx.translate(cssW * 0.5, cssH * 0.5)
  ctx.scale(zoom, zoom)
  ctx.translate(-cam.x + sx, -cam.y + sy)

  const hw = cssW / (2 * zoom) + Math.abs(shake) + 48
  const hh = cssH / (2 * zoom) + Math.abs(shake) + 48
  const aw = world.arenaHalfW
  const ah = world.arenaHalfH
  drawPaddock(ctx, cam.x - hw, cam.y - hh, hw * 2, hh * 2, aw, ah, Math.min(2, qScale))
  drawFarmRows(ctx, world.farm.plots, qScale >= 2, world.waveTime)
  drawFarmBeds(ctx, world.farm.plots, qScale >= 2)
  fx.drawFloor(ctx)
  drawChaosFloor(ctx)
  darkenGround(ctx, cam.x - hw, cam.y - hh, hw * 2, hh * 2)
  if (night) drawWarmPool(ctx, world.player.x, world.player.y)

  cmdN = 0
  for (let i = 0; i < world.trees.length; i++) {
    const t = world.trees[i]
    if (t) pushCmd(t.y, 2, 0, i)
  }
  for (let i = 0; i < world.pickups.length; i++) {
    const p = world.pickups[i]
    if (p) pushCmd(p.y, 1, 1, i)
  }
  for (let i = 0; i < world.markers.length; i++) {
    const m = world.markers[i]
    if (m) pushCmd(m.y, 0, 2, i)
  }
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i]
    if (e) pushCmd(e.y, 3, 3, i)
  }
  pushCmd(world.player.y, 4, 4, 0)
  for (let i = 0; i < world.farm.plots.length; i++) {
    const plot = world.farm.plots[i]
    if (plot?.crop) pushCmd(plot.y, 2, 5, i)
  }

  const list = cmds.slice(0, cmdN)
  list.sort((a, b) => a.y - b.y)

  let playerDrawn = false
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (!c) continue
    if (c.kind === 0) {
      const t = world.trees[c.idx]
      if (t) drawTree(ctx, t, cache)
    } else if (c.kind === 1) {
      const p = world.pickups[c.idx]
      if (p) drawPickup(ctx, p, cache, world.time, dt)
    } else if (c.kind === 2) {
      const m = world.markers[c.idx]
      if (m) drawMarker(ctx, m, cache, world.time)
    } else if (c.kind === 3) {
      const e = world.enemies[c.idx]
      if (e) drawEnemy(ctx, e, cache, world.time)
    } else if (c.kind === 4 && !playerDrawn) {
      playerDrawn = true
      const hero = world.player
      drawFunnyBursts(ctx, dt, hero, 'near')
      fx.drawWorld(ctx, hero, 'near')
      drawPlayer(ctx, world, cache)
    } else if (c.kind === 5) {
      const plot = world.farm.plots[c.idx]
      if (plot) drawFarmPlant(ctx, plot)
    }
  }

  const enemyShots: Projectile[] = []
  const playerShots: Projectile[] = []
  for (let i = 0; i < world.projectiles.length; i++) {
    const p = world.projectiles[i]
    if (!p) continue
    if (p.owner === 'enemy') enemyShots.push(p)
    else playerShots.push(p)
  }
  enemyShots.sort((a, b) => a.y - b.y)
  playerShots.sort((a, b) => a.y - b.y)
  for (let i = 0; i < enemyShots.length; i++) {
    const p = enemyShots[i]
    if (p) drawProjectile(ctx, p, cache)
  }
  for (let i = 0; i < playerShots.length; i++) {
    const p = playerShots[i]
    if (p) drawProjectile(ctx, p, cache)
  }

  tickChaosFx(dt)
  drawFunnyBursts(ctx, dt, world.player, 'far')
  fx.drawWorld(ctx, world.player, 'far')
  ctx.restore()

  fx.drawScreen(ctx, cssW, cssH)
  drawComboHud(ctx, cssW, cssH, comboCount())
  drawOffscreen(ctx, world, cssW, cssH)
  vignette(ctx, cssW, cssH, night ? 0.72 : 0.4)
  ctx.restore()
  } finally {
    restorePoses()
  }
}
