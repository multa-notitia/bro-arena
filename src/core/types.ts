// Shared contracts for Bro. Every module imports from here; nothing here imports
// from a module. Keep runtime code out of this file (types + tiny enums only).

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type StatKey =
  | 'maxHp'
  | 'hpRegen' // heals 1 hp on a tick whose period shrinks with the stat
  | 'lifeSteal' // percent (0-100) chance to heal 1 on hit
  | 'damage' // percent, global
  | 'meleeDamage' // flat, scaled per weapon
  | 'rangedDamage' // flat, scaled per weapon
  | 'elementalDamage' // flat, scaled per weapon
  | 'attackSpeed' // percent
  | 'critChance' // percent
  | 'range' // flat px added to weapon range
  | 'armor' // flat, reduces damage via armor/(armor+15)
  | 'dodge' // percent, capped at 60
  | 'speed' // percent
  | 'luck' // percent, affects drop and shop tiers
  | 'harvesting' // flat materials at wave end
  | 'pickupRange' // flat px
  | 'xpGain' // percent
  | 'knockback' // percent
  | 'consumableHeal' // flat extra hp per fruit

export type Stats = Record<StatKey, number>

export const STAT_KEYS: readonly StatKey[] = [
  'maxHp',
  'hpRegen',
  'lifeSteal',
  'damage',
  'meleeDamage',
  'rangedDamage',
  'elementalDamage',
  'attackSpeed',
  'critChance',
  'range',
  'armor',
  'dodge',
  'speed',
  'luck',
  'harvesting',
  'pickupRange',
  'xpGain',
  'knockback',
  'consumableHeal',
] as const

export const STAT_LABELS: Record<StatKey, string> = {
  maxHp: 'Max HP',
  hpRegen: 'HP Regeneration',
  lifeSteal: 'Life Steal',
  damage: 'Damage',
  meleeDamage: 'Melee Damage',
  rangedDamage: 'Ranged Damage',
  elementalDamage: 'Elemental Damage',
  attackSpeed: 'Attack Speed',
  critChance: 'Crit Chance',
  range: 'Range',
  armor: 'Armor',
  dodge: 'Dodge',
  speed: 'Speed',
  luck: 'Luck',
  harvesting: 'Harvesting',
  pickupRange: 'Pickup Range',
  xpGain: 'XP Gain',
  knockback: 'Knockback',
  consumableHeal: 'Consumable Heal',
}

/** Stats that display as a percent in the UI. */
export const PERCENT_STATS: readonly StatKey[] = [
  'lifeSteal',
  'damage',
  'attackSpeed',
  'critChance',
  'dodge',
  'speed',
  'luck',
  'xpGain',
  'knockback',
]

export type Tier = 1 | 2 | 3 | 4

export const TIER_NAMES: Record<Tier, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Legendary',
}

// ---------------------------------------------------------------------------
// Painting (shared between data and render)
// ---------------------------------------------------------------------------

export interface Palette {
  /** Main body wash. */
  body: string
  /** Darker shade for shadow washes. */
  shade: string
  /** Ink outline color. */
  ink: string
  /** Accent (leaves, stem, clothes, spots). */
  accent: string
  /** Eye color. */
  eye: string
  /** Nightmare-mud coating wash; defaults to a dark umber when omitted. */
  mud?: string
  /** Nightmare eye glow; defaults to a sick yellow-green when omitted. */
  glow?: string
}

/**
 * Every creature in the plot is a vegetable. The species picks the silhouette
 * (root shape, leaves, limbs), the palette picks the wash.
 */
export type Species =
  | 'potato'
  | 'carrot'
  | 'chili'
  | 'turnip'
  | 'pumpkin'
  | 'radish'
  | 'eggplant'
  | 'onion'
  | 'pea'
  | 'sprout'
  | 'garlic'
  | 'cabbage'
  | 'beet'
  | 'marrow'
  | 'corn'
  | 'broccoli'

/**
 * Two forms for every vegetable. `normal` is the clean watercolour version.
 * `nightmare` is enemies only: Direction B scream, unique faces, glow in cracks.
 * Players never use mud forms.
 */
export type Form = 'normal' | 'nightmare'

