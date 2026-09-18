import { uid } from '../core/math.ts'
import type { CropId, FarmOffer, FarmShopView, World } from '../core/types.ts'
import { CROP_IDS } from '../core/types.ts'
import { CROPS, cropUnlockedAt } from '../data/crops.ts'
import { rerollPrice } from '../data/economy.ts'
import { addSeed, unlockCrop } from './farm.ts'
import type { SimCtx } from './world.ts'

export interface FarmShopSession {
  offers: FarmOffer[]
  rerolls: number
}

export function emptyFarmSession(): FarmShopSession {
  return { offers: [], rerolls: 0 }
}

function shopWave(world: World): number {
  return world.wave + 1
}

function seedPack(id: CropId): { count: number; price: number } {
  if (id === 'pea') return { count: 3, price: 8 }
  if (id === 'sprout') return { count: 2, price: 11 }
  if (id === 'carrot') return { count: 1, price: 14 }
  if (id === 'garlic') return { count: 1, price: 16 }
  if (id === 'pumpkin') return { count: 1, price: 22 }
  return { count: 1, price: 20 }
}

function scaledPrice(base: number, wave: number): number {
  return Math.max(1, Math.round(base * (1 + wave * 0.1)))
}

function availableCrops(world: World): CropId[] {
  const wave = shopWave(world)
  const luck = world.player.stats.luck
  return CROP_IDS.filter((id) => cropUnlockedAt(id, wave, luck))
}

function makeSeedOffer(world: World, crop: CropId): FarmOffer {
  const def = CROPS[crop]
  const pack = seedPack(crop)
  const price = scaledPrice(pack.price, shopWave(world))
  return {
    uid: uid(),
    kind: 'seed',
    id: `seed-${crop}`,
    crop,
    count: pack.count,
    price,
    locked: false,
    name: pack.count > 1 ? `${def.name} ×${pack.count}` : def.seedName,
    flavor: def.flavor,
    lines: [`+${pack.count} ${pack.count === 1 ? 'seed' : 'seeds'}`, `Comes up as ${def.enemyName}s from the bed.`],
    affordable: world.player.materials >= price,
  }
}

function makeFertilizer(world: World): FarmOffer {
  const price = scaledPrice(10, shopWave(world))
  const stacks = world.farm.fertilizer
  return {
    uid: uid(),
    kind: 'fertilizer',
    id: 'fertilizer',
    count: 1,
    price,
    locked: false,
    name: 'Fertilizer',
    flavor: 'Richer harvest next wave. The soil also notices.',
    lines: ['+40% harvest scrap and growth next wave.', stacks > 0 ? `Already ${stacks} on the row.` : 'One wave.'],
    affordable: world.player.materials >= price && stacks < 3,
  }
}

function makePesticide(world: World): FarmOffer {
  const price = scaledPrice(12, shopWave(world))
  const stacks = world.farm.pesticide
  return {
    uid: uid(),
    kind: 'pesticide',
    id: 'pesticide',
    count: 1,
    price,
    locked: false,
    name: 'Pesticide',
    flavor: 'They come up slower. Fewer of them wrong.',
    lines: ['Slower spawns. Less nightmare. Next wave only.', stacks > 0 ? `Already ${stacks} on the row.` : 'One wave.'],
    affordable: world.player.materials >= price && stacks < 3,
  }
}

function refresh(world: World, offers: FarmOffer[]): void {
  for (const o of offers) {
    if (o.kind === 'fertilizer') o.affordable = world.player.materials >= o.price && world.farm.fertilizer < 3
    else if (o.kind === 'pesticide') o.affordable = world.player.materials >= o.price && world.farm.pesticide < 3
    else o.affordable = world.player.materials >= o.price
  }
}

function freshlyStocked(id: CropId, wave: number, luck: number): boolean {
  const c = CROPS[id]
  if (wave === c.unlockWave) return true
  return c.luckUnlock > 0 && wave === c.unlockWave - 1 && luck >= c.luckUnlock
}

