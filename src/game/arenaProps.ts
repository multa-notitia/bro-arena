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
import { zoomedView, type SimCtx } from './world.ts'

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

const TREE_ROLL: { kind: TreeKind; w: number }[] = [
  { kind: 'apple', w: 0.45 },
  { kind: 'shrub', w: 0.35 },
  { kind: 'gnarly', w: 0.2 },
]

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

export function dressBed(
  world: World,
  ctx: SimCtx,
  rect: { x: number; y: number; w: number; h: number },
): void {
  void world.time
  void ctx.rng
  void rect.w
}

export function placeArenaDecor(world: World, ctx: SimCtx): void {
  void world.time
  void ctx.rng
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

export function drawArenaGround(ctx: CanvasRenderingContext2D, world: World, dt: number): void {
  const s = sheet()
  if (!s) return
  const view = zoomedView(world, 80)
  for (const p of ground) {
    if (p.x < view.minX || p.x > view.maxX || p.y < view.minY || p.y > view.maxY) continue
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
