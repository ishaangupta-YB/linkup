import { describe, expect, it } from 'vitest'
import { aggregate, describeChange, localDateKey, rangeBounds, type LinkRef } from './aggregate'
import type { AnalyticsEvent, EventContext } from './events'

const ctx: EventContext = {
  path: '/h', referrer: '', source: 'Direct', medium: null, campaign: null, device: 'mobile',
  browser: 'Chrome', os: 'Android', language: 'en-IN', timezone: 'Asia/Kolkata', country: 'India', screen: '1x1',
}

let n = 0
function ev(name: AnalyticsEvent['name'], ts: number, over: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    v: 1, id: `e${n++}`, name, stream: name.startsWith('page') || name.endsWith('_click') ? 'page' : 'app', ts,
    anonymousId: 'a1', userId: null, sessionId: 's1', pageId: 'p1', handle: 'h', props: {}, context: ctx, ...over,
  }
}

const at = (day: number, hour = 12, month = 9) => new Date(2026, month, day, hour).getTime()
const links: LinkRef[] = [
  { id: 'l1', title: 'First' },
  { id: 'l2', title: 'Second' },
  { id: 'l3', title: 'Hidden', visible: false },
]

describe('aggregate', () => {
  it('returns zeros, not NaN, for no events', () => {
    const r = aggregate([], { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.totals).toEqual({ views: 0, visitors: 0, clicks: 0, ctr: 0, socialClicks: 0, shares: 0, sessions: 0, events: 0 })
    expect(r.series).toHaveLength(7)
    expect(r.series.every((p) => p.views === 0 && p.clicks === 0)).toBe(true)
    expect(r.links.map((l) => [l.id, l.clicks, l.share, l.ctr])).toEqual([['l1', 0, 0, 0], ['l2', 0, 0, 0], ['l3', 0, 0, 0]])
    expect(r.removed).toBeNull()
    expect(r.hours).toHaveLength(24)
    expect(r.sources).toEqual([])
  })

  it('zero fills every local day in the range, in order', () => {
    const events = [ev('page_view', at(2)), ev('page_view', at(2, 23)), ev('page_view', at(5, 1))]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.series.map((p) => p.key)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'])
    expect(r.series.map((p) => p.views)).toEqual([0, 2, 0, 0, 1, 0, 0])
    expect(r.hours[23]).toBe(1)
    expect(r.hours[1]).toBe(1)
  })

  it('buckets by hour when asked', () => {
    const events = [ev('page_view', at(3, 9)), ev('link_click', at(3, 9), { props: { linkId: 'l1' } })]
    const r = aggregate(events, { pageId: 'p1', from: at(3, 0), to: at(3, 12), links, bucket: 'hour' })
    expect(r.series).toHaveLength(12)
    expect(r.series[9]).toMatchObject({ key: `${localDateKey(at(3))}T09`, views: 1, clicks: 1, visitors: 1 })
  })

  it('counts only page events of this page inside the range', () => {
    const events = [
      ev('page_view', at(2)),
      ev('page_view', at(2), { pageId: 'other' }),
      ev('editor_opened', at(2), { stream: 'app' }),
      ev('page_view', at(9)),
      ev('page_view', at(1, 0) - 1),
    ]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.totals.views).toBe(1)
    expect(r.totals.events).toBe(1)
  })

  it('counts unique visitors by anonymousId and sessions by sessionId', () => {
    const events = [
      ev('page_view', at(2), { anonymousId: 'a', sessionId: 's1' }),
      ev('page_view', at(2, 13), { anonymousId: 'a', sessionId: 's1' }),
      ev('page_view', at(3), { anonymousId: 'a', sessionId: 's2' }),
      ev('page_view', at(3), { anonymousId: 'b', sessionId: 's3' }),
    ]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.totals.views).toBe(4)
    expect(r.totals.visitors).toBe(2)
    expect(r.totals.sessions).toBe(3)
    expect(r.series[1].visitors).toBe(1)
    expect(r.series[2].visitors).toBe(2)
  })

  it('computes clicks, CTR and per-link stats in the page order', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) => ev('page_view', at(2, i))),
      ev('link_click', at(2), { props: { linkId: 'l2' } }),
      ev('link_click', at(2), { props: { linkId: 'l2' } }),
      ev('link_click', at(2), { props: { linkId: 'l1' } }),
      ev('social_click', at(2), { props: { social: 'instagram' } }),
      ev('share_click', at(2)),
    ]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.totals.clicks).toBe(3)
    expect(r.totals.ctr).toBeCloseTo(0.3)
    expect(r.totals.socialClicks).toBe(1)
    expect(r.totals.shares).toBe(1)
    expect(r.links.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
    expect(r.links[1]).toMatchObject({ clicks: 2, share: 2 / 3, ctr: 0.2 })
    expect(r.links[2].visible).toBe(false)
    expect(r.socials).toEqual([{ key: 'instagram', count: 1, share: 1 }])
  })

  it('puts clicks on links no longer on the page in a removed bucket', () => {
    const events = [
      ev('page_view', at(2)),
      ev('page_view', at(2)),
      ev('link_click', at(2), { props: { linkId: 'gone-1' } }),
      ev('link_click', at(2), { props: { linkId: 'gone-2' } }),
      ev('link_click', at(2), { props: { linkId: 'gone-2' } }),
      ev('link_click', at(2), { props: { linkId: 'l1' } }),
    ]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.removed).toEqual({ clicks: 3, share: 0.75, ctr: 1.5, links: 2 })
    expect(r.links[0].clicks).toBe(1)
  })

  it('totals the previous period separately', () => {
    const events = [ev('page_view', at(2)), ev('page_view', at(9)), ev('page_view', at(10)), ev('link_click', at(10), { props: { linkId: 'l1' } })]
    const r = aggregate(events, { pageId: 'p1', from: at(8, 0), to: at(15, 0), prevFrom: at(1, 0), prevTo: at(8, 0), links })
    expect(r.totals.views).toBe(2)
    expect(r.totals.clicks).toBe(1)
    expect(r.previous.views).toBe(1)
    expect(r.previous.clicks).toBe(0)
  })

  it('ranks breakdowns by count', () => {
    const events = [
      ev('page_view', at(2), { context: { ...ctx, source: 'Instagram', device: 'desktop' } }),
      ev('page_view', at(2), { context: { ...ctx, source: 'Instagram' } }),
      ev('page_view', at(2)),
    ]
    const r = aggregate(events, { pageId: 'p1', from: at(1, 0), to: at(8, 0), links })
    expect(r.sources).toEqual([{ key: 'Instagram', count: 2, share: 2 / 3 }, { key: 'Direct', count: 1, share: 1 / 3 }])
    expect(r.devices[0]).toMatchObject({ key: 'mobile', count: 2 })
  })
})

