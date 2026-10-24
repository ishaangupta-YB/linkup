/**
 * Generated sample traffic, so a new dashboard is not an empty page. Every event carries
 * `sample: true` and the dashboard says so wherever it is shown. Deterministic: the same
 * page, links, day and seed always produce the same events.
 */
import type { AnalyticsEvent, Device, EventContext } from './events'
import { addLocalDays, localDateKey, startOfLocalDay } from './aggregate'

export type SampleInput = {
  pageId: string
  handle: string
  links: { id: string; title: string; visible?: boolean }[]
  /** Social id to the value typed in the editor; empty values get no clicks. */
  socials: Record<string, string>
  now: number
  days?: number
  seed?: number
}

/** mulberry32: a small, fast, seeded PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Weighted<T> = [T, number][]

function picker<T>(items: Weighted<T>) {
  const total = items.reduce((s, [, w]) => s + w, 0)
  return (r: number): T => {
    let x = r * total
    for (const [item, w] of items) {
      x -= w
      if (x < 0) return item
    }
    return items[items.length - 1][0]
  }
}

const SOURCES = picker<{ source: string; referrer: string }>([
  [{ source: 'Instagram', referrer: 'https://l.instagram.com/' }, 38],
  [{ source: 'WhatsApp', referrer: '' }, 18],
  [{ source: 'Direct', referrer: '' }, 16],
  [{ source: 'LinkedIn', referrer: 'https://www.linkedin.com/' }, 12],
  [{ source: 'YouTube', referrer: 'https://www.youtube.com/' }, 7],
  [{ source: 'Google', referrer: 'https://www.google.com/' }, 6],
  [{ source: 'X', referrer: 'https://t.co/' }, 3],
])

const DEVICES = picker<Device>([
  ['mobile', 82],
  ['desktop', 15],
  ['tablet', 3],
])

const COUNTRIES = picker<{ country: string; timezone: string; language: string }>([
  [{ country: 'India', timezone: 'Asia/Kolkata', language: 'en-IN' }, 84],
  [{ country: 'United Arab Emirates', timezone: 'Asia/Dubai', language: 'en-AE' }, 5],
  [{ country: 'United Kingdom', timezone: 'Europe/London', language: 'en-GB' }, 4],
  [{ country: 'United States', timezone: 'America/New_York', language: 'en-US' }, 4],
  [{ country: 'Singapore', timezone: 'Asia/Singapore', language: 'en-SG' }, 3],
])

const MOBILE_BROWSERS = picker<{ browser: string; os: string; screen: string }>([
  [{ browser: 'Chrome', os: 'Android', screen: '412x915' }, 46],
  [{ browser: 'Safari', os: 'iOS', screen: '390x844' }, 32],
  [{ browser: 'Samsung Internet', os: 'Android', screen: '384x854' }, 10],
  [{ browser: 'Firefox', os: 'Android', screen: '412x892' }, 2],
])

const DESKTOP_BROWSERS = picker<{ browser: string; os: string; screen: string }>([
  [{ browser: 'Chrome', os: 'Windows', screen: '1920x1080' }, 52],
  [{ browser: 'Safari', os: 'macOS', screen: '1440x900' }, 22],
  [{ browser: 'Edge', os: 'Windows', screen: '1536x864' }, 16],
  [{ browser: 'Firefox', os: 'Linux', screen: '1920x1080' }, 10],
])

/** Relative page views by local hour: quiet nights, a lunch bump, an evening peak. */
const HOUR_WEIGHTS = [3, 1.5, 1, 0.6, 0.5, 0.8, 2, 4, 6, 7, 7.5, 8, 9, 9.5, 8, 7, 7, 8, 9.5, 11, 12.5, 13, 11, 6]
const HOURS = picker<number>(HOUR_WEIGHTS.map((w, h) => [h, w]))

type Visitor = {
  anonymousId: string
  device: Device
  base: { browser: string; os: string; screen: string }
  place: { country: string; timezone: string; language: string }
}

const cache = new Map<string, AnalyticsEvent[]>()

/** Sample events for the `days` local days ending today, oldest first, none after `now`. */
export function generateSampleEvents(input: SampleInput): AnalyticsEvent[] {
  const days = input.days ?? 90
  const seed = input.seed ?? 1
  const links = input.links.filter((l) => l.visible !== false)
  const socials = Object.entries(input.socials)
    .filter(([, v]) => v.trim() !== '')
    .map(([k]) => k)
  const key = [input.pageId, input.handle, links.map((l) => l.id).join(','), socials.join(','), localDateKey(input.now), days, seed].join('|')
  let all = cache.get(key)
  if (!all) {
    all = build(input.pageId, input.handle, links, socials, startOfLocalDay(input.now), days, seed ^ hashString(input.pageId))
    // One page at a time is all the dashboard needs.
    cache.clear()
    cache.set(key, all)
  }
  const now = input.now
  let end = all.length
  while (end > 0 && all[end - 1].ts > now) end--
  return end === all.length ? all : all.slice(0, end)
}

