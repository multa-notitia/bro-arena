import { STAT_KEYS } from '../core/types.ts'
import type { LevelUpOption, Player } from '../core/types.ts'
import { getLevelBonus, recomputeStats } from './player.ts'

export function applyLevelUp(player: Player, option: LevelUpOption): void {
  const bonus = getLevelBonus(player)
  for (const key of STAT_KEYS) {
    const v = option.stats[key]
    if (!v) continue
    bonus[key] = (bonus[key] ?? 0) + v
  }
  recomputeStats(player)
}
