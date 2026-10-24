/** localStorage that never throws: private windows and full quotas fall back to memory. */
const memory = new Map<string, string>()

export function readJSON<T>(key: string, fallback: T): T {
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