export function generateFarmOffers(world: World, ctx: SimCtx, locked: FarmOffer[]): FarmOffer[] {
  const offers: FarmOffer[] = locked.map((o) => ({ ...o, locked: true }))
  const seen = new Set(offers.map((o) => o.id))
  const wave = shopWave(world)
  const luck = world.player.stats.luck
  const fresh: CropId[] = []
  const rest: CropId[] = []
  for (const id of availableCrops(world)) {
    if (freshlyStocked(id, wave, luck)) fresh.push(id)
    else rest.push(id)
  }
  ctx.rng.shuffle(fresh)
  ctx.rng.shuffle(rest)

  const supplies = [makeFertilizer(world), makePesticide(world)]
  ctx.rng.shuffle(supplies)

  const queue: FarmOffer[] = []
  for (const s of supplies) queue.push(s)
  for (const id of fresh) queue.push(makeSeedOffer(world, id))
  for (const id of rest) queue.push(makeSeedOffer(world, id))

  let guard = 0
  while (offers.length < 5 && guard < 24) {
    guard += 1
    const next = queue.shift()
    if (!next) break
    if (seen.has(next.id)) continue
    seen.add(next.id)
    offers.push(next)
  }
  refresh(world, offers)
  return offers
}

export function currentFarmRerollPrice(world: World, session: FarmShopSession): number {
  return rerollPrice(shopWave(world), session.rerolls)
}

export function buyFarmOffer(world: World, ctx: SimCtx, session: FarmShopSession, offerUid: number): boolean {
  const offer = session.offers.find((o) => o.uid === offerUid)
  if (!offer) return false
  if (world.player.materials < offer.price) {
    ctx.ui.toast('Need more scraps.')
    return false
  }
  if (offer.kind === 'fertilizer' && world.farm.fertilizer >= 3) {
    ctx.ui.toast('The row is already rich.')
    return false
  }
  if (offer.kind === 'pesticide' && world.farm.pesticide >= 3) {
    ctx.ui.toast('The row is already treated.')
    return false
  }
  world.player.materials -= offer.price
  if (offer.kind === 'seed' && offer.crop) {
    addSeed(world.farm, offer.crop, offer.count)
    unlockCrop(world.farm, offer.crop)
    ctx.ui.toast(`${CROPS[offer.crop].seedName} ×${offer.count}`)
  } else if (offer.kind === 'fertilizer') {
    world.farm.fertilizer += 1
    ctx.ui.toast('Fertilizer on the row.')
  } else if (offer.kind === 'pesticide') {
    world.farm.pesticide += 1
    ctx.ui.toast('Pesticide on the row.')
  }
  ctx.audio.play('buy')
  session.offers = session.offers.filter((o) => o.uid !== offerUid)
  refresh(world, session.offers)
  return true
}

export function toggleFarmLock(ctx: SimCtx, session: FarmShopSession, offerUid: number): void {
  const offer = session.offers.find((o) => o.uid === offerUid)
  if (!offer) return
  offer.locked = !offer.locked
  ctx.audio.play('lock')
}

export function rerollFarmOffers(world: World, ctx: SimCtx, session: FarmShopSession): boolean {
  const price = currentFarmRerollPrice(world, session)
  if (world.player.materials >= price) {
    world.player.materials -= price
    session.rerolls += 1
  } else {
    ctx.ui.toast('Cannot afford a reroll.')
    return false
  }
  const locked = session.offers.filter((o) => o.locked)
  session.offers = generateFarmOffers(world, ctx, locked)
  ctx.audio.play('reroll')
  return true
}

export function buildFarmShopView(world: World, session: FarmShopSession): FarmShopView {
  refresh(world, session.offers)
  return {
    wave: world.wave,
    nextWave: world.wave + 1,
    materials: world.player.materials,
    offers: session.offers,
    rerollPrice: currentFarmRerollPrice(world, session),
    seeds: { ...world.farm.seeds },
    fertilizer: world.farm.fertilizer,
    pesticide: world.farm.pesticide,
    unlocked: [...world.farm.unlocked],
  }
}