describe('rangeBounds', () => {
  const now = new Date(2026, 9, 24, 15, 30).getTime()
  it('covers today and the days before it, with an equal previous period', () => {
    const b = rangeBounds('7d', now)
    expect(localDateKey(b.from)).toBe('2026-10-18')
    expect(b.to).toBeGreaterThan(now)
    expect(localDateKey(b.prevFrom)).toBe('2026-10-11')
    expect(b.prevTo).toBe(b.from)
    expect(b.previousLabel).toBe('previous 7 days')
    const r = aggregate([], { pageId: 'p', from: b.from, to: b.to, links: [] })
    expect(r.series).toHaveLength(7)
    expect(aggregate([], { pageId: 'p', ...rangeBounds('90d', now), links: [] }).series).toHaveLength(90)
  })
  it('runs today by the hour against the same hours yesterday', () => {
    const b = rangeBounds('today', now)
    expect(b.bucket).toBe('hour')
    expect(b.from).toBe(new Date(2026, 9, 24).getTime())
    expect(b.prevFrom).toBe(new Date(2026, 9, 23).getTime())
    expect(b.prevTo).toBeLessThanOrEqual(now - 86_400_000 + 1)
    expect(aggregate([], { pageId: 'p', ...b, links: [] }).series).toHaveLength(16)
  })
})

describe('describeChange', () => {
  it('writes the change as text', () => {
    expect(describeChange(112, 100, 'previous 30 days')).toEqual({ text: '+12% vs previous 30 days', direction: 'up' })
    expect(describeChange(90, 100, 'previous 7 days').text).toBe('−10% vs previous 7 days')
    expect(describeChange(5, 0, 'previous 7 days')).toEqual({ text: 'None in previous 7 days', direction: 'new' })
    expect(describeChange(0, 0, 'previous 7 days').direction).toBe('none')
    expect(describeChange(0.35, 0.3, 'yesterday', 'rate').text).toBe('+5.0 pts vs yesterday')
  })
})
