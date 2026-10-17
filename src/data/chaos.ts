import { clamp } from '../core/math.ts'

/**
 * All feel / pace / juice tunables live here. HP and weapon damage stay in
 * the other data files. Flip a flag (Pause → Options, URL, or localStorage)
 * to mute a system without ripping code out.
 *
 * Brotato public wiki (benchmark, not a copy):
 *   player base speed 450 u/s, most walkers 200–300, chargers ~400
 *   waves 20,25,…55 then 60s, wave 20 is 90s, live-enemy cap 100
 *   pickup range is a generous magnet (Soldier +200%, Explorer +50%)
 * Our world is tighter (~441 px across the camera), so speeds are scaled
 * down but the *ratios* match: hero kites walkers, chargers close the gap.
 *
 * Sprite ids: fx-funny, enemy-tomato-*, enemy-bean-*.
 */

const STORAGE_CHAOS = 'bro.chaos'
const STORAGE_FX = 'bro.fx'

export type DeathStyle = 'slice' | 'smash' | 'normal'
export type FxFlag = 'telegraphs' | 'damageNumbers' | 'combo' | 'shake' | 'hitStop'

export const CHAOS = {
  /** Master switch. Reduced-juice still damps magnitudes when this is on. */
  enabled: true,

  /**
   * Movement and spawn ladder. Player 248 vs pea 92 ≈ Brotato 450 vs ~167.
   * Accel is huge so the stick feels instant; friction is high so stop is short.
   */
  pace: {
    playerSpeed: 248,
    playerAccel: 7800,
    playerFriction: 24,
    /** World px magnet. Brotato's default pickup is wide; 72 reads on this map. */
    pickupRange: 72,
    /**
     * Family walk speeds (mud variants still get the 0.9× in enemy defs).
     * Slow tanks, medium walkers, dashers (walk + authored windup), jumpers.
     */
    enemy: {
      blob: 92,
      sprout: 46,
      runner: 168,
      crab: 78,
      wisp: 84,
      brute: 34,
      spitter: 64,
      hive: 26,
      charger: 78,
      tomato: 96,
      bean: 88,
      eliteBlob: 70,
      eliteBrute: 32,
      mother: 48,
      lord: 52,
      beetle: 76,
      shroom: 44,
    } as Record<string, number>,
    /** Brotato wave lengths: +5s through wave 8, 60s mid, 90s finale. */
    waveSeconds: [20, 25, 30, 35, 40, 45, 50, 55, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 90] as const,
    /** Seconds between farm pulses. Wave 1 is readable; later waves densify. */
    spawnInterval: [2.35, 2.05, 1.75, 1.45, 1.22, 1.05, 0.92, 0.82, 0.74, 0.68, 0.62, 0.58, 0.54, 0.5, 0.48, 0.46, 0.44, 0.42, 0.4, 0.38] as const,
    batch: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3] as const,
    /** Live enemies + telegraphs. Never a 200-body soup. */
    alive: [14, 18, 24, 30, 38, 46, 54, 62, 70, 78, 84, 88, 92, 94, 96, 98, 100, 100, 100, 100] as const,
    /** Soft body separation (fraction of combined radii). */
    separate: 1.08,
    separatePush: 0.7,
    separateScan: 64,
  },

  director: {
    enabled: true,
    maxAlive: 100,
    /** 1 = farm interval as authored. Was 0.55 (too soupy). */
    intervalScale: 1,
    extraBatch: 0,
    ramp: 0.4,
    mixedPackChance: 0.18,
    mixedPackSize: [2, 3] as const,
    ambushEvery: [14, 22] as const,
    /** First ambush wave. Wave 1–2 stay quiet. */
    ambushFromWave: 3,
    ringCount: [6, 9] as const,
    ringRadius: 108,
    patchEvery: [16, 24] as const,
    patchFromWave: 4,
    patchBursts: 4,
    patchInterval: 0.55,
    /** Seconds the cracked-ground mark lives. Gone when the body is out. */
    telegraph: 0.6,
    hordeBonus: 4,
    hopPackEvery: [12, 18] as const,
    hopFromWave: 3,
    hopPackSize: [3, 5] as const,
    tomatoSwarmSize: [3, 5] as const,
  },

  emerge: {
    enabled: true,
    fallbackSeconds: 0.45,
    mudEruptScale: 0.22,
  },

  leap: {
    enabled: true,
    defaults: { range: 168, cooldown: 2.0, height: 22, duration: 0.4 },
    lightDist: 65,
    mudDist: 52,
    cooldown: [1.5, 2.5] as const,
    flight: 0.4,
  },

  smooth: {
    idleWalkFade: 0.08,
    walkRateMin: 0.5,
    walkRateMax: 1.65,
    knockDamp: 6,
  },

  juice: {
    enabled: true,
    hitStopMin: 0.018,
    hitStopMax: 0.04,
    hitStopReplace: true,
    knockback: 1.15,
    squash: 0.62,
    squashRecover: 16,
    numberPop: 1.08,
    /** ~1/3 the old 15/22 Georgia numbers. */
    numberSize: 5,
    numberCritSize: 7,
    numberLife: 0.42,
    numberMerge: 0.16,
    traumaHit: 0.06,
    traumaKill: 0.1,
    traumaElite: 0.16,
    traumaBoss: 0.28,
    traumaDecay: 5.2,
    comboWindow: 1.2,
    comboPitch: 0.04,
    comboPitchMax: 1.6,
    splatCap: 80,
    splatLife: 1.8,
    splatFade: 1.4,
    splatSize: 7,
    chainRadius: 56,
    chainFrac: 0.32,
    bigKillHp: 80,
    bigKillRadius: 48,
  },

  telegraphLook: {
    /** Thin cracked ring, not a soft disc. */
    rx: 11,
    ry: 5.5,
    line: 1.35,
    crack: 3,
    alpha: 0.72,
  },

  death: {
    enabled: true,
    keepCorpse: true,
  },

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
    drawScale: 0.16,
    popScale: 0.22,
    vineFade: 0.45,
    aliases: {
      tomato: ['enemy-tomato'],
      bean: ['enemy-bean'],
    } as Record<string, string[]>,
  },
} as const

