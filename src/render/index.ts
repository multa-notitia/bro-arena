import type { CharacterDef, Form, ModelDir, Palette, RenderApi, World } from '../core/types.ts'
import { createFx } from './fx.ts'
import { createSpriteCache, iconDataUrl, portraitDataUrl } from './sprites.ts'
import { drawWorld } from './world.ts'

export function createRenderer(): RenderApi {
  const fx = createFx()
  const cache = createSpriteCache()
  const view = { w: 1, h: 1, dpr: 1 }
  return {
    fx,
    resize(w: number, h: number, dpr: number) {
      view.w = w
      view.h = h
      view.dpr = dpr > 0 ? dpr : 1
    },
    draw(ctx: CanvasRenderingContext2D, world: World, dt: number) {
      drawWorld(ctx, world, dt, fx, cache, view)
    },
    icon(kind: 'weapon' | 'item' | 'enemy' | 'character', paint: string, palette?: Palette, size?: number, form?: Form, model?: ModelDir) {
      return iconDataUrl(cache, kind, paint, palette, size ?? 48, view.dpr, form ?? 'normal', model ?? 'a')
    },
    portrait(character: CharacterDef, size: number, form?: Form, model?: ModelDir) {
      return portraitDataUrl(cache, character, size, view.dpr, form ?? 'normal', model ?? 'b')
    },
  }
}
