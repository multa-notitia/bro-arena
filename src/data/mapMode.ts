/**
 * Which garden the run uses.
 * `?map=` wins over the pause-menu choice stored in localStorage.
 * Tidy is the default. Switching from the menu reloads so the farm,
 * the arena, and the art all come up together.
 */
export type ArenaMap = 'tidy' | 'rows' | 'classic'

const STORAGE = 'bro.map'
const IDS: readonly ArenaMap[] = ['tidy', 'rows', 'classic']

function asMap(value: string | null): ArenaMap | null {
  if (value === 'tidy' || value === 'rows' || value === 'classic') return value
  return null
}

export function arenaMap(): ArenaMap {
  if (typeof location !== 'undefined') {
    const fromUrl = asMap(new URLSearchParams(location.search).get('map'))
    if (fromUrl) return fromUrl
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = asMap(localStorage.getItem(STORAGE))
      if (stored) return stored
    }
  } catch {
    /* private mode */
  }
  return 'tidy'
}

export const MAP_CHOICES: readonly { id: ArenaMap; label: string }[] = [
  { id: 'tidy', label: 'Tidy beds' },
  { id: 'rows', label: 'Scattered rows' },
  { id: 'classic', label: 'Classic paddock' },
]

/** Persist the choice and reload. A click on the map already running does nothing. */
export function setArenaMap(next: ArenaMap): void {
  if (!IDS.includes(next) || next === arenaMap()) return
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE, next)
  } catch {
    /* private mode */
  }
  if (typeof location === 'undefined') return
  const url = new URL(location.href)
  url.searchParams.set('map', next)
  location.assign(url.href)
}
