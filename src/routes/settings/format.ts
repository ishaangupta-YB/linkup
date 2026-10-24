/** A publish time as a pharmacy label reads it: 24 Oct 2026, 14:05. */
export function formatStamp(ts: number, locale = 'en-GB', timeZone?: string): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  return `${date}, ${time}`
}
