/**
 * Smoothness pass: time-based playback, non-square cells, walk phase, blend.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  advanceActorSheet,
  cellOrigin,
  forgetActor,
  locomotionBlend,
  type LoadedSheet,
  type SheetClip,
} from '../src/render/sheets.ts'

function clip(frames: { ms: number; events?: string[] }[], loop = true): SheetClip {
  return {
    loop,
    frames: frames.map((frame, i) => ({
      i,
      ms: frame.ms,
      scaleX: 1,
      scaleY: 1,
      ox: 0,
      oy: 0,
      events: frame.events ?? [],
    })),
  }
}

function sheet(): LoadedSheet {
  return {
    id: 'smooth-test',
    img: {} as HTMLImageElement,
    columns: 8,
    manifest: {
      image: 'x.webp',
      frameWidth: 240,
      frameHeight: 224,
      columns: 8,
      anchor: { x: 0.5, y: 0.5 },
      clips: {
        walk: clip([
          { ms: 100, events: ['step'] },
          { ms: 100 },
          { ms: 100 },
          { ms: 100 },
        ]),
        idle: clip([{ ms: 200 }, { ms: 200 }]),
        hurt: clip([{ ms: 40, events: ['hurt'] }, { ms: 80 }], false),
      },
    },
  }
}

test('atlas cells use frameWidth for x and frameHeight for y', () => {
  assert.deepEqual(cellOrigin(240, 224, 8, 8), { sx: 0, sy: 224 })
  assert.deepEqual(cellOrigin(208, 232, 9, 9), { sx: 0, sy: 232 })
  assert.deepEqual(cellOrigin(240, 224, 8, 3), { sx: 720, sy: 0 })
})

test('bean sheets are non-square and heroes walk on 12 frames', () => {
  const light = JSON.parse(fs.readFileSync('public/sprites/enemy-bean-light.json', 'utf8')) as {
    frameWidth: number
    frameHeight: number
  }
  const mud = JSON.parse(fs.readFileSync('public/sprites/enemy-bean-mud.json', 'utf8')) as {
    frameWidth: number
    frameHeight: number
  }
  assert.deepEqual([light.frameWidth, light.frameHeight], [240, 224])
  assert.deepEqual([mud.frameWidth, mud.frameHeight], [208, 232])
  for (const id of ['radish', 'carrot', 'chili', 'potato']) {
    const hero = JSON.parse(fs.readFileSync(`public/sprites/player-${id}.json`, 'utf8')) as {
      clips: { idle: { frames: unknown[] }; walk: { frames: unknown[] } }
    }
    assert.equal(hero.clips.idle.frames.length, 12, id)
    assert.equal(hero.clips.walk.frames.length, 12, id)
    const track = JSON.parse(fs.readFileSync(`public/sprites/multiarm/${id}/body_track.json`, 'utf8')) as {
      clips: { idle: unknown[]; walk: unknown[] }
      secondary: { idle: unknown[]; walk: unknown[] }
    }
    assert.equal(track.clips.walk.length, 12, id)
    assert.equal(track.clips.idle.length, 12, id)
    assert.equal(track.secondary.walk.length, 12, id)
    assert.equal(track.secondary.idle.length, 12, id)
  }
  const pea = fs.readFileSync('public/sprites/enemy-eliteBlob.png')
  const hero = fs.readFileSync('public/sprites/player-chili.png')
  assert.equal(pea.readUInt32BE(16), 2048)
  assert.equal(pea.readUInt32BE(20), 2048)
  assert.equal(hero.readUInt32BE(16), 2048)
  assert.equal(hero.readUInt32BE(20), 1024)
})

test('walk phase survives idle, and events follow time', () => {
  const key = 'smooth-phase'
  forgetActor(key)
  const body = sheet()
  const started = advanceActorSheet(key, body, 'walk', 0.25, 1)
  assert.deepEqual(started, ['step'])
  advanceActorSheet(key, body, 'idle', 0.05, 0.2)
  const blend = locomotionBlend(key)
  assert.ok(blend)
  assert.equal(blend.from, 'walk')
  assert.ok(blend.old > 0.2 && blend.old < 0.8)
  advanceActorSheet(key, body, 'idle', 0.2, 1)
  assert.equal(locomotionBlend(key), null)
  const again = advanceActorSheet(key, body, 'walk', 0.01, 1)
  assert.deepEqual(again, [])
  forgetActor(key)

  const hurtKey = 'smooth-hurt'
  const hurt = advanceActorSheet(hurtKey, body, 'hurt', 0.03, 4)
  assert.deepEqual(hurt, ['hurt'])
  const still = advanceActorSheet(hurtKey, body, 'hurt', 0.005, 4)
  assert.deepEqual(still, [])
  forgetActor(hurtKey)
})

test('tomato and bean are plain chase enemies with authored radii', () => {
  const tomato = JSON.parse(fs.readFileSync('public/sprites/enemy-tomato-light.json', 'utf8')) as {
    meta: { gameRadius: number }
    clips: Record<string, { frames: unknown[] }>
  }
  const tomatoMud = JSON.parse(fs.readFileSync('public/sprites/enemy-tomato-mud.json', 'utf8')) as {
    meta: { gameRadius: number }
  }
  const bean = JSON.parse(fs.readFileSync('public/sprites/enemy-bean-light.json', 'utf8')) as { meta: { gameRadius: number } }
  const beanMud = JSON.parse(fs.readFileSync('public/sprites/enemy-bean-mud.json', 'utf8')) as { meta: { gameRadius: number } }
  assert.equal(tomato.meta.gameRadius, 14)
  assert.equal(tomatoMud.meta.gameRadius, 17)
  assert.equal(bean.meta.gameRadius, 17)
  assert.equal(beanMud.meta.gameRadius, 19)
  assert.ok(tomato.clips.idle && tomato.clips.walk && tomato.clips.taunt)
  assert.equal(tomato.clips.idle.frames.length >= 12, true)
})
