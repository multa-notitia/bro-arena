import { clamp } from '../core/math.ts'

/**
 * All chaotic-feel tunables in one place. Gameplay numbers for HP and weapon
 * damage stay in the other data files. Flip a flag here (or `bro.chaos` in
 * localStorage) to mute a system without ripping code out.
 *
 * Sprite ids:
 *   public/sprites/fx-funny.*
 *   public/sprites/enemy-tomato-{light,mud}.*
 *   public/sprites/enemy-bean-{light,mud}.*
 *   emerge clips on enemy-*-light / enemy-*-mud (other 10 from PR #3)
 */

const STORAGE_KEY = 'bro.chaos'

export type DeathStyle = 'slice' | 'smash' | 'normal'

export const CHAOS = {
  /** Master switch. Reduced-juice still damps magnitudes when this is on. */
  enabled: true,

  director: {
    enabled: true,
    /** Live enemy + telegraph cap. Pools recycle past this. */
    maxAlive: 220,
    /** Multiply the farm spawn interval (smaller = denser). */
    intervalScale: 0.55,
    /** Extra bodies per farm batch pulse. */
    extraBatch: 2,
    /** How fast the wave densifies from t=0 to t=duration. */
    ramp: 0.82,
    mixedPackChance: 0.38,
    mixedPackSize: [2, 5] as const,
    ambushEvery: [7, 12] as const,
    ringCount: [8, 14] as const,
    ringRadius: 92,
    patchEvery: [9, 16] as const,
    patchBursts: 6,
    patchInterval: 0.42,
    telegraph: 0.6,
    hordeBonus: 8,
    hopPackEvery: [6, 11] as const,
    hopPackSize: [5, 9] as const,
    tomatoSwarmSize: [5, 9] as const,
  },

  emerge: {
    enabled: true,
    fallbackSeconds: 0.45,
    mudEruptScale: 0.55,
  },

  leap: {
    enabled: true,
    /** Used when an enemy def omits `leap`. Flight is takeoff→land (~400 ms). */
    defaults: { range: 168, cooldown: 2.0, height: 22, duration: 0.4 },
    lightDist: 65,
    mudDist: 52,
    cooldown: [1.5, 2.5] as const,
    flight: 0.4,
  },

  /**
   * Motion polish. Hit-stop and scream snaps stay hard; everything else
   * interpolates on the render pose (ox/oy/scale, hop arc, idle↔walk).
   */
  smooth: {
    /** Idle ↔ walk crossfade. 60–100 ms. */
    idleWalkFade: 0.08,
    walkRateMin: 0.5,
    walkRateMax: 1.65,
    knockDamp: 6,
  },

  juice: {
    enabled: true,
    /** Hit-stop seconds, scaled by damage then clamped. */
    hitStopMin: 0.03,
    hitStopMax: 0.06,
    /** Do not stack freeze on every pellet in a horde. */
    hitStopReplace: true,
    knockback: 1.35,
    squash: 0.52,
    squashRecover: 14,
    numberPop: 1.55,
    traumaHit: 0.18,
    traumaKill: 0.34,
    traumaElite: 0.48,
    traumaBoss: 0.78,
    traumaDecay: 3.4,
    comboWindow: 1.35,
    comboPitch: 0.055,
    comboPitchMax: 1.85,
    splatCap: 180,
    splatLife: 7.5,
    splatFade: 0.55,
    chainRadius: 78,
    chainFrac: 0.42,
    bigKillHp: 80,
    bigKillRadius: 96,
  },

  death: {
    enabled: true,
    keepCorpse: true,
  },

  /** Blade vs blunt vs default death clip. */
  weaponStyle: {
    fist: 'smash',
    knife: 'slice',
    stick: 'smash',
    sword: 'slice',
    spear: 'slice',
    hammer: 'smash',
    scythe: 'slice',
    pistol: 'normal',
    smg: 'normal',
    shotgun: 'smash',
    slingshot: 'smash',
    crossbow: 'slice',
    wand: 'normal',
    torch: 'normal',
    flint: 'normal',
    lightning: 'normal',
  } as const satisfies Record<string, DeathStyle>,

  sheets: {
    funny: 'fx-funny',
    mudErupt: 'mud_erupt',
    pop: 'pop',
    vegBurst: 'veg_burst',
    splat: 'splat',
    drawScale: 0.35,
    popScale: 0.48,
    vineFade: 0.45,
    aliases: {
      tomato: ['enemy-tomato'],
      bean: ['enemy-bean'],
    } as Record<string, string[]>,
  },
} as const

export type ChaosConfig = typeof CHAOS

let override: boolean | null = null

function readStored(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* private mode */
  }
  return null
}

export function chaosOn(): boolean {
  if (override !== null) return override
  const stored = readStored()
  if (stored !== null) return stored
  return CHAOS.enabled
}

export function setChaosEnabled(v: boolean): void {
  override = v
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function chaosDirectorOn(): boolean {
  return chaosOn() && CHAOS.director.enabled
}

export function chaosJuiceOn(): boolean {
  return chaosOn() && CHAOS.juice.enabled
}

export function maxEnemies(): number {
  return chaosDirectorOn() ? CHAOS.director.maxAlive : 160
}

export function telegraphLife(): number {
  return chaosDirectorOn() ? CHAOS.director.telegraph : 1
}

export function deathStyleForWeapon(id: string): DeathStyle {
  const row = CHAOS.weaponStyle as Record<string, DeathStyle>
  return row[id] ?? 'normal'
}

/** Walk clip rate from actual speed. Never used to restart a looping clip. */
export function walkPlaybackRate(speed: number, nominal: number): number {
  const n = Math.max(1, nominal)
  return clamp(speed / n, CHAOS.smooth.walkRateMin, CHAOS.smooth.walkRateMax)
}
