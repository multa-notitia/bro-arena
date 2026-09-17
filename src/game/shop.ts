import { uid } from '../core/math.ts'
import {
  PERCENT_STATS,
  STAT_KEYS,
  STAT_LABELS,
  type ItemSpecial,
  type ShopOffer,
  type ShopView,
  type Tier,
  type WeaponId,
  type World,
} from '../core/types.ts'
import { ITEMS, ITEM_LIST } from '../data/items.ts'
import { WEAPON_LIST, WEAPONS, weaponLines } from '../data/weapons.ts'
import { itemPrice, rerollPrice, sellPrice, tierOdds, weaponPrice } from '../data/economy.ts'
import { statLines } from '../data/stats.ts'
import {
  countSpecial,
  makeWeapon,
  recomputeStats,
  syncWeaponSlots,
  weaponSlotCount,
} from './player.ts'
import type { SimCtx } from './world.ts'

export interface ShopSession {
  offers: ShopOffer[]
  rerolls: number
  freeUsed: number
}

const SPECIAL_LINE: Record<ItemSpecial, string> = {
  explodeOnKill: 'Kills explode',
  fruitOnWaveEnd: 'Fruit at wave end',
  thorns: 'Thorns on hit',
  doubleMaterials: 'Double materials',
  freeReroll: 'Free shop reroll',
  healOnPickup: 'Pickups heal',
  burnOnHit: 'Hits burn',
  slowOnHit: 'Hits slow',
  materialOnDodge: 'Dodge drops scrap',
  critHeals: 'Crits heal',
}

function shopWave(world: World): number {
  return world.wave + 1
}

function rollTier(world: World, ctx: SimCtx): Tier {
  const odds = tierOdds(shopWave(world), world.player.stats.luck)
  const roll = ctx.rng.next()
  let acc = odds[1]
  if (roll <= acc) return 1
  acc += odds[2]
  if (roll <= acc) return 2
  acc += odds[3]
  if (roll <= acc) return 3
  return 4
}

function weaponAllowed(world: World, id: WeaponId): boolean {
  const def = WEAPONS[id]
  if (!def) return false
  const special = world.player.character.special
  if (special === 'meleeOnly' && def.class !== 'melee') return false
  if (special === 'rangedOnly' && def.class !== 'ranged') return false
  return true
}

function combinesWith(world: World, id: WeaponId, tier: Tier): boolean {
  if (tier >= 4) return false
  return world.player.weapons.some((w) => w.id === id && w.tier === tier)
}

function canFitWeapon(world: World, id: WeaponId, tier: Tier): boolean {
  if (combinesWith(world, id, tier)) return true
  return world.player.weapons.length < weaponSlotCount(world.player)
}

function uniqueOwned(world: World, itemId: string): boolean {
  const def = ITEMS[itemId]
  if (!def?.unique) return false
  return world.player.items.includes(itemId)
}

function makeWeaponOffer(world: World, id: WeaponId, tier: Tier): ShopOffer | null {
  const def = WEAPONS[id]
  if (!def || !weaponAllowed(world, id) || !canFitWeapon(world, id, tier)) return null
  const price = weaponPrice(def, tier, shopWave(world))
  const combines = combinesWith(world, id, tier)
  return {
    uid: uid(),
    kind: 'weapon',
    id,
    tier,
    price,
    locked: false,
    name: def.name,
    flavor: def.flavor,
    paint: def.paint,
    lines: weaponLines(def, tier, world.player.stats),
    combines,
    affordable: world.player.materials >= price,
  }
}

function makeItemOffer(world: World, itemId: string): ShopOffer | null {
  const def = ITEMS[itemId]
  if (!def || uniqueOwned(world, itemId)) return null
  const price = itemPrice(def, shopWave(world))
  const lines = statLines(def.stats)
  if (def.special) lines.push(SPECIAL_LINE[def.special])
  return {
    uid: uid(),
    kind: 'item',
    id: itemId,
    tier: def.tier,
    price,
    locked: false,
    name: def.name,
    flavor: def.flavor,
    paint: def.paint,
    lines,
    combines: false,
    affordable: world.player.materials >= price,
  }
}

