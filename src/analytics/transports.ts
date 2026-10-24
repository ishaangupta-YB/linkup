import { readJSON, writeJSON } from '../lib/storage'
import type { AnalyticsEvent } from './events'

/** Where batches of events go. `unloading` is set when the page is closing and only sendBeacon-style delivery survives. */
export interface Transport {
  readonly name: string
  send(events: AnalyticsEvent[], unloading: boolean): Promise<void>
}

/* ---------- local: the demo warehouse ---------- */

export const LOCAL_EVENTS_KEY = 'linkup:events'
/** Oldest events drop off past this, so localStorage never fills up. */
export const LOCAL_EVENTS_CAP = 20_000
const CHANNEL = 'linkup:events'

type Listener = () => void
const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null

function getChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = () => notify(false)
  return channel
}

function notify(broadcast: boolean) {
  for (const l of listeners) l()
  if (broadcast) getChannel()?.postMessage('changed')
}

export function readLocalEvents(): AnalyticsEvent[] {
  const events = readJSON<AnalyticsEvent[]>(LOCAL_EVENTS_KEY, [])
  return Array.isArray(events) ? events : []
}

export function clearLocalEvents() {
  writeJSON(LOCAL_EVENTS_KEY, [])
  notify(true)
}

/** Calls back whenever events are stored, in this tab or another one. */
export function subscribeLocalEvents(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_EVENTS_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Keeps every event in this browser's localStorage. Stands in for the warehouse until the AWS pipeline exists. */
export class LocalTransport implements Transport {
  readonly name = 'local'
  async send(events: AnalyticsEvent[]) {
    const stored = readLocalEvents()
    const seen = new Set(stored.map((e) => e.id))
    const merged = stored.concat(events.filter((e) => !seen.has(e.id)))
    writeJSON(LOCAL_EVENTS_KEY, merged.length > LOCAL_EVENTS_CAP ? merged.slice(-LOCAL_EVENTS_CAP) : merged)
    notify(true)
  }
}

/* ---------- http: the AWS collector ---------- */

/**
 * POSTs `{ events: [...] }` as JSON to a collector endpoint, for example an API Gateway
 * route that puts records on a Kinesis Firehose stream. On unload it uses sendBeacon.
 * A failed send throws, and the tracker keeps the batch in its outbox to retry.
 */
export class HttpTransport implements Transport {
  readonly name = 'http'
  private endpoint: string
  private writeKey: string | null
  constructor(endpoint: string, writeKey: string | null = null) {
    this.endpoint = endpoint
    this.writeKey = writeKey
  }

  async send(events: AnalyticsEvent[], unloading: boolean) {
    const body = JSON.stringify({ sentAt: Date.now(), writeKey: this.writeKey, events })
    if (unloading && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }))
      if (!ok) throw new Error('sendBeacon refused the batch')
      return
    }
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length < 60_000,
      credentials: 'omit',
    })
    if (!res.ok) throw new Error(`Collector answered ${res.status}`)
  }
}

/** Sends to every transport; fails only if all of them fail, so the local copy is never lost to a network error. */
export class FanoutTransport implements Transport {
  readonly name: string
  private transports: Transport[]
  constructor(transports: Transport[]) {
    this.transports = transports
    this.name = transports.map((t) => t.name).join('+')
  }
  async send(events: AnalyticsEvent[], unloading: boolean) {
    const results = await Promise.allSettled(this.transports.map((t) => t.send(events, unloading)))
    if (results.every((r) => r.status === 'rejected')) throw new Error('Every analytics transport failed')
  }
}

/** Picks transports from Vite env: VITE_ANALYTICS_TRANSPORT = local (default) | http | both, VITE_ANALYTICS_ENDPOINT, VITE_ANALYTICS_WRITE_KEY. */
export function transportFromEnv(env: Record<string, string | undefined>): Transport {
  const mode = (env.VITE_ANALYTICS_TRANSPORT ?? 'local').toLowerCase()
  const endpoint = env.VITE_ANALYTICS_ENDPOINT
  const key = env.VITE_ANALYTICS_WRITE_KEY ?? null
  if ((mode === 'http' || mode === 'both') && endpoint) {
    const http = new HttpTransport(endpoint, key)
    return mode === 'both' ? new FanoutTransport([new LocalTransport(), http]) : http
  }
  return new LocalTransport()
}