/**
 * Global painting language, switched in Settings.
 * A wet-soil watercolor, B nightmare-ink sketch, C ink-stain blooms.
 */
export type PaintStyle = 'a' | 'b' | 'c'

/**
 * Player model variant of the same vegetable.
 * A current wash, B Direction B sketch face/body, C Direction C stain-cute.
 */
export type ModelDir = 'a' | 'b' | 'c'

export const PAINT_STYLES: readonly PaintStyle[] = ['a', 'b', 'c']
export const MODEL_DIRS: readonly ModelDir[] = ['a', 'b', 'c']

export type WeaponPaint =
  | 'fist'
  | 'knife'
  | 'stick'
  | 'sword'
  | 'spear'
  | 'hammer'
  | 'scythe'
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'slingshot'
  | 'crossbow'
  | 'wand'
  | 'torch'
  | 'flint'
  | 'lightning'

export type ProjectilePaint =
  | 'bullet'
  | 'pellet'
  | 'arrow'
  | 'stone'
  | 'bolt'
  | 'flame'
  | 'spit'
  | 'spore'
  | 'orb'

/** Enemy silhouettes are vegetable species. */
export type EnemyPaint = Species

export type ItemPaint =
  | 'heart'
  | 'leaf'
  | 'boot'
  | 'shield'
  | 'clover'
  | 'skull'
  | 'gem'
  | 'flask'
  | 'book'
  | 'coin'
  | 'eye'
  | 'feather'
  | 'anvil'
  | 'bomb'
  | 'glove'
  | 'lantern'
  | 'root'
  | 'bag'
  | 'bell'
  | 'fang'
  | 'magnet'
  | 'mushroom'
  | 'ring'
  | 'scroll'

// ---------------------------------------------------------------------------
// Data definitions (owned by src/data)
// ---------------------------------------------------------------------------

export type WeaponClass = 'melee' | 'ranged' | 'elemental'

export type WeaponId =
  | 'fist'
  | 'knife'
  | 'stick'
  | 'sword'
  | 'spear'
  | 'hammer'
  | 'scythe'
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'slingshot'
  | 'crossbow'
  | 'wand'
  | 'torch'
  | 'flint'
  | 'lightning'

export type StatusEffect = 'burn' | 'slow'

export interface ProjectileDef {
  speed: number
  radius: number
  life: number
  pierce: number
  bounce?: number
  homing?: number
  trail: 'ink' | 'ember' | 'spark' | 'none'
  paint: ProjectilePaint
}

export type WeaponBehavior =
  /** Lunge/stab toward the nearest target. */
  | { type: 'thrust'; reach: number }
  /** Arc swing around the player. arc in radians. */
  | { type: 'sweep'; arc: number }
  /** Fire count projectiles with spread; optional burst of shots. */
  | {
      type: 'shoot'
      projectile: ProjectileDef
      count?: number
      spread?: number
      burst?: number
      burstDelay?: number
    }
  /** Blades circling the player. */
  | { type: 'orbit'; count: number; radius: number }
  /** Damaging aura around the player that ticks. */
  | { type: 'aura'; radius: number; tick: number }
  /** Chain lightning that jumps between enemies. */
  | { type: 'chain'; jumps: number; jumpRange: number }

export interface WeaponTier {
  damage: number
  cooldown: number
  range: number
  knockback: number
  critChance: number
  critMult: number
  price: number
  lifeSteal?: number
}

export interface WeaponDef {
  id: WeaponId
  name: string
  class: WeaponClass
  flavor: string
  paint: WeaponPaint
  behavior: WeaponBehavior
  tiers: Record<Tier, WeaponTier>
  /** Fraction of the player stat added to base damage. e.g. { meleeDamage: 1 } */
  scaling: Partial<Record<StatKey, number>>
  effects?: StatusEffect[]
  /** Set text shown when 2+ of this class are held (weapon class bonus). */
  classBonus?: string
}

export type ItemSpecial =
  | 'explodeOnKill'
  | 'fruitOnWaveEnd'
  | 'thorns'
  | 'doubleMaterials'
  | 'freeReroll'
  | 'healOnPickup'
  | 'burnOnHit'
  | 'slowOnHit'
  | 'materialOnDodge'
  | 'critHeals'

