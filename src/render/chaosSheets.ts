import type { EnemyKind, Form } from '../core/types.ts'
import { CHAOS } from '../data/chaos.ts'
import { resolveSheet, sheetKeysForEnemy, type LoadedSheet } from './sheets.ts'

/** Extra keys the sprite drop is wiring (tomato/bean, light/mud emerge sheets). */
export function chaosEnemySheetKeys(kind: EnemyKind, form: Form): string[] {
  const mud = form === 'nightmare' ? 'mud' : 'light'
  const keys: string[] = []
  const aliases = CHAOS.sheets.aliases[kind]
  if (aliases) {
    for (const id of aliases) {
      keys.push(`${id}-${mud}`, `${id}-${form}`, id)
    }
  }
  keys.push(`enemy-${kind}-${mud}`)
  for (const k of sheetKeysForEnemy(kind, form)) {
    if (!keys.includes(k)) keys.push(k)
  }
  return keys
}

export function resolveEnemySheet(kind: EnemyKind, form: Form): LoadedSheet | null {
  return resolveSheet(chaosEnemySheetKeys(kind, form))
}

export function pickDeathClip(sheet: LoadedSheet | null, style: 'slice' | 'smash' | 'normal'): string | null {
  if (!sheet) return null
  const clips = sheet.manifest.clips
  if (style === 'slice' && clips.death_slice) return 'death_slice'
  if (style === 'smash' && clips.death_smash) return 'death_smash'
  if (clips.death) return 'death'
  if (style === 'slice' && clips.death_smash) return 'death_smash'
  if (style === 'smash' && clips.death_slice) return 'death_slice'
  return null
}

export function hasClip(sheet: LoadedSheet | null, name: string): boolean {
  return !!sheet?.manifest.clips[name]
}
