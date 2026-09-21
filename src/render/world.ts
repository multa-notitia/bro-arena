import { TAU, clamp, dist, ease, hashNoise, lerp } from '../core/math.ts'
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
import { paperColor } from './paintLang.ts'
import { drawFarmBeds, drawFarmPlant, drawFarmRows } from './crops.ts'
import { drawPaddock } from './ground.ts'
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

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 0.3): void {
  ctx.save()
  ctx.translate(x, y + r * 0.62)
  ctx.scale(1, 0.38)
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#1c1610'
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.18, 0, TAU)
  ctx.fill()
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
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (!a || !b) continue
    const u = i / pts.length
    const col =
      p.def.trail === 'ember' ? '#e07038' : p.def.trail === 'spark' ? '#c8e8ff' : p.def.paint === 'spit' ? '#8aaa4a' : '#2a221c'
    ctx.strokeStyle = rgba(col, 0.12 + u * 0.4)
    ctx.lineWidth = p.r * (0.4 + u * 0.9)
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
  const sc = (p.r * 2) / 14
  blit(ctx, spr, sc, clamp(p.life / Math.max(0.05, p.maxLife), 0.35, 1))
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

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, cache: SpriteCache, time: number): void {
  const spr = pickupSprite(cache, p.type, qScale, p.crop)
  const bob = Math.sin(p.t * 3.2 + time) * 3
  const pr = p.type === 'chest' ? 12 : p.type === 'materialBig' ? 10 : 8
  drawShadow(ctx, p.x, p.y + bob + 4, pr, 0.28)
  ctx.save()
  ctx.translate(p.x, p.y + bob)
  if (p.magnet) {
    const ang = Math.atan2(p.vy, p.vx)
    const spd = Math.hypot(p.vx, p.vy)
    ctx.rotate(ang)
    const stretch = 1 + clamp(spd / 380, 0, 0.85)
    ctx.scale(stretch, 1 / Math.sqrt(stretch))
  }
  const sc = p.type === 'chest' ? 0.85 : p.type === 'materialBig' ? 0.95 : 0.72
  blit(ctx, spr, sc)
  ctx.restore()
}

function markerForm(kind: SpawnMarker['kind']): Form {
  return ENEMIES[kind]?.form === 'nightmare' ? 'nightmare' : 'normal'
}