export interface ItemDef {
  id: string
  name: string
  tier: Tier
  price: number
  flavor: string
  paint: ItemPaint
  stats: Partial<Stats>
  unique?: boolean
  special?: ItemSpecial
  /** How many times the special may stack; default unlimited. */
  maxStacks?: number
}

export type CharacterSpecial =
  | 'meleeOnly'
  | 'rangedOnly'
  | 'noHealing'
  | 'oneWeapon'
  | 'materialsHeal'
  | 'startRich'
  | 'thornsHalf'
  | 'lowRange'

export interface FormVariant {
  /** Display name of this form, e.g. "Mud Spud". */
  name: string
  flavor: string
  /** Extra stats layered on top of the character's base stats. */
  stats: Partial<Stats>
  /** Human readable perk lines shown on the select card for this form. */
  perks: string[]
}

export interface CharacterDef {
  id: string
  name: string
  species: Species
  flavor: string
  stats: Partial<Stats>
  startingWeapons: { id: WeaponId; tier: Tier }[]
  palette: Palette
  /** Human readable perk lines shown on the select card. */
  perks: string[]
  special?: CharacterSpecial
  /** Extra weapon slots; base is 6. */
  weaponSlots?: number
  /** Kept for data, never applied to the player. Mud is enemies only. */
  nightmare: FormVariant
}

export type EnemyKind =
  | 'blob'
  | 'sprout'
  | 'runner'
  | 'crab'
  | 'wisp'
  | 'brute'
  | 'spitter'
  | 'hive'
  | 'charger'
  | 'eliteBlob'
  | 'eliteBrute'
  | 'mother'
  | 'lord'

export interface BossPhase {
  /** Phase active while hp fraction is above this value. */
  until: number
  pattern: 'ring' | 'charge' | 'summon' | 'spiral' | 'chase'
  interval: number
}

export type EnemyBehavior =
  | { type: 'chase' }
  | { type: 'wander'; drift: number }
  | { type: 'charge'; windup: number; speedMult: number; cooldown: number; range: number }
  | { type: 'shoot'; range: number; cooldown: number; projectile: ProjectileDef; keepDistance: number }
  | { type: 'spawner'; child: EnemyKind; interval: number; max: number }
  | { type: 'boss'; phases: BossPhase[]; summon?: EnemyKind; projectile?: ProjectileDef }

export interface EnemyDef {
  kind: EnemyKind
  name: string
  species: Species
  /** Name used when this enemy is in nightmare form, e.g. "Mud Pea". */
  nightmareName: string
  /** Form this enemy always spawns in; basics may still be promoted by the wave. */
  form: Form
  /**
   * Seconds between screams when in nightmare form. A scream is a telegraphed
   * pause with a wide mouth, then a burst (speed surge / minion call / pulse).
   */
  screamInterval?: number
  rank: 'basic' | 'elite' | 'boss'
  hp: number
  speed: number
  damage: number
  radius: number
  /** Materials dropped (each material is also 1 xp). */
  materials: number
  behavior: EnemyBehavior
  palette: Palette
  paint: EnemyPaint
  knockbackResist: number
  /** Multiplies hp per wave beyond 1, e.g. 0.12. */
  hpScale: number
  damageScale: number
}

export interface WaveDef {
  index: number
  duration: number
  spawnInterval: number
  batch: number
  pool: { kind: EnemyKind; weight: number }[]
  elites: number
  boss?: EnemyKind
  /** Seconds into the wave at which a horde bursts in. */
  hordes: number[]
  trees: number
  /** 0..1 chance that a basic spawn comes up in nightmare-mud form. */
  nightmareChance: number
}

export interface LevelUpOption {
  id: string
  title: string
  blurb: string
  tier: Tier
  stats: Partial<Stats>
}

// ---------------------------------------------------------------------------
// Runtime world (owned by src/game, read by src/render and src/ui)
// ---------------------------------------------------------------------------

export interface Vec {
  x: number
  y: number
}

