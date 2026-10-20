/**
 * Painted specials. Timings match tools/behaviors/NOTES.md.
 * World px and seconds. Leap cooldown is per enemy; at most MAX_LEAPING
 * bodies are in the air-or-windup leap at once.
 */

export type SpecialId = 'leap' | 'bite'

export interface SpecialRow {
  id: SpecialId
  /** Telegraph length in ms (scream/taunt plus the crouch, or the bite crouch). */
  telegraph: number
  cooldown: readonly [number, number]
  /** Distance at which the special may start. */
  range: readonly [number, number]
  /** Played in order. `leap` / `bite` is the action; anything before it is the tell. */
  clips: readonly string[]
  /**
   * Cap the tell clip, in seconds. 0 plays it to `*_done`.
   * Tomato-light's taunt is only the first 200 ms.
   */
  introSec: number
  /** Bite wins over leap when the hero is at least this close. */
  preferUnder?: number
}

export const MAX_LEAPING = 3
/** Landing hit is the hero radius plus this. */
export const LEAP_HIT_PAD = 16
/** Bite connects when the bodies are within both radii plus this. */
export const BITE_HIT_PAD = 12

const leap = (
  telegraph: number,
  cooldown: readonly [number, number],
  range: readonly [number, number],
  clips: readonly string[],
  introSec = 0,
): SpecialRow => ({ id: 'leap', telegraph, cooldown, range, clips, introSec })

const bite = (
  telegraph: number,
  cooldown: readonly [number, number],
  range: readonly [number, number],
  preferUnder?: number,
): SpecialRow => ({
  id: 'bite',
  telegraph,
  cooldown,
  range,
  clips: ['bite'],
  introSec: 0,
  preferUnder,
})

export const SPECIALS: Record<string, readonly SpecialRow[]> = {
  'tomato-light': [leap(450, [4, 6], [80, 240], ['taunt', 'leap'], 0.2)],
  'tomato-mud': [leap(870, [4, 6], [80, 250], ['scream', 'leap'])],
  'pea-light': [leap(400, [3.5, 5], [90, 240], ['leap'])],
  'pea-mud': [leap(870, [4, 6], [90, 240], ['scream', 'leap'])],
  'bean-light': [leap(250, [3, 5], [60, 180], ['leap'])],
  'bean-mud': [leap(850, [4.5, 6.5], [80, 220], ['scream', 'leap'])],
  'blob-mud': [leap(870, [4.5, 6.5], [80, 220], ['scream', 'leap'])],
  'beetle-light': [bite(300, [2.6, 3.8], [26, 120])],
  'beetle-mud': [
    leap(930, [4, 6], [80, 250], ['scream', 'leap']),
    bite(300, [3, 4], [20, 60], 60),
  ],
  'charger-light': [leap(250, [6, 8], [140, 240], ['leap'])],
  'charger-mud': [leap(870, [6, 8], [140, 260], ['scream', 'leap'])],
  'beetroot-mud': [bite(300, [3, 4.5], [26, 100])],
  'onion-mud': [bite(300, [2.6, 3.8], [26, 110])],
  'spitter-light': [bite(300, [2.2, 3.2], [20, 80])],
  'spitter-mud': [bite(300, [2.2, 3.2], [20, 80])],
}

export function specialsFor(kind: string): readonly SpecialRow[] {
  return SPECIALS[kind] ?? []
}
