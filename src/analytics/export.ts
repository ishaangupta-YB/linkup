/** Events out of the dashboard as CSV or JSON, in the schema they are stored in. */
import type { AnalyticsEvent, EventContext, PropValue } from './events'

const BASE_COLUMNS = ['id', 'name', 'stream', 'ts', 'time', 'anonymousId', 'userId', 'sessionId', 'pageId', 'handle', 'sample'] as const
const CONTEXT_COLUMNS: (keyof EventContext)[] = ['path', 'referrer', 'source', 'medium', 'campaign', 'device', 'browser', 'os', 'language', 'timezone', 'country', 'screen']

/**
 * One CSV cell. Quotes cells holding a comma, quote or line break, doubles inner quotes,
 * and puts an apostrophe before text a spreadsheet would run as a formula.
 */
export function csvCell(value: PropValue | undefined): string {
  if (value == null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  let s = value
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Flattens props and context into `props.<key>` and `context.<key>` columns. */
export function eventsToCsv(events: AnalyticsEvent[]): string {
  const propKeys = [...new Set(events.flatMap((e) => Object.keys(e.props ?? {})))].sort()
  const header = [...BASE_COLUMNS, ...propKeys.map((k) => `props.${k}`), ...CONTEXT_COLUMNS.map((k) => `context.${k}`)]
  const rows = events.map((e) => {
    const base: (PropValue | undefined)[] = [e.id, e.name, e.stream, e.ts, new Date(e.ts).toISOString(), e.anonymousId, e.userId, e.sessionId, e.pageId, e.handle, e.sample === true]
    const props = propKeys.map((k) => e.props?.[k])
    const context = CONTEXT_COLUMNS.map((k) => e.context?.[k] as PropValue | undefined)
    return [...base, ...props, ...context].map(csvCell).join(',')
  })
  return [header.map((h) => csvCell(h)).join(','), ...rows].join('\r\n') + '\r\n'
}

export function eventsToJson(events: AnalyticsEvent[]): string {
  return JSON.stringify(events, null, 2) + '\n'
}

/** A file name like linkup-thedesignsquare-30d-2026-10-24.csv */
export function exportFileName(handle: string, range: string, ext: 'csv' | 'json', now = Date.now()) {
  const d = new Date(now)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const safe = handle.replace(/[^a-z0-9_-]/gi, '') || 'page'
  return `linkup-${safe}-${range}-${date}.${ext}`
}

/** Hands the browser a file to save. */
export function downloadText(fileName: string, text: string, mime: string) {
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + text : text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportEvents(events: AnalyticsEvent[], format: 'csv' | 'json', fileName: string) {
  if (format === 'csv') downloadText(fileName, eventsToCsv(events), 'text/csv;charset=utf-8')
  else downloadText(fileName, eventsToJson(events), 'application/json')
}