export interface AnimState {
  /** Local time in seconds since spawn. */
  t: number
  /** 0..1 spawn-in progress. */
  spawnT: number
  /** 0..1 death progress, -1 when alive. */
  deathT: number
  /** Vertical bob offset in px. */
  bob: number
  /** Horizontal squash factor, 1 = none. */
  squash: number
  /** 1 faces right, -1 faces left. */
  facing: 1 | -1
  /** 0..1 white flash after being hit, decays. */
  hitFlash: number
  /** Recoil / lunge offset applied to the body. */
  kick: Vec
  /** True while moving this frame. */
  moving: boolean
  /** 0..1 mouth openness; idle chatter is small, screams go to 1. */
  mouth: number
  /** 0..1 progress of a scream animation, -1 when not screaming. */
  scream: number
  /** 0..1 walk cycle phase for legs and arm swing. */
  gait: number
  /** 0..1 blink progress, -1 eyes open. */
  blink: number
}

export interface WeaponInstance {
  uid: number
  id: WeaponId
  tier: Tier
  cooldown: number
  /** Current aim angle in radians. */
  angle: number
  /** 0..1 progress of the current swing/fire animation, -1 when idle. */
  swingT: number
  /** Slot index 0..5 for positioning around the player. */
  slot: number
  targetUid: number | null
  burstLeft: number
  burstTimer: number
  auraAcc: number
}

export interface Player extends Vec {
  vx: number
  vy: number
  r: number
  hp: number
  /** Computed final stats. */
  stats: Stats
  character: CharacterDef
  /** Players are always `normal`. Kept so snapshots and HUD stay typed. */
  form: Form
  /** Face/body construction for this run (A wash / B sketch / C stain). */
  model: ModelDir
  weapons: WeaponInstance[]
  items: string[]
  materials: number
  level: number
  xp: number
  xpNext: number
  invuln: number
  regenAcc: number
  anim: AnimState
  /** Pending level-ups accumulated during the wave. */
  pendingLevelUps: number
  facingAngle: number
  kills: number
  damageDealt: number
  damageTaken: number
  materialsCollected: number
}

export type EnemyState =
  | 'spawning'
  | 'idle'
  | 'chase'
  | 'windup'
  | 'charging'
  | 'shooting'
  | 'recover'
  | 'screaming'
  | 'dying'

export interface Enemy extends Vec {
  uid: number
  kind: EnemyKind
  def: EnemyDef
  form: Form
  /** Seconds until the next scream while in nightmare form. */
  screamCooldown: number
  vx: number
  vy: number
  r: number
  hp: number
  maxHp: number
  damage: number
  speed: number
  state: EnemyState
  stateT: number
  cooldown: number
  knock: Vec
  burn: number
  burnDps: number
  slow: number
  anim: AnimState
  elite: boolean
  boss: boolean
  phaseIndex: number
  /** Charge direction when charging. */
  aim: Vec
  children: number
}

export interface Projectile extends Vec {
  uid: number
  vx: number
  vy: number
  r: number
  damage: number
  crit: boolean
  pierce: number
  bounce: number
  life: number
  maxLife: number
  owner: 'player' | 'enemy'
  def: ProjectileDef
  angle: number
  trail: Vec[]
  effects: StatusEffect[]
  knockback: number
  hitUids: number[]
  weaponUid: number
  /** Homing strength copied from def for convenience. */
  homing: number
}

export type PickupType = 'material' | 'materialBig' | 'fruit' | 'chest'

export interface Pickup extends Vec {
  uid: number
  type: PickupType
  value: number
  vx: number
  vy: number
  t: number
  /** True once inside pickup range; flies to the player. */
  magnet: boolean
}

export interface Tree extends Vec {
  uid: number
  hp: number
  maxHp: number
  r: number
  sway: number
  hitFlash: number
}

export interface SpawnMarker extends Vec {
  kind: EnemyKind
  t: number
  life: number
}

export interface Camera extends Vec {
  /** Viewport size in css px. */
  w: number
  h: number
  shake: number
  zoom: number
}

