/** localStorage that never throws: private windows and full quotas fall back to memory. */
const memory = new Map<string, string>()

export function readJSON<T>(key: string, fallback: T): T {
  // A write the browser refused lives in memory and is newer than what localStorage holds.
  const kept = memory.get(key)
  if (kept != null) return JSON.parse(kept) as T
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw) as T
  } catch {
    const raw = memory.get(key)
    if (raw != null) return JSON.parse(raw) as T
  }
  return fallback
}

/** Returns false when the browser refused the write (usually the quota). */
export function writeJSON(key: string, value: unknown): boolean {
  const raw = JSON.stringify(value)
  try {
    localStorage.setItem(key, raw)
    memory.delete(key)
    return true
  } catch {
    memory.set(key, raw)
    return false
  }
}

export function removeKey(key: string) {
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage unavailable; the memory copy is already gone.
  }
}

/** Forgets a write the browser refused, so reads go back to what localStorage holds. */
export function removeMemoryCopy(key: string) {
  memory.delete(key)
}

/** The stored text for a key, unparsed, or null. Lets a caller keep a value it cannot parse. */
export function readRaw(key: string): string | null {
  const kept = memory.get(key)
  if (kept != null) return kept
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Calls `listener` when another tab of this site changes one of `keys` (the storage event
 * never fires in the tab that wrote). A cleared storage (`key` null) counts for every key.
 * Returns the unsubscribe function.
 */
export function onOtherTabChange(keys: string[], listener: (key: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && !keys.includes(e.key)) return
    // The other tab's write supersedes any copy this tab kept after a refused write.
    if (e.key === null) memory.clear()
    else memory.delete(e.key)
    listener(e.key)
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
