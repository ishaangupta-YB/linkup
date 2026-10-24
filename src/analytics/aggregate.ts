/**
 * The dashboard's numbers, as one pure function over an array of events. Nothing here
 * reads storage or the clock: the same function is what an Athena query or a Lambda
 * computes over the Firehose records later.
 */
import type { AnalyticsEvent, PropValue } from './events'

export type RangeKey = 'today' | '7d' | '30d' | '90d'
export const RANGE_KEYS: readonly RangeKey[] = ['today', '7d', '30d', '90d']

export type Bucket = 'day' | 'hour'

export type RangeBounds = {
  key: RangeKey
  from: number
  /** Exclusive. */
  to: number
  prevFrom: number
  prevTo: number
  bucket: Bucket
  /** How the previous period is named in sentences: "previous 30 days", "yesterday". */
  previousLabel: string
}

const HOUR = 3_600_000
const DAY = 86_400_000

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Adds whole local calendar days, so a daylight-saving change never shifts the bucket. */
export function addLocalDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** The local calendar date of a timestamp, as YYYY-MM-DD. */
export function localDateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isRangeKey(value: string | null): value is RangeKey {
  return value != null && (RANGE_KEYS as readonly string[]).includes(value)
}

/**
 * The window a range covers, ending now. `7d` is today and the six local days before it;
 * the previous period is the same span shifted back that many local days, ending at the same
 * time of day, so a part-day today is never set against a full day. `today` runs from local
 * midnight to now and compares with the same clock hours yesterday. Every shift is in local
 * calendar days, so a daylight-saving change inside either window moves no boundary.
 */
export function rangeBounds(key: RangeKey, now: number): RangeBounds {
  const today = startOfLocalDay(now)
  const to = now + 1
  if (key === 'today') {
    return { key, from: today, to, prevFrom: startOfLocalDay(addLocalDays(today, -1)), prevTo: addLocalDays(to, -1), bucket: 'hour', previousLabel: 'the same hours yesterday' }
  }
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  // startOfLocalDay again: where a zone skips midnight itself, the shifted day starts at its first real instant.
  const from = startOfLocalDay(addLocalDays(today, -(days - 1)))
  return { key, from, to, prevFrom: startOfLocalDay(addLocalDays(from, -days)), prevTo: addLocalDays(to, -days), bucket: 'day', previousLabel: `previous ${days} days` }
}

export type LinkRef = { id: string; title: string; visible?: boolean }

export type AggregateOptions = {
  pageId: string
  from: number
  to: number
  prevFrom?: number
  prevTo?: number
  /** The page's links in the editor's order. */
  links: LinkRef[]
  bucket?: Bucket
}

export type Totals = {
  views: number
  visitors: number
  clicks: number
  /** Link clicks divided by views; 0 when there were no views. */
  ctr: number
  socialClicks: number
  shares: number
  sessions: number
  events: number
}

export type SeriesPoint = {
  /** Local start of the bucket. */
  start: number
  /** YYYY-MM-DD for days, YYYY-MM-DDTHH for hours; the second run of an hour repeated when clocks go back ends in `b`. */
  key: string
  views: number
  visitors: number
  clicks: number
}

export type LinkStat = {
  id: string
  title: string
  visible: boolean
  clicks: number
  /** Share of all link clicks in the period, 0 to 1. */
  share: number
  /** Clicks on this link per page view, 0 to 1. */
  ctr: number
}

export type RemovedLinks = { clicks: number; share: number; ctr: number; links: number }

export type Breakdown = { key: string; count: number; share: number }[]

export type Aggregate = {
  totals: Totals
  previous: Totals
  series: SeriesPoint[]
  links: LinkStat[]
  /** Clicks on link ids no longer on the page. Null when there were none. */
  removed: RemovedLinks | null
  sources: Breakdown
  devices: Breakdown
  browsers: Breakdown
  countries: Breakdown
  /** Page views by local hour of day, 0 to 23. */
  hours: number[]
  socials: Breakdown
}

/** The link a link_click names. Accepts the names the public page may send. */
export function linkIdOf(props: Record<string, PropValue>): string | null {
  const v = props.linkId ?? props.link_id ?? props.id
  return typeof v === 'string' && v ? v : null
}

/** The social network a social_click names. */
export function socialIdOf(props: Record<string, PropValue>): string | null {
  const v = props.social ?? props.socialId ?? props.network ?? props.id
  return typeof v === 'string' && v ? v : null
}

function emptyTotals(): Totals {
  return { views: 0, visitors: 0, clicks: 0, ctr: 0, socialClicks: 0, shares: 0, sessions: 0, events: 0 }
}

function totalsOf(events: AnalyticsEvent[]): Totals {
  const t = emptyTotals()
  const visitors = new Set<string>()
  const sessions = new Set<string>()
  for (const e of events) {
    t.events++
    visitors.add(e.anonymousId)
    sessions.add(e.sessionId)
    if (e.name === 'page_view') t.views++
    else if (e.name === 'link_click') t.clicks++
    else if (e.name === 'social_click') t.socialClicks++
    else if (e.name === 'share_click') t.shares++
  }
  t.visitors = visitors.size
  t.sessions = sessions.size
  t.ctr = t.views ? t.clicks / t.views : 0
  return t
}

