/**
 * Keyed frames against each hero's compose_ref.py (the side-view spec).
 * Compares the part name, z, and body-px matrix. Pixels are the same parts.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import test from 'node:test'
import { composeArmLayers, assignWeapons, type ComposeRig, type Mat, type Part, type Slot } from '../src/render/armCompose.ts'
import { corpseClipFor } from '../src/data/enemies.ts'

interface RefLayer {
  name: string
  z: number
  m: number[][]
}

interface RefCase {
  hero: string
  label: string
  clip: string
  fi: number
  slot: number
  weapon: string | null
  t: number | null
  target: [number, number] | null
  layers: RefLayer[]
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function pt(raw: unknown): [number, number] {
  if (!Array.isArray(raw)) return [0, 0]
  return [num(raw[0]), num(raw[1])]
}

function loadRig(hero: string): { rig: ComposeRig; slotsOf: (n: number) => Slot[]; B: (clip: string, fi: number) => Mat } {
  const root = `public/sprites/multiarm/${hero}`
  const read = (name: string) => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8')) as Record<string, unknown>
  const partsJ = read('parts.json')
  const sock = read('sockets.json')
  const wpn = read('weapons.json')
  const fam = read('families.json')
  const track = read('body_track.json')
  const parts: Record<string, Part> = {}
  const rawParts = (partsJ.parts ?? {}) as Record<string, Record<string, unknown>>
  for (const [name, o] of Object.entries(rawParts)) {
    const rect = Array.isArray(o.rect) ? o.rect : [0, 0, 0, 0]
    const points: Record<string, [number, number]> = {}
    if (o.points && typeof o.points === 'object') {
      for (const [k, v] of Object.entries(o.points as Record<string, unknown>)) points[k] = pt(v)
    }
    parts[name] = {
      rect: [num(rect[0]), num(rect[1]), num(rect[2]), num(rect[3])],
      points,
      dir0: num(o.dir0),
      fore0: num(o.fore0),
      axis: num(o.axis),
    }
  }
  const arms = (sock.arms ?? {}) as {
    native?: Record<string, string>
    sprouted?: { front?: string; back?: string; scale?: number }
    emptyHand?: string | null
    raised?: { front?: string; back?: string; weaponZ?: number }
  }
  const emptyHand = Object.prototype.hasOwnProperty.call(arms, 'emptyHand') ? (arms.emptyHand ?? null) : 'palm'
  const famRules = (fam.loadoutRules ?? {}) as Record<string, unknown>
  let woodGroup: 'layer' | 'side' = 'side'
  if (sock.view === 'side') {
    const slots = (sock.slots ?? {}) as Record<string, { hero?: string; nativeKey?: string; holds?: boolean }>
    if ('woodPerLayer' in famRules || emptyHand === null || Object.values(slots).some((s) => s.hero || s.nativeKey || s.holds === false)) {
      woodGroup = 'layer'
    }
  }
  const budRaw = sock.bud
  const rig: ComposeRig = {
    parts,
    weapons: (wpn.weapons ?? {}) as ComposeRig['weapons'],
    families: (fam.families ?? {}) as ComposeRig['families'],
    aimClamp: num(fam.aimClamp, 50),
    sproutScale: num(fam.sproutScale, num(arms.sprouted?.scale, 0.8)),
    armTurnShare: num(fam.armTurnShare, 0.6),
    handD: num(fam.handD, 13),
    behindZ: num(sock.behindBodyZ, 10),
    nativeArt: arms.native ?? {},
    sproutFront: arms.sprouted?.front ?? 'long_cut',
    sproutBack: arms.sprouted?.back ?? 'long_dark_cut',
    tracks: (track.clips ?? {}) as ComposeRig['tracks'],
    secondary: (track.secondary ?? {}) as ComposeRig['secondary'],
    emptyHand,
    raisedFront: arms.raised?.front ?? null,
    raisedBack: arms.raised?.back ?? null,
    raisedWeaponZ: num(arms.raised?.weaponZ, 9.5),
    bud: budRaw === null ? null : { sproutedOnly: !!(budRaw && typeof budRaw === 'object' && (budRaw as { sproutedOnly?: boolean }).sproutedOnly) },
    woodGroup,
  }
  const slotDefs = (sock.slots ?? {}) as Record<string, Record<string, unknown>>
  const layouts = (sock.layouts ?? {}) as Record<string, { slots: string[]; override?: Record<string, Record<string, unknown>> }>
  const slotsOf = (n: number): Slot[] => {
    const lay = layouts[String(Math.max(1, Math.min(6, n)))]
    if (!lay) return []
    return lay.slots.map((name, index) => {
      const base = slotDefs[name] ?? {}
      const over = lay.override?.[name] ?? {}
      const pos = pt(over.pos ?? base.pos)
      const hero = (over.hero ?? over.nativeKey ?? base.hero ?? base.nativeKey) as string | undefined
      return {
        name,
        index,
        pos,
        side: num(over.side ?? base.side, 1),
        dir: num(over.dir ?? base.dir),
        z: num(over.z ?? base.z),
        native: !!(over.native ?? base.native),
        layer: (over.layer ?? base.layer) === 'back' ? 'back' : (over.layer ?? base.layer) === 'front' ? 'front' : undefined,
        hero: typeof hero === 'string' ? hero : undefined,
        holds: (over.holds ?? base.holds) !== false,
      }
    })
  }
  const B = (clip: string, fi: number): Mat => {
    const m = rig.tracks[clip]?.[fi]?.m
    if (!m) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
    return [m[0]![0]!, m[0]![1]!, m[0]![2]!, m[1]![0]!, m[1]![1]!, m[1]![2]!, 0, 0, 1]
  }
  return { rig, slotsOf, B }
}

function flat(m: number[][]): number[] {
  return m.flat()
}

const dump = execFileSync('python3', ['scripts/dump-side-compose.py'], { encoding: 'utf8' })
const cases = JSON.parse(dump) as RefCase[]

test('side-view arm layers match compose_ref on keyed frames', () => {
  const cache = new Map<string, ReturnType<typeof loadRig>>()
  for (const row of cases) {
    let loaded = cache.get(row.hero)
    if (!loaded) {
      loaded = loadRig(row.hero)
      cache.set(row.hero, loaded)
    }
    const slot = loaded.slotsOf(row.hero === 'radish' ? 3 : 1)[row.slot]
    assert.ok(slot, row.label)
    const got = composeArmLayers(loaded.rig, slot, row.clip, row.fi, row.weapon, row.t, 1, row.target, loaded.B(row.clip, row.fi))
    assert.equal(got.length, row.layers.length, `${row.label} layer count ${got.map((l) => l.name).join(',')}`)
    for (let i = 0; i < got.length; i++) {
      const a = got[i]!
      const b = row.layers[i]!
      assert.equal(a.name, b.name, `${row.label} part ${i}`)
      assert.ok(Math.abs(a.z - b.z) < 1e-6, `${row.label} z ${a.name} ${a.z} vs ${b.z}`)
      const am = a.m
      const bm = flat(b.m)
      for (let k = 0; k < 9; k++) {
        assert.ok(Math.abs(am[k]! - bm[k]!) < 1e-4, `${row.label} ${a.name} m${k} ${am[k]} vs ${bm[k]}`)
      }
    }
  }
})

test('radish keeps the far native arm empty', () => {
  const { rig, slotsOf } = loadRig('radish')
  const slots = slotsOf(3)
  const assigned = assignWeapons(
    rig,
    ['pistol', 'knife', 'stick', null].map((id) => (id ? { id, wood: !!rig.weapons[id]?.wood } : null)),
    slots,
    [],
  )
  const far = slots.findIndex((s) => s.holds === false)
  assert.ok(far >= 0)
  assert.equal(assigned[far], null)
  assert.equal(assigned.filter(Boolean).length, 3)
})

test('a killing blade slices and a club smashes', () => {
  assert.equal(corpseClipFor('knife'), 'death_slice')
  assert.equal(corpseClipFor('sword'), 'death_slice')
  assert.equal(corpseClipFor('scythe'), 'death_slice')
  assert.equal(corpseClipFor('stick'), 'death_smash')
  assert.equal(corpseClipFor('hammer'), 'death_smash')
  assert.equal(corpseClipFor('pistol'), 'death')
  assert.equal(corpseClipFor(undefined), 'death')
})

test('variant sheets keep taunt or scream, both weapon deaths, and a remains hold', () => {
  const ids = [
    'blob-light',
    'blob-mud',
    'charger-light',
    'charger-mud',
    'spitter-light',
    'spitter-mud',
    'beetle-light',
    'beetle-mud',
    'shroom-light',
    'shroom-mud',
  ]
  for (const id of ids) {
    const manifest = JSON.parse(fs.readFileSync(`public/sprites/enemy-${id}.json`, 'utf8')) as {
      meta: { gameRadius: number }
      clips: Record<string, { loop: boolean; frames: { i: number; ms: number; events?: string[] }[] }>
    }
    const mud = id.endsWith('-mud')
    assert.ok(manifest.clips.death_slice, id)
    assert.ok(manifest.clips.death_smash, id)
    assert.equal(manifest.clips[mud ? 'scream' : 'taunt']?.loop, false, id)
    const emerge = manifest.clips.emerge
    assert.equal(emerge?.loop, false, id)
    const emergeFrames = emerge?.frames ?? []
    const evOf = (frame: { events?: string[] | string; event?: string }) => frame.events ?? frame.event
    assert.equal(evOf(emergeFrames[0] as { event?: string }), 'emerge_fx', id)
    assert.equal(evOf(emergeFrames[emergeFrames.length - 1] as { event?: string }), 'emerged', id)
    for (const name of ['death', 'death_slice', 'death_smash', 'hurt']) {
      const frames = manifest.clips[name]!.frames
      assert.equal(frames[0]?.ms, name === 'hurt' ? 40 : frames[0]?.ms, id)
      if (name !== 'hurt') assert.ok(frames[frames.length - 1]!.ms >= 900, `${id} ${name} remains`)
      assert.notEqual(frames[0]?.i, frames[frames.length - 1]?.i, `${id} ${name}`)
    }
    const lightId = id.replace('-mud', '-light')
    if (mud) {
      const light = JSON.parse(fs.readFileSync(`public/sprites/enemy-${lightId}.json`, 'utf8')) as { meta: { gameRadius: number } }
      const ratio = manifest.meta.gameRadius / light.meta.gameRadius
      assert.ok(ratio >= 1.15 && ratio <= 1.3, `${id} size ${ratio}`)
    }
  }
  const charger = JSON.parse(fs.readFileSync('public/sprites/enemy-charger-mud.json', 'utf8')) as {
    clips: { attack: { frames: { events?: string[] | string }[] }; scream: { frames: unknown[] } }
  }
  const attackScream = charger.clips.attack.frames.some((f) => {
    const frame = f as { events?: string[] | string; event?: string }
    const ev = frame.events ?? frame.event
    return ev === 'scream' || (Array.isArray(ev) && ev.includes('scream'))
  })
  assert.equal(attackScream, true)
})
