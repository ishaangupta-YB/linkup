import { newId } from '../lib/ids'
import { readJSON, writeJSON } from '../lib/storage'
import { collectContext } from './context'
import { PAGE_EVENTS, type AnalyticsEvent, type EventContext, type EventName, type PropValue } from './events'
import type { Transport } from './transports'

const ANON_KEY = 'linkup:anon'
const SESSION_KEY = 'linkup:analytics-session'
const OUTBOX_KEY = 'linkup:analytics-outbox'
export const OPT_OUT_KEY = 'linkup:analytics-optout'

const SESSION_IDLE_MS = 30 * 60_000
const DEDUPE_MS = 2_000
const OUTBOX_CAP = 1_000

export type TrackOptions = {
  pageId?: string | null
  handle?: string | null
  /** Events with the same key inside two seconds are sent once (guards double renders and double taps). */
  dedupeKey?: string
}

export type TrackerOptions = {
  transport: Transport
  batchSize?: number
  flushIntervalMs?: number
  /** Overridable for tests. */
  now?: () => number
  context?: () => EventContext
}

/**
 * Queues events, batches them to the transport and keeps anything unsent in an outbox
 * that survives reloads. Honours an explicit opt-out, Do Not Track and Global Privacy
 * Control for visitor (page) events.
 */
export class Tracker {
  private transport: Transport
  private batchSize: number
  private now: () => number
  private context: () => EventContext
  private queue: AnalyticsEvent[]
  private userId: string | null = null
  private recent = new Map<string, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null
  private inFlight = new Set<string>()

  constructor(options: TrackerOptions) {
    this.transport = options.transport
    this.batchSize = options.batchSize ?? 10
    this.now = options.now ?? Date.now
    this.context = options.context ?? collectContext
    this.queue = readJSON<AnalyticsEvent[]>(OUTBOX_KEY, [])
    if (!Array.isArray(this.queue)) this.queue = []
    const interval = options.flushIntervalMs ?? 4_000
    if (interval > 0 && typeof window !== 'undefined') {
      this.timer = setInterval(() => void this.flush(), interval)
      const onHide = () => {
        if (document.visibilityState === 'hidden') void this.flush(true)
      }
      document.addEventListener('visibilitychange', onHide)
      window.addEventListener('pagehide', () => void this.flush(true))
    }
  }

  get transportName() {
    return this.transport.name
  }

  identify(userId: string | null) {
    this.userId = userId
  }

  isOptedOut() {
    return readJSON<boolean>(OPT_OUT_KEY, false) === true
  }

  setOptOut(optOut: boolean) {
    writeJSON(OPT_OUT_KEY, optOut)
    if (optOut) {
      this.queue = []
      this.persist()
    }
  }

  /** True when the browser asks not to be tracked. */
  private browserSaysNo() {
    if (typeof navigator === 'undefined') return false
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    return nav.doNotTrack === '1' || nav.globalPrivacyControl === true
  }

  /** Builds and queues one event. Returns it, or null when it was dropped (opt-out, DNT, duplicate). */
  track(name: EventName, props: Record<string, PropValue> = {}, options: TrackOptions = {}): AnalyticsEvent | null {
    if (this.isOptedOut()) return null
    const stream = (PAGE_EVENTS as readonly string[]).includes(name) ? 'page' : 'app'
    if (stream === 'page' && this.browserSaysNo()) return null
    const ts = this.now()
    if (options.dedupeKey) {
      const last = this.recent.get(options.dedupeKey)
      if (last != null && ts - last < DEDUPE_MS) return null
      this.recent.set(options.dedupeKey, ts)
    }
    const event: AnalyticsEvent = {
      v: 1,
      id: newId(16),
      name,
      stream,
      ts,
      anonymousId: this.anonymousId(),
      userId: this.userId,
      sessionId: this.sessionId(ts),
      pageId: options.pageId ?? null,
      handle: options.handle ?? null,
      props,
      context: this.context(),
    }
    this.queue.push(event)
    if (this.queue.length > OUTBOX_CAP) this.queue = this.queue.slice(-OUTBOX_CAP)
    this.persist()
    // Visitor events go straight out: a tap on a link usually leaves the page.
    if (stream === 'page' || this.queue.length >= this.batchSize) void this.flush()
    return event
  }

  /** Sends everything queued. Concurrent calls share one send. */
  flush(unloading = false): Promise<void> {
    if (this.flushing) {
      if (unloading) {
        // The tab is closing: beacon whatever is not in the batch already on its way. Ids dedupe any overlap.
        const rest = this.queue.filter((e) => !this.inFlight.has(e.id))
        if (rest.length) this.transport.send(rest, true).catch(() => undefined)
        return this.flushing
      }
      // Send whatever arrived during this flush once it finishes.
      return this.flushing.then(() => this.flush())
    }
    if (this.queue.length === 0) return Promise.resolve()
    const batch = this.queue.slice()
    this.inFlight = new Set(batch.map((e) => e.id))
    this.flushing = this.transport
      .send(batch, unloading)
      .then(() => {
        const sent = new Set(batch.map((e) => e.id))
        this.queue = this.queue.filter((e) => !sent.has(e.id))
        this.persist()
      })
      .catch(() => {
        // Keep the batch in the outbox; the next interval retries it.
      })
      .finally(() => {
        this.inFlight = new Set()
        this.flushing = null
      })
    return this.flushing
  }

  pending() {
    return this.queue.length
  }

  destroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private persist() {
    writeJSON(OUTBOX_KEY, this.queue)
  }

  private anonymousId() {
    let id = readJSON<string | null>(ANON_KEY, null)
    if (!id) {
      id = newId(16)
      writeJSON(ANON_KEY, id)
    }
    return id
  }

  private sessionId(ts: number) {
    const stored = readJSON<{ id: string; last: number } | null>(SESSION_KEY, null)
    const id = stored && ts - stored.last < SESSION_IDLE_MS ? stored.id : newId(16)
    writeJSON(SESSION_KEY, { id, last: ts })
    return id
  }
}
