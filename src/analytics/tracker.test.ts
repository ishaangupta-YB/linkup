import { beforeEach, describe, expect, it } from 'vitest'
import { countryFromTimezone, deriveBrowser, deriveDevice, deriveOs, deriveSource } from './context'
import type { AnalyticsEvent, EventContext } from './events'
import { OPT_OUT_KEY, Tracker } from './tracker'
import { LOCAL_EVENTS_KEY, LocalTransport, readLocalEvents, type Transport } from './transports'

const ctx: EventContext = {
  path: '/x', referrer: '', source: 'Direct', medium: null, campaign: null, device: 'desktop',
  browser: 'Chrome', os: 'Linux', language: 'en', timezone: 'Asia/Kolkata', country: 'India', screen: '1x1',
}

class MemoryTransport implements Transport {
  name = 'memory'
  batches: AnalyticsEvent[][] = []
  fail = false
  async send(events: AnalyticsEvent[]) {
    if (this.fail) throw new Error('down')
    this.batches.push(events)
  }
}

beforeEach(() => localStorage.clear())

describe('Tracker', () => {
  it('builds v1 events with stream, ids and context', () => {
    const t = new Tracker({ transport: new MemoryTransport(), flushIntervalMs: 0, context: () => ctx })
    const e = t.track('link_click', { linkId: 'a' }, { pageId: 'p1', handle: 'h' })!
    expect(e.v).toBe(1)
    expect(e.stream).toBe('page')
    expect(e.pageId).toBe('p1')
    expect(e.anonymousId).toHaveLength(16)
    expect(t.track('signed_up')!.stream).toBe('app')
    expect(t.track('signed_up')!.anonymousId).toBe(e.anonymousId)
  })

  it('flushes page events immediately and batches app events', async () => {
    const m = new MemoryTransport()
    const t = new Tracker({ transport: m, batchSize: 3, flushIntervalMs: 0, context: () => ctx })
    t.track('editor_opened')
    t.track('link_added')
    await t.flush()
    expect(m.batches.flat()).toHaveLength(2)
    t.track('page_view')
    await t.flush()
    expect(m.batches.flat().map((e) => e.name)).toContain('page_view')
    expect(t.pending()).toBe(0)
  })

  it('keeps a failed batch in the outbox and retries it', async () => {
    const m = new MemoryTransport()
    m.fail = true
    const t = new Tracker({ transport: m, flushIntervalMs: 0, context: () => ctx })
    t.track('page_view')
    await t.flush()
    expect(t.pending()).toBe(1)
    // The outbox survives a reload.
    const reloaded = new Tracker({ transport: m, flushIntervalMs: 0, context: () => ctx })
    expect(reloaded.pending()).toBe(1)
    m.fail = false
    await reloaded.flush()
    expect(reloaded.pending()).toBe(0)
    expect(m.batches.flat()).toHaveLength(1)
  })

  it('drops duplicates with the same dedupe key inside two seconds', () => {
    let now = 1000
    const t = new Tracker({ transport: new MemoryTransport(), flushIntervalMs: 0, now: () => now, context: () => ctx })
    expect(t.track('page_view', {}, { dedupeKey: 'v' })).not.toBeNull()
    expect(t.track('page_view', {}, { dedupeKey: 'v' })).toBeNull()
    now += 2500
    expect(t.track('page_view', {}, { dedupeKey: 'v' })).not.toBeNull()
  })

  it('rolls the session after 30 idle minutes', () => {
    let now = 0
    const t = new Tracker({ transport: new MemoryTransport(), flushIntervalMs: 0, now: () => now, context: () => ctx })
    const a = t.track('page_view')!.sessionId
    now += 29 * 60_000
    expect(t.track('page_view')!.sessionId).toBe(a)
    now += 31 * 60_000
    expect(t.track('page_view')!.sessionId).not.toBe(a)
  })

  it('records nothing after opt-out', () => {
    localStorage.setItem(OPT_OUT_KEY, 'true')
    const t = new Tracker({ transport: new MemoryTransport(), flushIntervalMs: 0, context: () => ctx })
    expect(t.track('page_view')).toBeNull()
    expect(t.pending()).toBe(0)
  })
})

describe('LocalTransport', () => {
  it('appends without duplicating ids', async () => {
    const lt = new LocalTransport()
    const t = new Tracker({ transport: lt, flushIntervalMs: 0, context: () => ctx })
    const e = t.track('page_view')!
    await t.flush()
    await lt.send([e])
    expect(readLocalEvents()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY)!)[0].id).toBe(e.id)
  })
})

describe('context', () => {
  it('names sources from UTM, then referrer, else Direct', () => {
    expect(deriveSource('?utm_source=ig&utm_campaign=launch', '', 'linkup.to')).toEqual({ source: 'Instagram', medium: null, campaign: 'launch' })
    expect(deriveSource('', 'https://l.instagram.com/?u=x', 'linkup.to').source).toBe('Instagram')
    expect(deriveSource('', 'https://lnkd.in/abc', 'linkup.to').source).toBe('LinkedIn')
    expect(deriveSource('', 'https://www.google.co.in/', 'linkup.to').source).toBe('Google')
    expect(deriveSource('', 'https://linkup.to/app', 'linkup.to').source).toBe('Direct')
    expect(deriveSource('', '', 'linkup.to').source).toBe('Direct')
    expect(deriveSource('', 'https://news.example.com/a', 'linkup.to').source).toBe('news.example.com')
  })

  it('reads device, browser and OS from the user agent', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(deriveDevice(iphone, 390)).toBe('mobile')
    expect(deriveBrowser(iphone)).toBe('Safari')
    expect(deriveOs(iphone)).toBe('iOS')
    const ig = iphone + ' Instagram 300.0'
    expect(deriveBrowser(ig)).toBe('Instagram in-app')
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
    expect(deriveDevice(chrome, 1440)).toBe('desktop')
    expect(deriveBrowser(chrome)).toBe('Chrome')
    expect(deriveOs(chrome)).toBe('Windows')
  })

  it('maps time zones to countries', () => {
    expect(countryFromTimezone('Asia/Kolkata')).toBe('India')
    expect(countryFromTimezone('Europe/Oslo')).toBe('Other (Europe)')
    expect(countryFromTimezone('Nowhere')).toBe('Unknown')
  })
})