function build(pageId: string, handle: string, links: { id: string; title: string }[], socials: string[], today: number, days: number, seed: number): AnalyticsEvent[] {
  const rand = mulberry32(seed)
  const events: AnalyticsEvent[] = []
  const returning: Visitor[] = []
  let visitorCount = 0
  let sessionCount = 0
  let eventCount = 0
  // Earlier links get more clicks.
  const pickLink = links.length ? picker(links.map((_, i) => [i, 1 / Math.pow(i + 1, 0.85)] as [number, number])) : null
  const pickSocial = socials.length ? picker(socials.map((s, i) => [s, 1 / (i + 1.5)] as [string, number])) : null

  const newVisitor = (): Visitor => {
    const device = DEVICES(rand())
    return {
      anonymousId: `sample-v${(visitorCount++).toString(36).padStart(5, '0')}`,
      device,
      base: device === 'desktop' ? DESKTOP_BROWSERS(rand()) : MOBILE_BROWSERS(rand()),
      place: COUNTRIES(rand()),
    }
  }

  const contexts = new Map<string, EventContext>()
  const contextFor = (v: Visitor, src: { source: string; referrer: string }): EventContext => {
    // In-app browsers open links tapped inside Instagram and LinkedIn.
    let browser = v.base.browser
    if (v.device !== 'desktop' && src.source === 'Instagram' && rand() < 0.72) browser = 'Instagram in-app'
    else if (v.device !== 'desktop' && src.source === 'LinkedIn' && rand() < 0.4) browser = 'LinkedIn in-app'
    const k = `${v.anonymousId}|${src.source}|${browser}`
    let c = contexts.get(k)
    if (!c) {
      c = {
        path: `/${handle}`,
        referrer: src.referrer,
        source: src.source,
        medium: null,
        campaign: null,
        device: v.device,
        browser,
        os: v.base.os,
        language: v.place.language,
        timezone: v.place.timezone,
        country: v.place.country,
        screen: v.device === 'tablet' ? '820x1180' : v.base.screen,
      }
      contexts.set(k, c)
    }
    return c
  }

  const push = (name: AnalyticsEvent['name'], ts: number, v: Visitor, sessionId: string, context: EventContext, props: AnalyticsEvent['props']) => {
    events.push({
      v: 1,
      id: `sample-${(eventCount++).toString(36)}`,
      name,
      stream: 'page',
      ts,
      anonymousId: v.anonymousId,
      userId: null,
      sessionId,
      pageId,
      handle,
      props,
      context,
      sample: true,
    })
  }

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = addLocalDays(today, -d)
    const weekday = new Date(dayStart).getDay()
    const progress = (days - 1 - d) / Math.max(1, days - 1)
    let target = 150 + 105 * progress
    if (weekday === 0 || weekday === 6) target *= 1.2
    target *= 0.86 + rand() * 0.28
    if (d === 12) target *= 2.6
    else if (d === 11) target *= 1.5
    const viewsToday = Math.round(target)

    let views = 0
    while (views < viewsToday) {
      const back = returning.length > 20 && rand() < 0.28
      const v = back ? returning[returning.length - 1 - Math.floor(Math.pow(rand(), 2) * Math.min(returning.length, 4000))] : newVisitor()
      if (!back && rand() < 0.35) returning.push(v)
      const src = back && rand() < 0.5 ? { source: 'Direct', referrer: '' } : SOURCES(rand())
      const context = contextFor(v, src)
      const sessionId = `sample-s${(sessionCount++).toString(36)}`
      let ts = dayStart + HOURS(rand()) * 3_600_000 + Math.floor(rand() * 3_600_000)
      const pages = rand() < 0.78 ? 1 : rand() < 0.75 ? 2 : 3
      for (let p = 0; p < pages && views < viewsToday; p++) {
        push('page_view', ts, v, sessionId, context, {})
        views++
        if (pickLink && rand() < 0.36) {
          const i = pickLink(rand())
          ts += 4_000 + Math.floor(rand() * 40_000)
          push('link_click', ts, v, sessionId, context, { linkId: links[i].id, title: links[i].title, position: i + 1 })
        }
        if (pickSocial && rand() < 0.05) {
          ts += 3_000 + Math.floor(rand() * 20_000)
          push('social_click', ts, v, sessionId, context, { social: pickSocial(rand()) })
        }
        if (rand() < 0.008) {
          ts += 2_000 + Math.floor(rand() * 10_000)
          push('share_click', ts, v, sessionId, context, { method: rand() < 0.6 ? 'native' : 'copy' })
        }
        ts += 20_000 + Math.floor(rand() * 240_000)
      }
    }
  }
  return events.sort((a, b) => a.ts - b.ts)
}
