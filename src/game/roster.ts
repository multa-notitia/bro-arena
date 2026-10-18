/**
 * Enemies removed on purpose (a finished death) stay gone.
 * Actors spawned onto the live list during the pass are kept.
 */
export function retainSpawned<T>(roster: ReadonlySet<T>, live: readonly T[], kept: readonly T[]): T[] {
  const out = kept.slice()
  const seen = new Set(out)
  for (const e of live) {
    if (roster.has(e) || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}
