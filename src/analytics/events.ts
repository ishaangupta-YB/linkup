/**
 * The analytics event schema, version 1. One flat JSON object per event, so the same
 * records can land in S3 through Kinesis Firehose and be queried with Athena later
 * without reshaping. See docs/analytics.md.
 */

/** Events a visitor's browser sends from a public page. These feed the creator's dashboard. */
export type PageEventName = 'page_view' | 'link_click' | 'social_click' | 'share_click'

/** Product events from the LinkUp app itself (sign-up funnel, editor use). */
export type AppEventName =
  | 'signed_up'
  | 'signed_in'
  | 'signed_out'
  | 'handle_claimed'
  | 'editor_opened'
  | 'link_added'
  | 'link_removed'
  | 'link_reordered'
  | 'look_changed'
  | 'preview_opened'
  | 'page_published'
  | 'page_unpublished'
  | 'address_copied'
  | 'dashboard_viewed'
  | 'dashboard_range_changed'
  | 'events_exported'
  | 'landing_cta_clicked'
  | 'account_deleted'

export type EventName = PageEventName | AppEventName

export const PAGE_EVENTS: readonly PageEventName[] = ['page_view', 'link_click', 'social_click', 'share_click']

export type PropValue = string | number | boolean | null

export type Device = 'mobile' | 'tablet' | 'desktop'

export type EventContext = {
  /** Path inside the app, without query string. */
  path: string
  /** Full referrer URL, or '' when there was none. */
  referrer: string
  /** Where the visit came from: utm_source, else the referrer's site, else Direct. */
  source: string
  medium: string | null
  campaign: string | null
  device: Device
  browser: string
  os: string
  language: string
  timezone: string
  /** Country guessed from the time zone. Coarse by design; a real backend uses the request's IP region. */
  country: string
  screen: string
}

export type AnalyticsEvent = {
  v: 1
  id: string
  name: EventName
  stream: 'page' | 'app'
  /** Epoch milliseconds, client clock. */
  ts: number
  /** Random id kept in this browser; never an email or a name. */
  anonymousId: string
  /** Set when a signed-in LinkUp account sent the event. */
  userId: string | null
  /** Rolls over after 30 minutes without an event. */
  sessionId: string
  pageId: string | null
  handle: string | null
  props: Record<string, PropValue>
  context: EventContext
  /** True for generated sample data shown in demo mode. Real events never carry it. */
  sample?: true
}
