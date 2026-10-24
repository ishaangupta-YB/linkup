import type { ReactNode } from 'react'
import type { Breakdown } from '../../analytics/aggregate'

const count = new Intl.NumberFormat('en-IN')
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function formatCount(n: number) {
  return count.format(n)
}

export function formatCompact(n: number) {
  return n < 1000 ? String(n) : compact.format(n)
}

/** 0.3824 to 38.2% */
export function formatPercent(rate: number, digits = 1) {
  return `${(rate * 100).toFixed(digits)}%`
}

export function formatDay(ts: number) {
  return dayFormat.format(ts)
}

export function formatWeekday(ts: number) {
  return weekdayFormat.format(ts)
}

/** 24-hour clock, as on a pharmacy label: 08:00 */
export function formatClock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

/** Clean axis steps: the max rounded up to 1, 2 or 5 times a power of ten, in four steps. */
export function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4].slice(0, steps + 1)
  const raw = max / steps
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const clean = step < 1 ? 1 : step
  return Array.from({ length: steps + 1 }, (_, i) => Math.round(i * clean * 100) / 100)
}

export type BarRow = { key: string; label: ReactNode; count: number; share: number }

export function toRows(b: Breakdown, label: (key: string) => ReactNode = (k) => k): BarRow[] {
  return b.map((r) => ({ key: r.key, label: label(r.key), count: r.count, share: r.share }))
}
