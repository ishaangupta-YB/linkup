import { describe, expect, it } from 'vitest'
import { aggregate, rangeBounds } from './aggregate'
import { generateSampleEvents, mulberry32 } from './demo'

const now = new Date(2026, 9, 24, 15, 30).getTime()
const input = {
  pageId: 'page-demo',
  handle: 'thedesignsquare',
  links: [
    { id: 'l1', title: 'One' },
    { id: 'l2', title: 'Two' },
    { id: 'l3', title: 'Three' },
    { id: 'l4', title: 'Hidden', visible: false },
  ],
  socials: { instagram: '@x', linkedin: '', youtube: '@y', whatsapp: '', x: '', website: '' },
  now,
}

describe('generateSampleEvents', () => {
  it('is deterministic and marks every event as sample', () => {
    const a = generateSampleEvents(input)
    const b = generateSampleEvents({ ...input, links: [...input.links] })
    expect(a.length).toBe(b.length)
    expect(a.slice(0, 50)).toEqual(b.slice(0, 50))
    expect(a.every((e) => e.sample === true && e.stream === 'page' && e.pageId === 'page-demo')).toBe(true)
    expect(mulberry32(7)()).toBe(mulberry32(7)())
  })

  it('stops at now and keeps a modest daily volume', () => {
    const events = generateSampleEvents(input)
    expect(events.every((e) => e.ts <= now)).toBe(true)
    const r = aggregate(events, { pageId: 'page-demo', ...rangeBounds('90d', now), links: input.links })
    const full = r.series.slice(0, -1).map((p) => p.views)
    expect(Math.min(...full)).toBeGreaterThan(100)
    expect(Math.max(...full)).toBeLessThan(800)
    // The spike 12 days ago is the busiest day.
    expect(full.indexOf(Math.max(...full))).toBe(89 - 12)
  })

  it('clicks only visible links, earlier links more, and only filled socials', () => {
    const events = generateSampleEvents(input)
    const r = aggregate(events, { pageId: 'page-demo', ...rangeBounds('30d', now), links: input.links })
    expect(r.links[0].clicks).toBeGreaterThan(r.links[1].clicks)
    expect(r.links[1].clicks).toBeGreaterThan(r.links[2].clicks)
    expect(r.links[3].clicks).toBe(0)
    expect(r.removed).toBeNull()
    expect(r.socials.map((s) => s.key).sort()).toEqual(['instagram', 'youtube'])
    expect(r.totals.visitors).toBeLessThan(r.totals.views)
    expect(r.devices[0].key).toBe('mobile')
    expect(r.countries[0].key).toBe('India')
    expect(r.browsers.some((b) => b.key === 'Instagram in-app')).toBe(true)
  })

  it('generates 90 days quickly', () => {
    const t = performance.now()
    generateSampleEvents({ ...input, seed: 99 })
    expect(performance.now() - t).toBeLessThan(400)
  })
})