export interface World {
  time: number
  waveTime: number
  wave: number
  waveDef: WaveDef
  /** Seconds remaining in the wave. */
  waveLeft: number
  arenaHalfW: number
  arenaHalfH: number
  player: Player
  enemies: Enemy[]
  projectiles: Projectile[]
  pickups: Pickup[]
  trees: Tree[]
  markers: SpawnMarker[]
  camera: Camera
  /** Set when a boss is alive for the HUD. */
  boss: Enemy | null
  paused: boolean
  slowMo: number
}

// ---------------------------------------------------------------------------
// Run / UI
// ---------------------------------------------------------------------------

export type RunPhase =
  | 'boot'
  | 'error'
  | 'title'
  | 'charselect'
  | 'wave'
  | 'levelup'
  | 'shop'
  | 'paused'
  | 'stats'
  | 'gameover'
  | 'victory'

export interface HudSnapshot {
  hp: number
  maxHp: number
  level: number
  xp: number
  xpNext: number
  materials: number
  wave: number
  waveLeft: number
  waveTotal: number
  boss: { name: string; hp: number; maxHp: number } | null
  weapons: { id: WeaponId; name: string; tier: Tier; paint: WeaponPaint; cooldownFrac: number }[]
  characterName: string
  form: Form
  model: ModelDir
  /** Count of nightmare-form enemies currently alive; drives the HUD mud meter. */
  nightmaresAlive: number
  fps: number
}

export interface ShopOffer {
  uid: number
  kind: 'weapon' | 'item'
  id: string
  tier: Tier
  price: number
  locked: boolean
  /** Precomputed display block. */
  name: string
  flavor: string
  paint: WeaponPaint | ItemPaint
  /** Human readable stat lines, e.g. "+5 Max HP" or "Damage 12 · Cooldown 1.1s". */
  lines: string[]
  /** True when buying would combine into an owned weapon of the same id + tier. */
  combines: boolean
  affordable: boolean
}

export interface ShopView {
  wave: number
  nextWave: number
  materials: number
  offers: ShopOffer[]
  rerollPrice: number
  freeRerolls: number
  weapons: { uid: number; id: WeaponId; name: string; tier: Tier; paint: WeaponPaint; sellPrice: number; lines: string[] }[]
  weaponSlots: number
  items: { id: string; name: string; tier: Tier; paint: ItemPaint; count: number }[]
  stats: { key: StatKey; label: string; value: number; percent: boolean }[]
  hp: number
  maxHp: number
}

export interface RunSummary {
  characterName: string
  species: Species
  form: Form
  model: ModelDir
  wave: number
  wavesTotal: number
  won: boolean
  kills: number
  level: number
  timeSeconds: number
  damageDealt: number
  damageTaken: number
  materialsCollected: number
  weapons: { name: string; tier: Tier; paint: WeaponPaint }[]
  items: { name: string; tier: Tier; paint: ItemPaint; count: number }[]
  killedBy: string | null
}

export interface ShopHandlers {
  buy(offerUid: number): void
  toggleLock(offerUid: number): void
  reroll(): void
  sell(weaponUid: number): void
  next(): void
}

/** Implemented by src/ui/index.ts. The Run drives it, never the reverse. */
export interface UiApi {
  /** Show exactly one full-screen overlay; null hides all overlays (wave in progress). */
  showScreen(phase: RunPhase | null): void
  setBootCopy(text: string): void
  setErrorCopy(text: string): void
  setHudVisible(visible: boolean): void
  renderHud(snap: HudSnapshot): void
  /** The gate screen. Each card has a model toggle; onPick receives the chosen model. */
  renderCharSelect(characters: CharacterDef[], onPick: (id: string, model: ModelDir) => void): void
  renderLevelUp(options: LevelUpOption[], remaining: number, onPick: (id: string) => void): void
  renderShop(view: ShopView, handlers: ShopHandlers): void
  renderPause(
    view: ShopView,
    handlers: {
      resume(): void
      quit(): void
      toggleMute(): void
      muted: boolean
      paintStyle: PaintStyle
      setPaintStyle(style: PaintStyle): void
    },
  ): void
  renderGameOver(summary: RunSummary, handlers: { retry(): void; title(): void }): void
  renderVictory(summary: RunSummary, handlers: { again(): void; title(): void }): void
  /** Transient banner in the HUD layer ("Wave 4", "Boss incoming"). */
  banner(text: string, sub?: string, ms?: number): void
  toast(text: string): void
  setJoystickVisible(visible: boolean): void
  /** Called by main to bind title buttons. */
  onTitle(handlers: {
    play(): void
    toggleMute(): void
    muted: boolean
    paintStyle: PaintStyle
    setPaintStyle(style: PaintStyle): void
  }): void
  onPauseRequest(handler: () => void): void
}

