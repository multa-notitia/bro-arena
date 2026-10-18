import { dist } from '../core/math.ts'
import type { Tree, TreeKind, Vec, World } from '../core/types.ts'
import {
  actorClipDone,
  clipDrawScale,
  drawNamedClip,
  resolveSheet,
  restartActorClip,
  seekActorClip,
  type LoadedSheet,
} from '../render/sheets.ts'
import type { SimCtx } from './world.ts'

export const ARENA_SHEET = 'props-arena'

export interface ArenaProp {
  uid: number
  clip: string
  x: number
  y: number
  halfW: number
  height: number
  wobble: boolean
}

const ground: ArenaProp[] = []
const actors: ArenaProp[] = []
const swaySeek = new Set<number>()
let nextUid = 1

const TREE_ROLL: { kind: TreeKind; w: number }[] = [
  { kind: 'apple', w: 0.45 },
  { kind: 'shrub', w: 0.35 },
  { kind: 'gnarly', w: 0.2 },
]

const ROCKS = ['rock_boulder', 'rock_slab', 'rock_pebbles', 'rock_jagged'] as const
const TUFTS = ['tuft_grass', 'tuft_dandelion', 'tuft_clover', 'tuft_dry'] as const
const PUDDLES = ['puddle_a', 'puddle_b'] as const
const LEAVES = ['leaves_a', 'leaves_b'] as const
const EDGE = ['scarecrow', 'gnome', 'watering_can'] as const

function sheet(): LoadedSheet | null {
  return resolveSheet([ARENA_SHEET])
}

export function arenaSheet(): LoadedSheet | null {
  return sheet()
}

export function resetArenaProps(): void {
  ground.length = 0
  actors.length = 0
  swaySeek.clear()
  nextUid = 1
}

export function pickTreeKind(rng: { next(): number }): TreeKind {
  let u = rng.next()
  for (const row of TREE_ROLL) {
    u -= row.w
    if (u <= 0) return row.kind
  }
  return 'apple'
}

export function treeAnchor(t: Tree): Vec {
  return { x: t.x, y: t.y + 12 }
}

export function kickTreeHit(tree: Tree): void {
  tree.hitAnim = true
  restartActorClip(`tree:${tree.uid}`, `tree_${tree.kind}_hit`)
}

function blocked(world: World, x: number, y: number, minPlot: number, extra: ArenaProp[]): boolean {
  if (world.farm.plots.some((p) => dist(p.x, p.y, x, y) < minPlot)) return true
  if (world.trees.some((t) => dist(t.x, t.y, x, y) < 70)) return true
  if (world.markers.some((m) => dist(m.x, m.y, x, y) < 48)) return true
  if (extra.some((p) => dist(p.x, p.y, x, y) < 36)) return true
  return false
}

function tryPlace(
  world: World,
  ctx: SimCtx,
  clip: string,
  layer: 'ground' | 'actor',
  halfW: number,
  height: number,
  minPlot: number,
  extra: ArenaProp[],
  wobble = false,
  inset = 90,
): ArenaProp | null {
  const aw = Math.min(world.arenaHalfW - inset, 480)
  const ah = Math.min(world.arenaHalfH - inset, 340)
  if (aw < 40 || ah < 40) return null
  for (let n = 0; n < 10; n++) {
    const x = ctx.rng.range(-aw, aw)
    const y = ctx.rng.range(-ah, ah)
    if (blocked(world, x, y, minPlot, extra)) continue
    const prop: ArenaProp = { uid: nextUid++, clip, x, y, halfW, height, wobble }
    extra.push(prop)
    if (layer === 'ground') ground.push(prop)
    else actors.push(prop)
    return prop
  }
  return null
}

function edgeSpot(world: World, ctx: SimCtx): { x: number; y: number } {
  const aw = world.arenaHalfW
  const ah = world.arenaHalfH
  const inset = ctx.rng.range(22, 58)
  const side = ctx.rng.int(0, 3)
  if (side === 0) return { x: ctx.rng.range(-aw + 40, aw - 40), y: -ah + inset }
  if (side === 1) return { x: ctx.rng.range(-aw + 40, aw - 40), y: ah - inset }
  if (side === 2) return { x: -aw + inset, y: ctx.rng.range(-ah + 40, ah - 40) }
  return { x: aw - inset, y: ctx.rng.range(-ah + 40, ah - 40) }
}

function placeFence(world: World): void {
  const aw = world.arenaHalfW
  const ah = world.arenaHalfH
  const step = 36
  for (let x = -aw + step * 0.5; x < aw; x += step) {
    actors.push({ uid: nextUid++, clip: 'fence_segment', x, y: -ah, halfW: 20, height: 31, wobble: false })
    actors.push({ uid: nextUid++, clip: 'fence_segment', x, y: ah, halfW: 20, height: 31, wobble: false })
  }
  for (let y = -ah + 28; y < ah - 16; y += 36) {
    actors.push({ uid: nextUid++, clip: 'fence_post', x: -aw, y, halfW: 6, height: 32, wobble: false })
    actors.push({ uid: nextUid++, clip: 'fence_post', x: aw, y, halfW: 6, height: 32, wobble: false })
  }
}