function breakdown(counts: Map<string, number>): Breakdown {
  let total = 0
  for (const n of counts.values()) total += n
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function hourKey(ts: number) {
  const d = new Date(ts)
  return `${localDateKey(ts)}T${String(d.getHours()).padStart(2, '0')}`
}

/** Every bucket from `from` up to `to`, zero filled. */
function emptySeries(from: number, to: number, bucket: Bucket): SeriesPoint[] {
  const out: SeriesPoint[] = []
  if (bucket === 'day') {
    // Re-anchor each step on local midnight, so a day that starts at 01:00 (midnight skipped) does not shift the rest.
    for (let t = startOfLocalDay(from); t < to; t = startOfLocalDay(addLocalDays(t, 1))) out.push({ start: t, key: localDateKey(t), views: 0, visitors: 0, clicks: 0 })
  } else {
    // Real hours, not clock labels: a 23-hour day has 23 buckets and a 25-hour day 25, the repeated hour keyed apart.
    const first = new Date(from)
    first.setMinutes(0, 0, 0)
    const seen = new Set<string>()
    for (let t = first.getTime(); t < to; t += HOUR) {
      let key = hourKey(t)
      if (seen.has(key)) key += 'b'
      seen.add(key)
      out.push({ start: t, key, views: 0, visitors: 0, clicks: 0 })
    }
  }
  return out
}

/** The series bucket an event falls in, or null outside the series. */
function bucketIndex(series: SeriesPoint[], dayIndex: Map<string, number>, bucket: Bucket, ts: number): number | null {
  if (bucket === 'day') return dayIndex.get(localDateKey(ts)) ?? null
  if (series.length === 0 || ts < series[0].start) return null
  const i = Math.floor((ts - series[0].start) / HOUR)
  return i < series.length ? i : null
}

/** Only this page's visitor events, inside [from, to). */
export function pageEventsIn(events: AnalyticsEvent[], pageId: string, from: number, to: number): AnalyticsEvent[] {
  return events.filter((e) => e.stream === 'page' && e.pageId === pageId && e.ts >= from && e.ts < to)
}

export function aggregate(events: AnalyticsEvent[], options: AggregateOptions): Aggregate {
  const { pageId, from, to, links } = options
  const bucket = options.bucket ?? 'day'
  const current = pageEventsIn(events, pageId, from, to)
  const previous = options.prevFrom != null && options.prevTo != null ? pageEventsIn(events, pageId, options.prevFrom, options.prevTo) : []
  const totals = totalsOf(current)

  const series = emptySeries(from, to, bucket)
  const index = bucket === 'day' ? new Map(series.map((p, i) => [p.key, i])) : new Map<string, number>()
  const seriesVisitors = series.map(() => new Set<string>())

  const linkClicks = new Map<string, number>()
  const sources = new Map<string, number>()
  const devices = new Map<string, number>()
  const browsers = new Map<string, number>()
  const countries = new Map<string, number>()
  const socials = new Map<string, number>()
  const hours = Array.from({ length: 24 }, () => 0)

  for (const e of current) {
    const i = bucketIndex(series, index, bucket, e.ts)
    if (i != null) seriesVisitors[i].add(e.anonymousId)
    if (e.name === 'page_view') {
      if (i != null) series[i].views++
      bump(sources, e.context?.source || 'Direct')
      bump(devices, e.context?.device || 'unknown')
      bump(browsers, e.context?.browser || 'Other')
      bump(countries, e.context?.country || 'Unknown')
      hours[new Date(e.ts).getHours()]++
    } else if (e.name === 'link_click') {
      if (i != null) series[i].clicks++
      bump(linkClicks, linkIdOf(e.props ?? {}) ?? '')
    } else if (e.name === 'social_click') {
      const id = socialIdOf(e.props ?? {})
      if (id) bump(socials, id)
    }
  }
  series.forEach((p, i) => (p.visitors = seriesVisitors[i].size))

  const share = (n: number) => (totals.clicks ? n / totals.clicks : 0)
  const ctr = (n: number) => (totals.views ? n / totals.views : 0)
  const known = new Set(links.map((l) => l.id))
  const linkStats: LinkStat[] = links.map((l) => {
    const clicks = linkClicks.get(l.id) ?? 0
    return { id: l.id, title: l.title, visible: l.visible !== false, clicks, share: share(clicks), ctr: ctr(clicks) }
  })
  let removedClicks = 0
  let removedLinks = 0
  for (const [id, n] of linkClicks) {
    if (known.has(id)) continue
    removedClicks += n
    removedLinks++
  }

  return {
    totals,
    previous: totalsOf(previous),
    series,
    links: linkStats,
    removed: removedClicks ? { clicks: removedClicks, share: share(removedClicks), ctr: ctr(removedClicks), links: removedLinks } : null,
    sources: breakdown(sources),
    devices: breakdown(devices),
    browsers: breakdown(browsers),
    countries: breakdown(countries),
    hours,
    socials: breakdown(socials),
  }
}

export type Change = { text: string; direction: 'up' | 'down' | 'flat' | 'new' | 'none' }

/** The change against the previous period, written out: "+12% vs previous 30 days". */
export function describeChange(current: number, previous: number, previousLabel: string, kind: 'count' | 'rate' = 'count'): Change {
  if (kind === 'rate') {
    const pts = Math.round((current - previous) * 1000) / 10
    if (previous === 0 && current === 0) return { text: `No clicks in either period`, direction: 'none' }
    if (pts === 0) return { text: `Same as ${previousLabel}`, direction: 'flat' }
    return { text: `${pts > 0 ? '+' : '−'}${Math.abs(pts).toFixed(1)} pts vs ${previousLabel}`, direction: pts > 0 ? 'up' : 'down' }
  }
  if (previous === 0) {
    if (current === 0) return { text: `None in ${previousLabel} either`, direction: 'none' }
    return { text: `None in ${previousLabel}`, direction: 'new' }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: `Same as ${previousLabel}`, direction: 'flat' }
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs ${previousLabel}`, direction: pct > 0 ? 'up' : 'down' }
}

export const MS = { HOUR, DAY }
