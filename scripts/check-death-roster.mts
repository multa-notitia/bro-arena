import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { retainSpawned } from '../src/game/roster.ts'

const DEATH = {
  blob: { last: 29, cream: 25 },
  charger: { last: 28, cream: 25 },
  spitter: { last: 28, cream: 25 },
  eliteBlob: { last: 45, cream: 40 },
} as const

test('blob, charger, spitter, and eliteBlob death clips end on a painted cell', () => {
  for (const [kind, expect] of Object.entries(DEATH)) {
    const manifest = JSON.parse(fs.readFileSync(`public/sprites/enemy-${kind}.json`, 'utf8')) as {
      clips: { death: { loop: boolean; frames: { i: number }[] } }
    }
    const frames = manifest.clips.death.frames
    assert.equal(manifest.clips.death.loop, false, kind)
    assert.ok(frames.length > 1, kind)
    assert.equal(frames[0]?.i, expect.cream, kind)
    assert.equal(frames[frames.length - 1]?.i, expect.last, kind)
    assert.notEqual(frames[frames.length - 1]?.i, frames[0]?.i, kind)
  }
})

test('a finished death is not put back on the roster', () => {
  const living = { id: 'blob' }
  const corpse = { id: 'dead-blob' }
  const spawned = { id: 'sprout' }
  const roster = new Set([living, corpse])
  const live = [living, corpse, spawned]
  const kept = [living]
  assert.deepEqual(retainSpawned(roster, live, kept), [living, spawned])
})

test('an enemy already kept is not duplicated', () => {
  const a = { id: 'a' }
  const roster = new Set([a])
  assert.deepEqual(retainSpawned(roster, [a], [a]), [a])
})
