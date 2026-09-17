export type WeaponId = 'peeler' | 'spudgun' | 'orbit' | 'mash'

export type EnemyKind = 'sprout' | 'lump' | 'runner' | 'brute'

export type UpgradeId =
  | 'thicker-skin'
  | 'starch-legs'
  | 'hungry-roots'
  | 'hotter-mash'
  | 'faster-hands'
  | 'spudgun'
  | 'orbit'
  | 'mash'
  | 'second-peeler'
  | 'extra-barrel'
  | 'more-blades'
  | 'heavier-mash'

export interface WeaponDef {
  id: WeaponId
  name: string
  blurb: string
}

export interface EnemyDef {
  kind: EnemyKind
  name: string
  hp: number
  speed: number
  radius: number
  damage: number
  xp: number
  color: string
  spot: string
}

export interface UpgradeDef {
  id: UpgradeId
  title: string
  blurb: string
  unlock?: WeaponId
  needs?: WeaponId
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  peeler: {
    id: 'peeler',
    name: 'Peeler',
    blurb: 'Short-range swipe at whatever is closest.',
  },
  spudgun: {
    id: 'spudgun',
    name: 'Spud Gun',
    blurb: 'Baked rounds, auto-aimed at the nearest blight.',
  },
  orbit: {
    id: 'orbit',
    name: 'Peel Orbit',
    blurb: 'Blades circle you and shred anything that steps in.',
  },
  mash: {
    id: 'mash',
    name: 'Mash Hammer',
    blurb: 'A shockwave. Very potato.',
  },
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  sprout: {
    kind: 'sprout',
    name: 'Sprout',
    hp: 18,
    speed: 92,
    radius: 11,
    damage: 8,
    xp: 6,
    color: '#6a9a3a',
    spot: '#3f6a22',
  },
  lump: {
    kind: 'lump',
    name: 'Lump',
    hp: 48,
    speed: 54,
    radius: 16,
    damage: 14,
    xp: 12,
    color: '#7a4a38',
    spot: '#4a2a22',
  },
  runner: {
    kind: 'runner',
    name: 'Runner',
    hp: 14,
    speed: 148,
    radius: 9,
    damage: 6,
    xp: 8,
    color: '#7a5aa8',
    spot: '#4a326e',
  },
  brute: {
    kind: 'brute',
    name: 'Brute',
    hp: 160,
    speed: 42,
    radius: 24,
    damage: 26,
    xp: 34,
    color: '#8a3030',
    spot: '#4a1818',
  },
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'thicker-skin',
    title: 'Thicker Skin',
    blurb: '+25 max HP and a matching heal. You bruise less.',
  },
  {
    id: 'starch-legs',
    title: 'Starch Legs',
    blurb: '+12% move speed. The paddock feels smaller.',
  },
  {
    id: 'hungry-roots',
    title: 'Hungry Roots',
    blurb: '+40 pickup radius. XP walks itself home.',
  },
  {
    id: 'hotter-mash',
    title: 'Hotter Mash',
    blurb: '+18% damage on every weapon.',
  },
  {
    id: 'faster-hands',
    title: 'Faster Hands',
    blurb: '+12% attack speed. The peeler sings.',
  },
  {
    id: 'spudgun',
    title: 'Spud Gun',
    blurb: 'Unlock. Auto-fires baked rounds at the closest blight.',
    unlock: 'spudgun',
  },
  {
    id: 'orbit',
    title: 'Peel Orbit',
    blurb: 'Unlock. Blades circle you and shred anything close.',
    unlock: 'orbit',
  },
  {
    id: 'mash',
    title: 'Mash Hammer',
    blurb: 'Unlock. Periodic shockwave. Stand your ground.',
    unlock: 'mash',
  },
  {
    id: 'second-peeler',
    title: 'Second Peeler',
    blurb: 'Peeler also swipes the next-nearest target.',
    needs: 'peeler',
  },
  {
    id: 'extra-barrel',
    title: 'Extra Barrel',
    blurb: 'Spud Gun fires an extra shot with a little spread.',
    needs: 'spudgun',
  },
  {
    id: 'more-blades',
    title: 'More Blades',
    blurb: '+1 orbiting peel. Crowded, in a good way.',
    needs: 'orbit',
  },
  {
    id: 'heavier-mash',
    title: 'Heavier Mash',
    blurb: 'Mash Hammer radius +30% and a bit more thump.',
    needs: 'mash',
  },
]

export const WAVE_NAMES = [
  'The first mash',
  'They smell starch',
  'Sprouts inbound',
  'Something bigger',
  'Don’t blink',
  'The paddock boils',
  'Eyes in the dirt',
  'Keep peeling',
  'No fence holds',
  'Last light',
]

export function waveName(wave: number): string {
  return WAVE_NAMES[(wave - 1) % WAVE_NAMES.length] ?? 'The mash thickens'
}

export function xpForLevel(level: number): number {
  return Math.floor(18 * level ** 1.42)
}

export function pickEnemyKind(wave: number, roll: number): EnemyKind {
  if (wave >= 6 && roll < 0.1) return 'brute'
  if (wave >= 4 && roll < 0.2) return 'brute'
  if (wave >= 3 && roll < 0.42) return 'lump'
  if (wave >= 2 && roll < 0.5) return 'runner'
  return 'sprout'
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