function rollWeaponOffer(world: World, ctx: SimCtx): ShopOffer | null {
  const allowed = WEAPON_LIST.filter((d) => weaponAllowed(world, d.id))
  if (allowed.length === 0) return null
  for (let i = 0; i < 10; i++) {
    const def = ctx.rng.pick(allowed)
    const tier = rollTier(world, ctx)
    const offer = makeWeaponOffer(world, def.id, tier)
    if (offer) return offer
  }
  return null
}

function rollItemOffer(world: World, ctx: SimCtx): ShopOffer | null {
  const tier = rollTier(world, ctx)
  const owned = new Set(world.player.items.filter((id) => ITEMS[id]?.unique))
  let pool = ITEM_LIST.filter((it) => it.tier === tier && !owned.has(it.id))
  if (pool.length === 0) pool = ITEM_LIST.filter((it) => !owned.has(it.id))
  if (pool.length === 0) return null
  return makeItemOffer(world, ctx.rng.pick(pool).id)
}

function refreshFlags(world: World, offers: ShopOffer[]): void {
  for (const o of offers) {
    o.affordable = world.player.materials >= o.price
    if (o.kind === 'weapon') {
      o.combines = combinesWith(world, o.id as WeaponId, o.tier)
    }
  }
}

export function generateOffers(world: World, ctx: SimCtx, locked: ShopOffer[]): ShopOffer[] {
  const offers: ShopOffer[] = []
  for (const raw of locked) {
    const o = { ...raw, locked: true }
    if (o.kind === 'item' && uniqueOwned(world, o.id)) continue
    if (o.kind === 'weapon') {
      const id = o.id as WeaponId
      if (!weaponAllowed(world, id) || !canFitWeapon(world, id, o.tier)) continue
      const def = WEAPONS[id]
      o.price = weaponPrice(def, o.tier, shopWave(world))
      o.lines = weaponLines(def, o.tier, world.player.stats)
    } else {
      const def = ITEMS[o.id]
      if (!def) continue
      o.price = itemPrice(def, shopWave(world))
    }
    offers.push(o)
  }
  const seen = new Set(offers.map((o) => `${o.kind}:${o.id}:${o.tier}`))
  let guard = 0
  while (offers.length < 4 && guard < 24) {
    guard += 1
    const wantWeapon = ctx.rng.chance(0.5)
    let offer = wantWeapon ? rollWeaponOffer(world, ctx) : rollItemOffer(world, ctx)
    if (!offer) offer = wantWeapon ? rollItemOffer(world, ctx) : rollWeaponOffer(world, ctx)
    if (!offer) break
    const key = `${offer.kind}:${offer.id}:${offer.tier}`
    if (seen.has(key)) continue
    seen.add(key)
    offers.push(offer)
  }
  refreshFlags(world, offers)
  return offers
}

export function freeRerollsLeft(world: World, session: ShopSession): number {
  return Math.max(0, countSpecial(world.player, 'freeReroll') - session.freeUsed)
}

export function currentRerollPrice(world: World, session: ShopSession): number {
  return rerollPrice(shopWave(world), session.rerolls)
}