export type ChaosConfig = typeof CHAOS

export const FX_DEFAULTS: Record<FxFlag, boolean> = {
  telegraphs: true,
  damageNumbers: true,
  combo: true,
  shake: true,
  hitStop: true,
}

const FX_URL: Record<FxFlag, readonly string[]> = {
  telegraphs: ['circles', 'telegraphs', 'ground'],
  damageNumbers: ['nums', 'numbers'],
  combo: ['combo', 'chain'],
  shake: ['shake'],
  hitStop: ['hitstop', 'hitStop'],
}

let chaosOverride: boolean | null = null
let fxState: Record<FxFlag, boolean> = { ...FX_DEFAULTS }

function parseFlag(raw: string | null): boolean | undefined {
  if (raw === null) return undefined
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'off' || v === 'false' || v === 'no') return false
  if (v === '1' || v === 'on' || v === 'true' || v === 'yes') return true
  return undefined
}

function readChaosStored(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const v = localStorage.getItem(STORAGE_CHAOS)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* private mode */
  }
  return null
}

function readFxStored(): Partial<Record<FxFlag, boolean>> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_FX)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<FxFlag, boolean>> = {}
    for (const key of Object.keys(FX_DEFAULTS) as FxFlag[]) {
      if (typeof parsed[key] === 'boolean') out[key] = parsed[key]
    }
    return out
  } catch {
    return {}
  }
}

function writeFxStored(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_FX, JSON.stringify(fxState))
  } catch {
    /* private mode */
  }
}

/** Load Pause options from localStorage, then overlay URL params (`circles=0`). */
export function applyFxFromEnvironment(): void {
  fxState = { ...FX_DEFAULTS, ...readFxStored() }
  if (typeof location === 'undefined') return
  const q = new URLSearchParams(location.search)
  for (const flag of Object.keys(FX_URL) as FxFlag[]) {
    for (const key of FX_URL[flag]) {
      const parsed = parseFlag(q.get(key))
      if (parsed !== undefined) {
        fxState[flag] = parsed
        break
      }
    }
  }
}

export function fxOn(flag: FxFlag): boolean {
  return fxState[flag]
}

export function getFxState(): Record<FxFlag, boolean> {
  return { ...fxState }
}

export function setFxFlag(flag: FxFlag, value: boolean): void {
  fxState[flag] = !!value
  writeFxStored()
}

export function chaosOn(): boolean {
  if (chaosOverride !== null) return chaosOverride
  const stored = readChaosStored()
  if (stored !== null) return stored
  return CHAOS.enabled
}

export function setChaosEnabled(v: boolean): void {
  chaosOverride = v
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_CHAOS, v ? '1' : '0')
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

export function maxEnemies(wave = 1): number {
  if (!chaosDirectorOn()) return 80
  const row = CHAOS.pace.alive[Math.max(0, Math.min(19, wave - 1))]
  return row ?? CHAOS.director.maxAlive
}

export function telegraphLife(): number {
  return chaosDirectorOn() ? CHAOS.director.telegraph : 0.6
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

export function paceEnemySpeed(family: string, fallback: number): number {
  return CHAOS.pace.enemy[family] ?? fallback
}

applyFxFromEnvironment()
