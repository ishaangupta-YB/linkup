import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsEvent } from './events'
import { FanoutTransport, LOCAL_EVENTS_KEY, LocalTransport, readLocalEvents, type Transport } from './transports'

const event = (id: string): AnalyticsEvent => ({
  v: 1, id, name: 'page_view', stream: 'page', ts: 1, anonymousId: 'a', userId: null, sessionId: 's', pageId: 'p', handle: 'h', props: {},
  context: { path: '/', referrer: '', source: 'Direct', medium: null, campaign: null, device: 'mobile', browser: 'Chrome', os: 'Android', language: 'en', timezone: 'UTC', country: 'Unknown', screen: '1x1' },
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('LocalTransport at the storage quota', () => {
  it('drops the oldest events to make room for new ones', async () => {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(Array.from({ length: 40 }, (_, i) => event(`old${i}`))))
    const real = Storage.prototype.setItem
    // A quota that fits 20 events.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LOCAL_EVENTS_KEY && JSON.parse(value).length > 20) throw new DOMException('full', 'QuotaExceededError')
      real.call(this, key, value)
    })
    await new LocalTransport().send([event('new')])
    const stored = readLocalEvents()
    expect(stored.length).toBeLessThanOrEqual(20)
    expect(stored.at(-1)?.id).toBe('new')
  })

  it('fails the send when not even the new batch fits, so the tracker keeps it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(new LocalTransport().send([event('x')])).rejects.toThrow(/full/)
    expect(readLocalEvents()).toEqual([])
  })
})

describe('FanoutTransport', () => {
  it('fails when any transport fails, so the batch is retried everywhere', async () => {
    const ok: Transport = { name: 'ok', send: async () => {} }
    const down: Transport = { name: 'down', send: async () => { throw new Error('503') } }
    await expect(new FanoutTransport([ok, down]).send([event('a')], false)).rejects.toThrow()
    await expect(new FanoutTransport([ok, ok]).send([event('a')], false)).resolves.toBeUndefined()
  })
})
