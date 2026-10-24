/**
 * Daylight-saving edge cases. Each block runs in a real zone with a clock change, so the
 * local-calendar arithmetic is tested where it can go wrong, not only in UTC.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aggregate, localDateKey, rangeBounds } from './aggregate'
import type { AnalyticsEvent, EventContext } from './events'

const ctx: EventContext = {
  path: '/h', referrer: '', source: 'Direct', medium: null, campaign: null, device: 'mobile',
  browser: 'Chrome', os: 'Android', language: 'en-GB', timezone: 'Europe/London', country: 'United Kingdom', screen: '1x1',
}

let n = 0
function view(ts: number): AnalyticsEvent {
  return { v: 1, id: `d${n++}`, name: 'page_view', stream: 'page', ts, anonymousId: `a${n}`, userId: null, sessionId: `s${n}`, pageId: 'p1', handle: 'h', props: {}, context: ctx }
}

// Node reads process.env.TZ afresh when it is assigned; the app's tsconfig carries no Node types, so reach it untyped.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

/** Runs a block with TZ set to a zone, restoring it after. */
function inZone(zone: string, body: () => void) {
  describe(`in ${zone}`, () => {
    const before = env.TZ
    beforeAll(() => {
      env.TZ = zone
    })
    afterAll(() => {
      if (before === undefined) delete env.TZ
      else env.TZ = before
    })
    body()
  })
}

const HOUR = 3_600_000

inZone('Europe/London', () => {
  it('runs in the zone it names', () => {
    // Winter is GMT, summer is BST.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(0)
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-60)
  })

  it('gives a spring-forward today 23 real hours, skipping the missing clock hour', () => {
    // 29 March 2026: 01:00 GMT becomes 02:00 BST.
    const now = new Date(2026, 2, 29, 15, 30).getTime()
    const b = rangeBounds('today', now)
    const r = aggregate([view(new Date(2026, 2, 29, 0, 30).getTime()), view(new Date(2026, 2, 29, 2, 30).getTime())], { pageId: 'p1', ...b, links: [] })
    // Midnight to 15:30 is 14.5 real hours: 15 buckets, and there is no 01:00.
    expect(r.series).toHaveLength(15)
    expect(r.series.map((p) => p.key)).not.toContain('2026-03-29T01')
    expect(r.series[0].key).toBe('2026-03-29T00')
    expect(r.series[1].key).toBe('2026-03-29T02')
    expect(r.series.map((p) => p.views).slice(0, 3)).toEqual([1, 1, 0])
  })

  it('compares a clock-change today with the same clock hours yesterday', () => {
    const now = new Date(2026, 2, 29, 15, 30).getTime()
    const b = rangeBounds('today', now)
    expect(b.prevFrom).toBe(new Date(2026, 2, 28).getTime())
    // 15:30 on the 28th, not 14:30: a 24-hour subtraction would land an hour early on a 23-hour day.
    expect(b.prevTo).toBe(new Date(2026, 2, 28, 15, 30).getTime() + 1)
  })

  it('gives a fall-back today 25 buckets, the repeated hour keyed apart', () => {
    // 25 October 2026: 02:00 BST becomes 01:00 GMT, so 01:00 to 02:00 happens twice.
    const midnight = new Date(2026, 9, 25).getTime()
    const firstOne = midnight + 1 * HOUR + 30 * 60_000 // 01:30 BST
    const secondOne = midnight + 2 * HOUR + 30 * 60_000 // 01:30 GMT
    expect(new Date(firstOne).getHours()).toBe(1)
    expect(new Date(secondOne).getHours()).toBe(1)
    const now = new Date(2026, 9, 25, 23, 30).getTime()
    const r = aggregate([view(firstOne), view(secondOne), view(secondOne)], { pageId: 'p1', ...rangeBounds('today', now), links: [] })
    expect(r.series).toHaveLength(25)
    const keys = r.series.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.slice(0, 4)).toEqual(['2026-10-25T00', '2026-10-25T01', '2026-10-25T01b', '2026-10-25T02'])
    expect(r.series.map((p) => p.views).slice(0, 4)).toEqual([0, 1, 2, 0])
    expect(r.totals.views).toBe(3)
    // The hour-of-day chart counts clock hours, so both runs of 01:00 add up there.
    expect(r.hours[1]).toBe(3)
  })

  it('keeps a 7-day range on local midnights across the spring change', () => {
    const now = new Date(2026, 3, 1, 15, 30).getTime()
    const b = rangeBounds('7d', now)
    expect(localDateKey(b.from)).toBe('2026-03-26')
    expect(new Date(b.from).getHours()).toBe(0)
    // The previous period ends at the same clock time seven calendar days back, not 7 x 24 hours.
    expect(b.prevTo).toBe(new Date(2026, 2, 25, 15, 30).getTime() + 1)
    expect(b.prevFrom).toBe(new Date(2026, 2, 19).getTime())
    // No overlap between the two windows.
    expect(b.prevTo).toBeLessThanOrEqual(b.from)
    const late = new Date(2026, 2, 29, 23, 30).getTime()
    const r = aggregate([view(late)], { pageId: 'p1', ...b, links: [] })
    expect(r.series.map((p) => p.key)).toEqual(['2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01'])
    expect(r.series.every((p) => new Date(p.start).getHours() === 0 && new Date(p.start).getMinutes() === 0)).toBe(true)
    expect(r.series[3].views).toBe(1)
  })

  it('counts an event in the previous period up to the same clock time across the autumn change', () => {
    const now = new Date(2026, 9, 28, 9, 0).getTime()
    const b = rangeBounds('7d', now)
    // 21 Oct is a BST day and 28 Oct a GMT day; the cut-off is 09:00 local on both.
    expect(b.prevTo).toBe(new Date(2026, 9, 21, 9, 0).getTime() + 1)
    const justIn = new Date(2026, 9, 21, 8, 59).getTime()
    const justOut = new Date(2026, 9, 21, 9, 1).getTime()
    const r = aggregate([view(justIn), view(justOut)], { pageId: 'p1', ...b, links: [] })
    expect(r.previous.views).toBe(1)
  })
})

inZone('America/Santiago', () => {
  // 6 September 2026: Chile's clocks jump from 24:00 to 01:00, so that day has no midnight.
  it('starts a day with no midnight at its first real instant and the next day back on midnight', () => {
    expect(new Date(2026, 8, 6).getHours()).toBe(1)
    const now = new Date(2026, 8, 9, 12, 0).getTime()
    const b = rangeBounds('7d', now)
    const r = aggregate([view(new Date(2026, 8, 6, 1, 15).getTime()), view(new Date(2026, 8, 7, 0, 15).getTime())], { pageId: 'p1', ...b, links: [] })
    expect(r.series.map((p) => p.key)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'])
    expect(r.series.map((p) => new Date(p.start).getHours())).toEqual([0, 0, 0, 1, 0, 0, 0])
    expect(r.series[3].views).toBe(1)
    expect(r.series[4].views).toBe(1)
  })

  it('anchors a range that begins on the skipped midnight', () => {
    const now = new Date(2026, 8, 12, 12, 0).getTime()
    const b = rangeBounds('7d', now)
    expect(localDateKey(b.from)).toBe('2026-09-06')
    expect(new Date(b.from).getHours()).toBe(1)
    expect(localDateKey(b.prevFrom)).toBe('2026-08-30')
    expect(new Date(b.prevFrom).getHours()).toBe(0)
  })
})