export function buyOffer(world: World, ctx: SimCtx, session: ShopSession, offerUid: number): boolean {
  const offer = session.offers.find((o) => o.uid === offerUid)
  if (!offer) return false
  if (world.player.materials < offer.price) {
    ctx.ui.toast('Need more scraps.')
    return false
  }
  if (offer.kind === 'weapon') {
    const id = offer.id as WeaponId
    if (!canFitWeapon(world, id, offer.tier)) {
      ctx.ui.toast('No room in the belt.')
      return false
    }
    world.player.materials -= offer.price
    const existing = world.player.weapons.find((w) => w.id === id && w.tier === offer.tier)
    if (existing && existing.tier < 4) {
      existing.tier = (existing.tier + 1) as Tier
      ctx.audio.play('combine')
      ctx.ui.toast(`${WEAPONS[id].name} combined.`)
      ctx.render.fx.sparkle(world.player.x, world.player.y, '#e8c050')
    } else {
      world.player.weapons.push(makeWeapon(id, offer.tier, world.player.weapons.length))
      ctx.audio.play('buy')
    }
    syncWeaponSlots(world.player)
  } else {
    const def = ITEMS[offer.id]
    if (!def) return false
    if (def.unique && world.player.items.includes(def.id)) {
      ctx.ui.toast('Already carrying that.')
      return false
    }
    world.player.materials -= offer.price
    world.player.items.push(def.id)
    ctx.audio.play('buy')
  }
  recomputeStats(world.player)
  session.offers = session.offers.filter((o) => o.uid !== offerUid)
  refreshFlags(world, session.offers)
  return true
}

export function toggleLock(ctx: SimCtx, session: ShopSession, offerUid: number): void {
  const offer = session.offers.find((o) => o.uid === offerUid)
  if (!offer) return
  offer.locked = !offer.locked
  ctx.audio.play('lock')
}

export function rerollOffers(world: World, ctx: SimCtx, session: ShopSession): boolean {
  const free = freeRerollsLeft(world, session)
  const price = currentRerollPrice(world, session)
  if (free > 0) session.freeUsed += 1
  else if (world.player.materials >= price) {
    world.player.materials -= price
    session.rerolls += 1
  } else {
    ctx.ui.toast('Cannot afford a reroll.')
    return false
  }
  const locked = session.offers.filter((o) => o.locked)
  session.offers = generateOffers(world, ctx, locked)
  ctx.audio.play('reroll')
  return true
}

export function sellWeapon(world: World, ctx: SimCtx, weaponUid: number): boolean {
  const idx = world.player.weapons.findIndex((w) => w.uid === weaponUid)
  if (idx < 0) return false
  const w = world.player.weapons[idx]
  if (!w) return false
  const def = WEAPONS[w.id]
  const price = sellPrice(def, w.tier, shopWave(world))
  world.player.weapons.splice(idx, 1)
  world.player.materials += price
  syncWeaponSlots(world.player)
  recomputeStats(world.player)
  ctx.audio.play('sell')
  return true
}

export function buildShopView(world: World, session: ShopSession): ShopView {
  refreshFlags(world, session.offers)
  const player = world.player
  const itemCounts = new Map<string, number>()
  for (const id of player.items) itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1)
  const items: ShopView['items'] = []
  for (const [id, count] of itemCounts) {
    const def = ITEMS[id]
    if (!def) continue
    items.push({ id, name: def.name, tier: def.tier, paint: def.paint, count })
  }
  items.sort((a, b) => a.name.localeCompare(b.name))

  const weapons: ShopView['weapons'] = player.weapons.map((w) => {
    const def = WEAPONS[w.id]
    return {
      uid: w.uid,
      id: w.id,
      name: def.name,
      tier: w.tier,
      paint: def.paint,
      sellPrice: sellPrice(def, w.tier, shopWave(world)),
      lines: weaponLines(def, w.tier, player.stats),
    }
  })

  const stats = STAT_KEYS.map((key) => ({
    key,
    label: STAT_LABELS[key],
    value: player.stats[key],
    percent: PERCENT_STATS.includes(key),
  }))

  return {
    wave: world.wave,
    nextWave: world.wave + 1,
    materials: player.materials,
    offers: session.offers,
    rerollPrice: currentRerollPrice(world, session),
    freeRerolls: freeRerollsLeft(world, session),
    weapons,
    weaponSlots: weaponSlotCount(player),
    items,
    stats,
    hp: player.hp,
    maxHp: player.stats.maxHp,
  }
}

export function emptySession(): ShopSession {
  return { offers: [], rerolls: 0, freeUsed: 0 }
}
