/**
 * Barrier art. Clip names stay on this list.
 *
 * `props-bed-locked` and `props-bed-unlock` now hold the wooden inner fence
 * under the same clip names (hedge_*, gate, gate_side, unlock and collapse).
 * The tidy garden does not paint the overgrowth fill.
 *
 * The outer fence is `props-fence`, placed from `data/garden_layout_v2.json`
 * and drawn with the actors. It does not use these hedge clip names.
 */

export const BARRIER_CLIPS = {
  h: 'hedge_h',
  v: 'hedge_v',
  hCollapse: 'hedge_h_collapse',
  vCollapse: 'hedge_v_collapse',
  gate: 'gate',
  gateSide: 'gate_side',
  gateOpen: 'gate_unlock',
  gateSideOpen: 'gate_unlock_side',
  sign: 'sign',
} as const

export const BED_BARRIER = {
  locked: 'props-bed-locked',
  reveal: 'props-bed-unlock',
} as const
