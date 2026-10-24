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