/** Implemented by src/ui/input.ts. */
export interface InputApi {
  /** Normalized movement vector (length <= 1). */
  sample(): Vec
  /** Returns true once per key press. */
  consume(code: string): boolean
  down(code: string): boolean
  readonly coarse: boolean
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface DamageNumberOpts {
  crit?: boolean
  heal?: boolean
  dodge?: boolean
  burn?: boolean
}

/** Implemented by src/render/fx.ts. World-space coordinates unless noted. */
export interface FxApi {
  splat(x: number, y: number, color: string, size: number, count?: number): void
  inkBloom(x: number, y: number, color: string, size: number): void
  hitSpark(x: number, y: number, angle: number, color: string): void
  slash(x: number, y: number, angle: number, arc: number, radius: number, color: string): void
  thrust(x: number, y: number, angle: number, length: number, color: string): void
  shockwave(x: number, y: number, radius: number, color: string): void
  damageNumber(x: number, y: number, amount: number, opts?: DamageNumberOpts): void
  text(x: number, y: number, text: string, color: string): void
  sparkle(x: number, y: number, color: string): void
  puff(x: number, y: number, color: string, size: number): void
  /** Full-screen ink wipe; onMid fires when the screen is fully covered. */
  transition(kind: 'inkWipe' | 'fade', onMid?: () => void, onDone?: () => void): void
  flash(color: string, strength: number): void
  update(dt: number): void
  /** Draw world-space fx. Caller has already applied the camera transform. */
  drawWorld(ctx: CanvasRenderingContext2D): void
  /** Draw screen-space fx (transition, flash, vignette). Called in screen space. */
  drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void
  clear(): void
}

/** Implemented by src/render/index.ts. */
export interface RenderApi {
  readonly fx: FxApi
  resize(w: number, h: number, dpr: number): void
  /** Draws the whole world including fx, paper, vignette. */
  draw(ctx: CanvasRenderingContext2D, world: World, dt: number): void
  /** Paint a small icon for UI use. Returns a data URL, cached by key. */
  icon(
    kind: 'weapon' | 'item' | 'enemy' | 'character',
    paint: string,
    palette?: Palette,
    size?: number,
    form?: Form,
    model?: ModelDir,
  ): string
  /** Paint an idle character portrait; used on the gate screen. */
  portrait(character: CharacterDef, size: number, form?: Form, model?: ModelDir): string
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export type SfxName =
  | 'swing'
  | 'stab'
  | 'shoot'
  | 'shotgun'
  | 'bolt'
  | 'zap'
  | 'hit'
  | 'crit'
  | 'enemyDie'
  | 'bossDie'
  | 'playerHurt'
  | 'dodge'
  | 'pickup'
  | 'fruit'
  | 'chest'
  | 'levelUp'
  | 'waveStart'
  | 'waveEnd'
  | 'buy'
  | 'sell'
  | 'reroll'
  | 'lock'
  | 'combine'
  | 'uiHover'
  | 'uiClick'
  | 'gameOver'
  | 'victory'
  | 'burn'
  | 'charge'
  | 'spawn'
  | 'bossRoar'
  | 'treeBreak'
  | 'scream'
  | 'screamBig'
  | 'mudSquelch'
  | 'mudRise'

export type MusicMood = 'title' | 'wave' | 'nightmare' | 'boss' | 'shop' | 'none'

/** Implemented by src/audio/index.ts. */
export interface AudioApi {
  /** Must be called from a user gesture before anything plays. */
  unlock(): void
  setMuted(muted: boolean): void
  readonly muted: boolean
  play(name: SfxName, opts?: { pitch?: number; gain?: number }): void
  setMusic(mood: MusicMood): void
}
