# Analytics

LinkUp's analytics are at the **demo stage**. The events are real and are recorded in the browser, but they are stored in that browser's `localStorage` and not on a server. This page describes how it works now and how it moves to AWS without changing the screens.

## What is recorded

Every event is one flat JSON object, schema version 1 (`src/analytics/events.ts`):

| Field | Meaning |
| --- | --- |
| `v` | Schema version, `1` |
| `id` | Random event id; collectors dedupe on it |
| `name` | Event name (below) |
| `stream` | `page` (a visitor on a public page) or `app` (a LinkUp user in the app) |
| `ts` | Epoch milliseconds, client clock |
| `anonymousId` | Random id kept in the browser; never an email or name |
| `userId` | LinkUp account id when signed in, else `null` |
| `sessionId` | Rolls over after 30 minutes without an event |
| `pageId`, `handle` | The page the event belongs to |
| `props` | Event properties (`linkId`, `title`, `url`, `position`, `network`, ...) |
| `context` | `path`, `referrer`, `source`, `medium`, `campaign`, `device`, `browser`, `os`, `language`, `timezone`, `country`, `screen` |
| `sample` | Only on generated sample data; real events never carry it |

Page events: `page_view`, `link_click`, `social_click`, `share_click`.
App events: `signed_up`, `signed_in`, `signed_out`, `handle_claimed`, `editor_opened`, `link_added`, `link_removed`, `link_reordered`, `look_changed`, `preview_opened`, `page_published`, `page_unpublished`, `address_copied`, `dashboard_viewed`, `dashboard_range_changed`, `events_exported`, `landing_cta_clicked`, `account_deleted`.

`source` comes from `utm_source` when present, else from the referrer's site (Instagram, LinkedIn, WhatsApp, YouTube, X, Facebook, Google and others), else `Direct`. `country` is guessed from the browser's time zone, which is coarse; a server should use the request's IP region instead.

## Privacy

- No tracking when the browser sends Do Not Track or Global Privacy Control (page events).
- A per-browser opt-out in Settings stops all events and clears the unsent queue.
- A page owner's own visits are not counted unless they turn on "Count my own visits".
- No visitor names, emails or IP addresses are put on events. Page events do carry the page's public content they refer to: the page name on `page_view`, and the link title and URL on `link_click`.

## How the client sends events

`src/analytics/tracker.ts` queues events, sends visitor events at once and app events in batches of 10 or every 4 seconds, and flushes with `sendBeacon` when the tab is hidden or closed. Unsent events stay in an outbox in `localStorage` and are retried; with `both`, a batch is kept until every transport has accepted it, and both sides dedupe on `id`. If the browser's storage is full, the local store drops its oldest events to make room. Identical events with the same dedupe key within two seconds are sent once; a reload counts as a new view.

Where they go is set at build time with Vite env variables (`src/analytics/transports.ts`):

| Variable | Values |
| --- | --- |
| `VITE_ANALYTICS_TRANSPORT` | `local` (default), `http`, or `both` |
| `VITE_ANALYTICS_ENDPOINT` | Collector URL for `http`/`both` |
| `VITE_ANALYTICS_WRITE_KEY` | Optional key sent in each batch body |

The HTTP transport POSTs `{ "sentAt": <ms>, "writeKey": <string|null>, "events": [ ... ] }` as `application/json`.

## The dashboard today

`/app/analytics` reads the events stored in this browser (`readEvents()`), adds generated sample events when "Include sample data" is on, and computes every number with the pure `aggregate()` function in `src/analytics/aggregate.ts`. Sample events are always labelled on screen. Because storage is per browser, a visit from another device does not appear in the demo.

## Moving to AWS (planned, not built)

A pipeline that keeps the same event shape:

1. **Collect**: API Gateway (HTTP API) `POST /v1/events` with a small Lambda that validates `v`, `name` and sizes, adds the server time and the IP-derived country, drops the raw IP, and puts records on a Kinesis Data Firehose stream. Set `VITE_ANALYTICS_TRANSPORT=http` and `VITE_ANALYTICS_ENDPOINT` to the route.
2. **Store**: Firehose delivers to S3 as Parquet or newline JSON, partitioned by `dt=YYYY-MM-DD`, with a Glue table over it.
3. **Query**: Athena runs the same grouping `aggregate()` does (views, unique `anonymousId`, link clicks, sources, devices) per `pageId` and date range, behind an authenticated `GET /v1/pages/{id}/analytics` route. Swap `readEvents()` in the dashboard for that call; the dashboard's data shape stays the same.
4. **Auth**: Cognito replaces the demo accounts in `src/lib/api.ts`, so the analytics route only answers the page's owner.
