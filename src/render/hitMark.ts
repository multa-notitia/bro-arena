import type { Enemy } from '../core/types.ts'

/** Last blow that should paint a nick. The cream body flash is not this. */
const marks = new WeakMap<Enemy, { color: string; angle: number }>()

export function noteEnemyHit(enemy: Enemy, color: string, angle: number): void {
  marks.set(enemy, { color, angle })
}

export function enemyHitMark(enemy: Enemy): { color: string; angle: number } | undefined {
  return marks.get(enemy)
}
