/**
 * Barrier art. Clip names stay on this list.
 *
 * Locked beds still draw `props-bed-locked` / `props-bed-unlock` (bramble
 * hedges, gates, the sign). A wooden fence sheet with these same clip names
 * replaces that by changing `BED_BARRIER` only. Overgrowth is not part of
 * the swap; it stays on the locked-bed sheet.
 *
 * The outer garden fence is a separate layer (`PERIMETER_FENCE`). It draws
 * a placeholder until `sheet` names a spritesheet that has `hedge_h` and
 * `hedge_v`.
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

export const PERIMETER_FENCE: { sheet: string | null } = {
  sheet: null,
}