function drawMarker(ctx: CanvasRenderingContext2D, m: SpawnMarker, cache: SpriteCache): void {
  const form = markerForm(m.kind)
  const spr = markerSprite(cache, form, qScale)
  const u = m.life > 0 ? m.t / m.life : 1
  const bloom = lerp(0.45, 1.15, ease.outCubic(clamp(u, 0, 1)))
  const alpha = 0.25 + 0.65 * Math.sin(clamp(u, 0, 1) * Math.PI)
  ctx.save()
  ctx.translate(m.x, m.y)
  blit(ctx, spr, bloom, alpha)
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

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, cache: SpriteCache, time: number): void {
  if (e.sliced) return
  const species = resolveSpecies(e.def.paint, e.def.species, e.kind)
  const form: Form = e.form ?? e.def.form ?? 'normal'
  const model = foeModel(form)
  const pal = e.def.palette ?? SPECIES_PALETTES[species]
  const artR = sizeBucket(e.r)
  const spr = creatureSprite(cache, species, pal, form, artR, qScale, model, true)
  const spawn = clamp(e.anim.spawnT, 0, 1)
  const dying = e.anim.deathT >= 0
  const death = dying ? clamp(e.anim.deathT, 0, 1) : 0
  const appear = ease.outCubic(spawn)
  const scream = resolveScream(e.anim, e.state, e.stateT)
  const ss = screamScale(scream)
  const mouth = resolveMouth(e.anim, form, scream)
  const gait = e.anim.gait ?? 0
  const blink = e.anim.blink ?? -1
  const facing = e.anim.facing ?? 1
  let ox = e.x + e.anim.kick.x
  let oy = e.y + e.anim.kick.y + e.anim.bob
  if (e.state === 'windup' || e.state === 'charging') {
    const mag = e.state === 'windup' ? 2.4 : 0.9
    ox += (hashNoise(Math.floor(time * 48), e.uid) - 0.5) * mag * 2
    oy += (hashNoise(Math.floor(time * 48), e.uid + 9) - 0.5) * mag * 2
  }
  drawShadow(ctx, ox, e.y, e.r, 0.4 * appear * (1 - death))
  ctx.save()
  ctx.translate(ox, oy)
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
  if (e.anim.hitFlash > 0.02) {
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
    if (!heldPos && pose.smear && w.swingT >= 0) {
      ctx.save()
      ctx.globalAlpha = 0.22 * Math.sin(clamp(w.swingT, 0, 1) * Math.PI)
      ctx.strokeStyle = '#c4b090'
      ctx.lineWidth = 10
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(player.x, player.y + player.anim.bob, pose.smear.r, pose.smear.a0, pose.smear.a1)
      ctx.stroke()
      ctx.restore()
    }
    if (heldPos && w.swingT >= 0) {
      const t = clamp(w.swingT, 0, 1)
      const pulse = Math.sin(t * Math.PI)
      ctx.save()
      ctx.globalAlpha = 0.3 * pulse
      ctx.strokeStyle = '#c4b090'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      const len = 18 + pulse * 20
      ctx.beginPath()
      ctx.moveTo(heldPos.x, heldPos.y)
      ctx.lineTo(heldPos.x + Math.cos(pose.rot) * len, heldPos.y + Math.sin(pose.rot) * len)
      ctx.stroke()
      ctx.restore()
    }
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
  const painted = usesPaintedArt(species, model)
  const board = usesBoardArt(species, model)
  const imageHero = painted || board
  const artR = sizeBucket(p.r)
  const procModel = proceduralModel(model)
  const spr = imageHero ? null : creatureSprite(cache, species, pal, form, artR, qScale, procModel)
  const x = p.x + p.anim.kick.x
  const y = board ? p.y + p.anim.kick.y : p.y + p.anim.kick.y + p.anim.bob
  const scream = resolveScream(p.anim, undefined, undefined)
  const ss = screamScale(scream)
  const mouth = resolveMouth(p.anim, form, scream)
  const gait = p.anim.gait ?? (p.anim.moving ? (p.anim.t * 1.7) % 1 : 0)
  const blink = p.anim.blink ?? -1
  const facing = p.anim.facing ?? 1
  const squash = clamp(p.anim.squash || 1, 0.45, 1.8)
  const sc = p.r / artR
  const bodyRot = imageHero
    ? clamp(p.vx / 280, -0.12, 0.12)
    : clamp(p.vx / 220, -0.28, 0.28) + clamp(Math.hypot(p.vx, p.vy) / 400, 0, 0.08) * Math.sign(p.vx || p.anim.facing)
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

  if (board) {
    const aimW = p.weapons.find((w) => w.swingT >= 0) ?? p.weapons[0]
    const lookAng = aimW ? aimW.angle : p.facingAngle
    const boardOpts = {
      x,
      y,
      r: p.r,
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

  drawShadow(ctx, x, p.y, p.r, p.invuln > 0 && Math.sin(p.anim.t * 24) < 0 ? 0.14 : 0.42)
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
      r: p.r,
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
  const cam = world.camera
  const cssW = cam.w > 0 ? cam.w : view.w
  const cssH = cam.h > 0 ? cam.h : view.h
  const zoom = cam.zoom > 0 ? cam.zoom : 1
  qScale = qualityBucket(zoom, view.dpr)
  ctx.save()
  ctx.fillStyle = paperColor()
  ctx.fillRect(0, 0, cssW, cssH)

  const shake = cam.shake
  const sx = Math.sin(world.time * 53.1) * shake
  const sy = Math.cos(world.time * 47.7) * shake

  ctx.save()
  ctx.translate(cssW * 0.5, cssH * 0.5)
  ctx.scale(zoom, zoom)
  ctx.translate(-cam.x + sx, -cam.y + sy)

  const hw = cssW / (2 * zoom) + Math.abs(shake) + 48
  const hh = cssH / (2 * zoom) + Math.abs(shake) + 48
  const aw = world.arenaHalfW
  const ah = world.arenaHalfH
  drawPaddock(ctx, cam.x - hw, cam.y - hh, hw * 2, hh * 2, aw, ah, Math.min(2, qScale))
  drawFarmRows(ctx, world.farm.plots)
  drawFarmBeds(ctx, world.farm.plots)
  fx.drawFloor(ctx)

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
  list.sort((a, b) => a.y - b.y || a.z - b.z)

  let playerDrawn = false
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (!c) continue
    if (c.kind === 0) {
      const t = world.trees[c.idx]
      if (t) drawTree(ctx, t, cache)
    } else if (c.kind === 1) {
      const p = world.pickups[c.idx]
      if (p) drawPickup(ctx, p, cache, world.time)
    } else if (c.kind === 2) {
      const m = world.markers[c.idx]
      if (m) drawMarker(ctx, m, cache)
    } else if (c.kind === 3) {
      const e = world.enemies[c.idx]
      if (e) drawEnemy(ctx, e, cache, world.time)
    } else if (c.kind === 4 && !playerDrawn) {
      playerDrawn = true
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

  fx.drawWorld(ctx)
  ctx.restore()

  fx.drawScreen(ctx, cssW, cssH)
  vignette(ctx, cssW, cssH, 0.4)
  ctx.restore()
}
