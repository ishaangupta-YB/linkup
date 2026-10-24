/**
 * The analytics entry point every screen imports. One tracker per tab, wired from Vite
 * env (see transports.ts). In demo mode events are stored in this browser and the
 * dashboard reads them back with readEvents().
 */
import type { AnalyticsEvent, EventName, PropValue } from './events'
import { Tracker, type TrackOptions } from './tracker'
import { clearLocalEvents, readLocalEvents, subscribeLocalEvents, transportFromEnv } from './transports'

export type { AnalyticsEvent, EventName, PageEventName, AppEventName, PropValue, Device, EventContext } from './events'
export { PAGE_EVENTS } from './events'

let tracker: Tracker | null = null

function getTracker() {
  tracker ??= new Tracker({ transport: transportFromEnv(import.meta.env as Record<string, string | undefined>) })
  return tracker
}

export function track(name: EventName, props: Record<string, PropValue> = {}, options?: TrackOptions) {
  return getTracker().track(name, props, options)
}

export function identify(userId: string | null) {
  getTracker().identify(userId)
}

export function flush() {
  return getTracker().flush()
}

export function isOptedOut() {
  return getTracker().isOptedOut()
}

export function setOptOut(optOut: boolean) {
  getTracker().setOptOut(optOut)
}

/** Which transport this build sends to: local, http or local+http. */
export function transportName() {
  return getTracker().transportName
}

/** Every event stored in this browser (demo warehouse), oldest first. */
export function readEvents(): AnalyticsEvent[] {
  return readLocalEvents()
}

export function subscribeEvents(listener: () => void) {
  return subscribeLocalEvents(listener)
}

export function clearEvents() {
  clearLocalEvents()
}

/** Events built but not yet handed to the transport (the outbox). */
export function pendingEvents() {
  return getTracker().pending()
}