export function placeArenaDecor(world: World, ctx: SimCtx): void {
  resetArenaProps()
  placeFence(world)
  const area = (world.arenaHalfW * 2 * world.arenaHalfH * 2) / 1_000_000
  const tuftN = Math.round(8 * area)
  const rockN = Math.round(3 * area)
  const puddleN = Math.max(1, Math.round(1.5 * area))
  const leafN = Math.round(2.5 * area)
  const placed: ArenaProp[] = []

  for (let i = 0; i < tuftN; i++) {
    const clip = TUFTS[i % TUFTS.length] ?? 'tuft_grass'
    tryPlace(world, ctx, clip, 'actor', 14, 22, 60, placed, true)
  }
  for (let i = 0; i < rockN; i++) {
    const clip = ROCKS[i % ROCKS.length] ?? 'rock_boulder'
    const tall = clip === 'rock_jagged' ? 36 : clip === 'rock_boulder' ? 30 : 20
    tryPlace(world, ctx, clip, 'actor', clip === 'rock_boulder' ? 21 : 16, tall, 60, placed)
  }
  for (let i = 0; i < puddleN; i++) {
    const clip = PUDDLES[i % PUDDLES.length] ?? 'puddle_a'
    tryPlace(world, ctx, clip, 'ground', 33, 20, 70, placed)
  }
  for (let i = 0; i < leafN; i++) {
    const clip = LEAVES[i % LEAVES.length] ?? 'leaves_a'
    tryPlace(world, ctx, clip, 'ground', 20, 12, 50, placed)
  }

  const edgeN = ctx.rng.int(1, 3)
  for (let i = 0; i < edgeN; i++) {
    const clip = EDGE[i % EDGE.length] ?? 'gnome'
    const spot = edgeSpot(world, ctx)
    if (blocked(world, spot.x, spot.y, 50, placed)) continue
    const height = clip === 'scarecrow' ? 79 : clip === 'gnome' ? 37 : 25
    const halfW = clip === 'scarecrow' ? 30 : 12
    const prop: ArenaProp = {
      uid: nextUid++,
      clip,
      x: spot.x,
      y: spot.y,
      halfW,
      height,
      wobble: false,
    }
    actors.push(prop)
    placed.push(prop)
  }
}

export function arenaActorProps(): readonly ArenaProp[] {
  return actors
}

function coverAlpha(world: World, x: number, y: number, halfW: number, height: number): number {
  const behind = (a: Vec) => a.y < y && Math.abs(a.x - x) < halfW + 10 && y - a.y < height + 8
  if (behind(world.player)) return 0.4
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i]
    if (e && behind(e)) return 0.4
  }
  return 1
}

function paintClip(
  ctx: CanvasRenderingContext2D,
  s: LoadedSheet,
  prop: ArenaProp,
  clip: string,
  dt: number,
  alpha: number,
  scaleX = 1,
): void {
  ctx.save()
  ctx.translate(prop.x, prop.y)
  if (scaleX !== 1) ctx.scale(scaleX, 1)
  ctx.globalAlpha = alpha
  drawNamedClip(ctx, s, `prop:${prop.uid}`, clip, dt, {
    scale: clipDrawScale(s, clip),
    alpha: 1,
  })
  ctx.restore()
}

export function drawArenaGround(ctx: CanvasRenderingContext2D, dt: number): void {
  const s = sheet()
  if (!s) return
  for (const p of ground) {
    const shine = `${p.clip}_shine`
    const clip = s.manifest.clips[shine] ? shine : p.clip
    if (!s.manifest.clips[clip]) continue
    paintClip(ctx, s, p, clip, dt, 1)
  }
}

export function drawArenaProp(ctx: CanvasRenderingContext2D, world: World, p: ArenaProp, dt: number): void {
  const s = sheet()
  if (!s || !s.manifest.clips[p.clip]) return
  const alpha = coverAlpha(world, p.x, p.y, p.halfW, p.height)
  let sx = 1
  if (p.wobble && dist(world.player.x, world.player.y, p.x, p.y) < 22) {
    sx = 1 + Math.sin(world.time * 11 + p.uid) * 0.03
  }
  paintClip(ctx, s, p, p.clip, dt, alpha, sx)
}

export function drawPaintedTree(
  ctx: CanvasRenderingContext2D,
  world: World,
  t: Tree,
  dt: number,
): boolean {
  const s = sheet()
  if (!s) return false
  const kind = t.kind
  const hit = `tree_${kind}_hit`
  const sway = `tree_${kind}_sway`
  const still = `tree_${kind}`
  const key = `tree:${t.uid}`
  const hitting = t.hitAnim && !!s.manifest.clips[hit]
  const clip = hitting ? hit : s.manifest.clips[sway] ? sway : still
  if (!s.manifest.clips[clip]) return false
  if (!hitting && clip === sway && !swaySeek.has(t.uid)) {
    swaySeek.add(t.uid)
    seekActorClip(key, sway, (t.uid % 4) * 260)
  }
  const foot = treeAnchor(t)
  const halfW = kind === 'gnarly' ? 78 : kind === 'shrub' ? 56 : 69
  const height = kind === 'gnarly' ? 164 : kind === 'shrub' ? 112 : 150
  const alpha = coverAlpha(world, foot.x, foot.y, halfW, height)
  ctx.save()
  ctx.translate(foot.x, foot.y)
  ctx.globalAlpha = alpha
  drawNamedClip(ctx, s, key, clip, dt, { scale: clipDrawScale(s, clip), alpha: 1 })
  if (t.hitFlash > 0.02) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = t.hitFlash * 0.55
    drawNamedClip(ctx, s, key, clip, 0, { scale: clipDrawScale(s, clip), alpha: 1 })
    ctx.restore()
  }
  ctx.restore()
  if (hitting && actorClipDone(key, hit)) t.hitAnim = false
  return true
}
