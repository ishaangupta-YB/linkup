import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { clearEvents, pendingEvents, readEvents, subscribeEvents, track, transportName, type AnalyticsEvent } from '../../analytics'
import { aggregate, describeChange, isRangeKey, linkIdOf, rangeBounds, socialIdOf, type Aggregate, type RangeBounds, type RangeKey } from '../../analytics/aggregate'
import { generateSampleEvents } from '../../analytics/demo'
import { exportEvents, exportFileName } from '../../analytics/export'
import { useMyPage } from '../../lib/page'
import { SOCIALS, type Page, type SocialId } from '../../lib/types'
import { pageAddress } from '../../lib/url'
import { Button, Segmented, Skeleton, Toggle } from '../../ui/controls'
import { Icon, type IconName } from '../../ui/Icon'
import { useMediaQuery, useTitle } from '../../ui/hooks'
import { useToast } from '../../ui/Toast'
import { BarList, BarTable, ChartPanel, HoursChart, HoursTable, Legend, TrafficChart, TrafficTable, type ChartView } from './charts'
import { formatClock, formatCount, formatDay, formatPercent, toRows } from './format'
import './analytics.css'

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

const DEVICE_LABELS: Record<string, string> = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' }
const SOCIAL_ICONS: Record<SocialId, IconName> = { instagram: 'instagram', linkedin: 'linkedin', youtube: 'youtube', whatsapp: 'whatsapp', x: 'x', website: 'globe' }
const EVENT_LABELS: Record<string, string> = { page_view: 'Page view', link_click: 'Link click', social_click: 'Social icon', share_click: 'Share' }

/** Re-reads the stored events whenever they change, in this tab or another. */
function useEventStore() {
  const [tick, setTick] = useState(() => ({ now: Date.now() }))
  useEffect(() => subscribeEvents(() => setTick({ now: Date.now() })), [])
  // The clock moves on with every change and once a minute, so a new event is always inside the range.
  useEffect(() => {
    const t = setInterval(() => setTick({ now: Date.now() }), 60_000)
    return () => clearInterval(t)
  }, [])
  const read = useMemo(() => {
    void tick
    try {
      return { events: readEvents(), error: null as string | null }
    } catch (e) {
      return { events: [] as AnalyticsEvent[], error: e instanceof Error ? e.message : 'The stored events could not be read.' }
    }
  }, [tick])
  return { ...read, now: tick.now }
}

function useUrlState() {
  const [params, setParams] = useSearchParams()
  const rawRange = params.get('range')
  const range: RangeKey = isRangeKey(rawRange) ? rawRange : '30d'
  const sample = params.get('sample') !== 'off'
  const set = useCallback(
    (patch: { range?: RangeKey; sample?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (patch.range) {
            if (patch.range === '30d') next.delete('range')
            else next.set('range', patch.range)
          }
          if (patch.sample != null) {
            if (patch.sample) next.delete('sample')
            else next.set('sample', 'off')
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { range, sample, set }
}

export default function AnalyticsPage() {
  useTitle('Analytics - LinkUp')
  const my = useMyPage()
  if (my.status === 'loading' || !my.page) return <LoadingState />
  return <Dashboard page={my.page} />
}

function Dashboard({ page }: { page: Page }) {
  const toast = useToast()
  const { range, sample, set } = useUrlState()
  const store = useEventStore()
  const [retry, setRetry] = useState(0)
  const compact = useMediaQuery('(max-width: 40rem)')
  // Live links keep getting clicks after they leave the draft, so the rows cover both.
  const links = useMemo(() => {
    const draftIds = new Set(page.draft.links.map((l) => l.id))
    const liveOnly = (page.published?.links ?? []).filter((l) => !draftIds.has(l.id))
    return [...page.draft.links, ...liveOnly]
  }, [page.draft.links, page.published])
  const handle = page.handle
  const pageId = page.id

  // One view per visit to the dashboard.
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    track('dashboard_viewed', { range, sample }, { pageId, handle, dedupeKey: `dashboard_viewed:${pageId}` })
  }, [range, sample, pageId, handle])

  const bounds = useMemo(() => rangeBounds(range, store.now), [range, store.now])

  const computed = useMemo(() => {
    void retry
    try {
      const real = store.events.filter((e) => e.stream === 'page' && e.pageId === pageId && !e.sample)
      const generated = sample
        ? generateSampleEvents({ pageId, handle, links, socials: page.draft.socials, now: store.now, days: 180, seed: 7 })
        : []
      const all = generated.length ? mergeByTime(generated, real) : real
      const result = aggregate(all, { pageId, from: bounds.from, to: bounds.to, prevFrom: bounds.prevFrom, prevTo: bounds.prevTo, links, bucket: bounds.bucket })
      const inRange = all.filter((e) => e.ts >= bounds.from && e.ts < bounds.to)
      const realInRange = real.filter((e) => e.ts >= bounds.from && e.ts < bounds.to).length
      return { ok: true as const, result, real, inRange, realInRange }
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : 'Something went wrong while counting.' }
    }
  }, [store.events, store.now, sample, pageId, handle, links, page.draft.socials, bounds, retry])

  function changeRange(next: RangeKey) {
    if (next === range) return
    track('dashboard_range_changed', { from: range, to: next }, { pageId, handle })
    set({ range: next })
  }

  function onExport(format: 'csv' | 'json') {
    if (!computed.ok) return
    const events = computed.inRange
    exportEvents(events, format, exportFileName(handle, range, format, store.now))
    track('events_exported', { format, count: events.length, range, sample }, { pageId, handle })
    toast({ message: `Exported ${formatCount(events.length)} events as ${format.toUpperCase()}.` })
  }

  const error = store.error ?? (computed.ok ? null : computed.message)
  const noRealEver = computed.ok && computed.real.length === 0

  return (
    <div className="an">
      <header className="an-head">
        <div className="an-head__titles">
          <h1>Analytics</h1>
          <p className="an-head__sub">
            Visits to <span className="mono">{pageAddress(handle)}</span>
          </p>
        </div>
        <div className="an-controls" role="group" aria-label="Dashboard filters">
          <Segmented label="Date range" value={range} onChange={changeRange} options={RANGE_OPTIONS} />
          <Toggle label="Include sample data" showLabel checked={sample} onChange={(v) => set({ sample: v })} />
          <ExportMenu disabled={!computed.ok || computed.inRange.length === 0} onExport={onExport} />
        </div>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />
      ) : !computed.ok ? null : !sample && noRealEver ? (
        <EmptyState page={page} onShowSample={() => set({ sample: true })} />
      ) : (
        <>
          {sample && (
            <p className="an-banner" role="note">
              <Icon name="alert" size={18} />
              <span>
                These numbers include generated sample data, so the page does not start empty.{' '}
                {computed.realInRange === 0
                  ? 'None of the events in this range are real yet.'
                  : `${formatCount(computed.realInRange)} of the ${formatCount(computed.inRange.length)} events in this range are real visits recorded in this browser.`}{' '}
                Turn off sample data to see only real ones.
              </span>
            </p>
          )}
          <DashboardBody result={computed.result} bounds={bounds} compact={compact} links={links} />
          <div className="an-grid">
            <RecentActivity events={computed.real} links={links} now={store.now} />
            <PipelinePanel total={store.events.length} />
          </div>
        </>
      )}
    </div>
  )
}

function mergeByTime(a: AnalyticsEvent[], b: AnalyticsEvent[]) {
  if (b.length === 0) return a
  return a.concat(b).sort((x, y) => x.ts - y.ts)
}

function StatRow({ result, bounds }: { result: Aggregate; bounds: RangeBounds }) {
  const t = result.totals
  const p = result.previous
  const stats = [
    { label: 'Views', value: formatCount(t.views), change: changeOf(t.views, p.views, bounds) },
    { label: 'Unique visitors', value: formatCount(t.visitors), change: changeOf(t.visitors, p.visitors, bounds) },
    { label: 'Link clicks', value: formatCount(t.clicks), change: changeOf(t.clicks, p.clicks, bounds) },
    { label: 'Click rate', value: t.views ? formatPercent(t.ctr) : 'None', change: changeOf(t.ctr, p.ctr, bounds, 'rate', p.views) },
  ]
  return (
    <section className="an-stats plastic" aria-label="Totals">
      {stats.map((s) => (
        <div key={s.label} className="an-stat">
          <p className="an-stat__label">{s.label}</p>
          <p className="an-stat__value">{s.value}</p>
          <p className={s.change.direction === 'up' ? 'an-stat__change is-up' : 'an-stat__change'}>{s.change.text}</p>
        </div>
      ))}
    </section>
  )
}


function changeOf(current: number, previous: number, bounds: RangeBounds, kind: 'count' | 'rate' = 'count', previousViews = 1) {
  // A click rate needs views to be a rate at all.
  if (kind === 'rate' && previousViews === 0) return { text: `No views in ${bounds.previousLabel}`, direction: 'none' as const }
  return describeChange(current, previous, bounds.previousLabel, kind)
}

function useView() {
  return useState<ChartView>('chart')
}

function DashboardBody({ result, bounds, compact, links }: { result: Aggregate; bounds: RangeBounds; compact: boolean; links: Page['draft']['links'] }) {
  const [trafficView, setTrafficView] = useView()
  const [sourcesView, setSourcesView] = useView()
  const [devicesView, setDevicesView] = useView()
  const [countriesView, setCountriesView] = useView()
  const [browsersView, setBrowsersView] = useView()
  const [hoursView, setHoursView] = useView()
  const [socialsView, setSocialsView] = useView()
  const socialLabel = (id: string) => {
    const s = SOCIALS.find((x) => x.id === id)
    return (
      <span className="an-social">
        {s && <Icon name={SOCIAL_ICONS[s.id]} size={16} />}
        {s?.label ?? id}
      </span>
    )
  }
  const rangeNote = bounds.bucket === 'hour' ? 'Today by the hour, to now' : `${formatDay(bounds.from)} to ${formatDay(bounds.to - 1)}, by day; today counts up to now`

  return (
    <>
      <StatRow result={result} bounds={bounds} />

      <ChartPanel
        title="Traffic"
        note={rangeNote}
        view={trafficView}
        onView={setTrafficView}
        className="an-panel--traffic"
        actions={
          <Legend
            items={[
              { label: 'Views', className: 'an-legend__key--views' },
              { label: 'Link clicks', className: 'an-legend__key--clicks' },
            ]}
          />
        }
        table={<TrafficTable series={result.series} bucket={bounds.bucket} />}
      >
        <TrafficChart series={result.series} bucket={bounds.bucket} compact={compact} />
      </ChartPanel>

      <LinkTable result={result} links={links} />

      <div className="an-grid">
        <ChartPanel title="Sources" note="Where each visit came from" view={sourcesView} onView={setSourcesView} table={<BarTable rows={toRows(result.sources)} head="Source" empty="No visits in this range." />}>
          <BarList rows={toRows(result.sources)} empty="No visits in this range." />
        </ChartPanel>
        <ChartPanel title="Browsers" note="In-app means opened inside that app" view={browsersView} onView={setBrowsersView} table={<BarTable rows={toRows(result.browsers)} head="Browser" empty="No visits in this range." />}>
          <BarList rows={toRows(result.browsers)} empty="No visits in this range." />
        </ChartPanel>
        <ChartPanel title="Countries" note="Guessed from the visitor's time zone" view={countriesView} onView={setCountriesView} table={<BarTable rows={toRows(result.countries)} head="Country, from time zone" empty="No visits in this range." />}>
          <BarList rows={toRows(result.countries)} empty="No visits in this range." />
        </ChartPanel>
        <ChartPanel title="Devices" note="Share of page views" view={devicesView} onView={setDevicesView} table={<BarTable rows={toRows(result.devices, (k) => DEVICE_LABELS[k] ?? k)} head="Device" empty="No visits in this range." />}>
          <BarList rows={toRows(result.devices, (k) => DEVICE_LABELS[k] ?? k)} empty="No visits in this range." />
        </ChartPanel>
        <ChartPanel title="Hours of day" note="Page views by your local time" view={hoursView} onView={setHoursView} table={<HoursTable hours={result.hours} />}>
          <HoursChart hours={result.hours} />
        </ChartPanel>
        <ChartPanel title="Social icons" note={`${formatCount(result.totals.socialClicks)} taps on your social icons, ${formatCount(result.totals.shares)} shares`} view={socialsView} onView={setSocialsView} table={<BarTable rows={toRows(result.socials, socialLabel)} head="Icon" empty="No taps on social icons in this range." />}>
          <BarList rows={toRows(result.socials, socialLabel)} empty="No taps on social icons in this range." />
        </ChartPanel>
      </div>
    </>
  )
}

function LinkTable({ result, links }: { result: Aggregate; links: Page['draft']['links'] }) {
  const id = useId()
  const max = Math.max(...result.links.map((l) => l.share), result.removed?.share ?? 0) || 1
  return (
    <section className="an-panel surface" aria-labelledby={id}>
      <header className="an-panel__head">
        <div className="an-panel__titles">
          <h2 id={id}>Link performance</h2>
          <p className="an-panel__note">In the order your links appear in the editor</p>
        </div>
      </header>
      {links.length === 0 ? (
        <p className="an-none">Your page has no links yet. Add one in the editor and its clicks show up here.</p>
      ) : (
        <div className="an-table-wrap" tabIndex={0}>
          <table className="an-table an-table--links">
            <thead>
              <tr>
                <th scope="col">Link</th>
                <th scope="col" className="num-col">Clicks</th>
                <th scope="col" className="num-col">Click rate</th>
                <th scope="col" className="an-share-col">Share of clicks</th>
              </tr>
            </thead>
            <tbody>
              {result.links.map((l) => (
                <tr key={l.id}>
                  <th scope="row">
                    <span className="an-link-title">{l.title || 'Untitled link'}</span>
                    {!l.visible && <span className="an-link-flag">Hidden</span>}
                  </th>
                  <td className="num-col num">{formatCount(l.clicks)}</td>
                  <td className="num-col num">{result.totals.views ? formatPercent(l.ctr) : 'None'}</td>
                  <td className="an-share-col">
                    <ShareBar share={l.share} max={max} />
                  </td>
                </tr>
              ))}
              {result.removed && (
                <tr className="an-row-removed">
                  <th scope="row">
                    <span className="an-link-title">Removed links ({result.removed.links})</span>
                  </th>
                  <td className="num-col num">{formatCount(result.removed.clicks)}</td>
                  <td className="num-col num">{formatPercent(result.removed.ctr)}</td>
                  <td className="an-share-col">
                    <ShareBar share={result.removed.share} max={max} quiet />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ShareBar({ share, max, quiet }: { share: number; max: number; quiet?: boolean }) {
  return (
    <span className="an-sharebar">
      <span className="an-bars__track" aria-hidden="true">
        <span className={quiet ? 'an-bars__fill an-bars__fill--quiet' : 'an-bars__fill'} style={{ width: `${(share / max) * 100}%` }} />
      </span>
      <span className="num an-sharebar__pct">{formatPercent(share, 0)}</span>
    </span>
  )
}

function RecentActivity({ events, links, now }: { events: AnalyticsEvent[]; links: Page['draft']['links']; now: number }) {
  const id = useId()
  const recent = events.slice(-20).reverse()
  const today = new Date(now).toDateString()
  const detail = (e: AnalyticsEvent) => {
    if (e.name === 'link_click') {
      const lid = linkIdOf(e.props)
      const link = links.find((l) => l.id === lid)
      return link ? link.title : typeof e.props.title === 'string' ? `${e.props.title} (removed)` : 'A removed link'
    }
    if (e.name === 'social_click') {
      const sid = socialIdOf(e.props)
      return SOCIALS.find((s) => s.id === sid)?.label ?? sid ?? 'Social icon'
    }
    if (e.name === 'share_click') return 'Shared the page'
    return `${e.context?.source ?? 'Direct'}, ${DEVICE_LABELS[e.context?.device] ?? e.context?.device ?? 'unknown device'}`
  }
  return (
    <section className="an-panel surface" aria-labelledby={id}>
      <header className="an-panel__head">
        <div className="an-panel__titles">
          <h2 id={id}>Recent activity</h2>
          <p className="an-panel__note">The last 20 real events on your page, newest first. Sample data is never listed here.</p>
        </div>
      </header>
      {recent.length === 0 ? (
        <p className="an-none">No real visits recorded in this browser yet. Open your page in another tab and tap a link; it shows up here at once.</p>
      ) : (
        <div className="an-table-wrap an-table-wrap--log" tabIndex={0}>
          <table className="an-table an-table--log">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Link or source</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id}>
                  <td className="mono an-log-time">
                    {new Date(e.ts).toDateString() === today ? formatClock(e.ts) : `${formatDay(e.ts)} ${formatClock(e.ts)}`}
                  </td>
                  <td>{EVENT_LABELS[e.name] ?? e.name}</td>
                  <td className="an-log-detail">{detail(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function subscribePending(cb: () => void) {
  const t = setInterval(cb, 2_000)
  const off = subscribeEvents(cb)
  return () => {
    clearInterval(t)
    off()
  }
}

function PipelinePanel({ total }: { total: number }) {
  const id = useId()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const pending = useSyncExternalStore(subscribePending, pendingEvents, () => 0)
  const transport = transportName()
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  return (
    <section className="an-panel surface" aria-labelledby={id}>
      <header className="an-panel__head">
        <div className="an-panel__titles">
          <h2 id={id}>Data pipeline</h2>
          <p className="an-panel__note">Real collection moves to AWS later.{transport === 'local' ? ' For now, events are stored only in this browser.' : ''}</p>
        </div>
      </header>
      <dl className="an-dl">
        <div>
          <dt>Transport</dt>
          <dd className="mono">{transport}</dd>
        </div>
        <div>
          <dt>Events stored in this browser</dt>
          <dd className="mono">{formatCount(total)}</dd>
        </div>
        <div>
          <dt>Waiting to send</dt>
          <dd className="mono">{pending === 0 ? 'None' : formatCount(pending)}</dd>
        </div>
      </dl>
      {confirming ? (
        <div className="an-confirm" role="group" aria-label="Confirm clearing events">
          <p>
            This deletes all {formatCount(total)} events stored in this browser, app events included. It cannot be undone; export them first if you need them.
          </p>
          <div className="an-confirm__actions">
            <Button
              ref={confirmRef}
              variant="danger"
              size="sm"
              icon="trash"
              onClick={() => {
                clearEvents()
                setConfirming(false)
                toast({ message: 'Recorded events cleared.' })
              }}
            >
              Delete {formatCount(total)} events
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon="trash" disabled={total === 0} onClick={() => setConfirming(true)}>
          Clear recorded events
        </Button>
      )}
    </section>
  )
}

function ExportMenu({ disabled, onExport }: { disabled: boolean; onExport: (f: 'csv' | 'json') => void }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onMenuKey(e: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  const choose = (f: 'csv' | 'json') => {
    onExport(f)
    close()
  }

  return (
    <div className="an-menu" ref={wrapRef}>
      <Button
        ref={buttonRef}
        size="sm"
        icon="download"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        title={disabled ? 'There are no events in this range to export' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Export
      </Button>
      {open && (
        <div className="an-menu__list surface" role="menu" id={menuId} aria-label="Export events in this range" onKeyDown={onMenuKey}>
          <button type="button" role="menuitem" className="an-menu__item" ref={(el) => void (itemRefs.current[0] = el)} onClick={() => choose('csv')}>
            <span>CSV</span>
            <span className="an-menu__hint">For a spreadsheet</span>
          </button>
          <button type="button" role="menuitem" className="an-menu__item" ref={(el) => void (itemRefs.current[1] = el)} onClick={() => choose('json')}>
            <span>JSON</span>
            <span className="an-menu__hint">The raw event records</span>
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ page, onShowSample }: { page: Page; onShowSample: () => void }) {
  const toast = useToast()
  const address = pageAddress(page.handle)
  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${address}`)
      toast({ message: 'Page address copied.' })
      track('address_copied', { where: 'analytics_empty' }, { pageId: page.id, handle: page.handle })
    } catch {
      toast({ message: `Copy failed. Your address is ${address}.` })
    }
  }
  return (
    <section className="an-empty surface" aria-labelledby="an-empty-title">
      <h2 id="an-empty-title">No visits yet</h2>
      <p>
        Visits, link clicks and where people came from appear here as soon as someone opens your page. Put your address where your audience already looks: your Instagram bio, a WhatsApp status, your LinkedIn profile.
      </p>
      {!page.published && <p className="an-empty__warn">Your page is not published yet. Publish it from the top bar first, or visitors see nothing.</p>}
      <div className="an-empty__address">
        <span className="mono">{address}</span>
        <Button variant="primary" size="sm" icon="copy" onClick={copy}>
          Copy address
        </Button>
      </div>
      <Button variant="quiet" size="sm" onClick={onShowSample}>
        Show sample data instead
      </Button>
    </section>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="an-empty surface" role="alert">
      <h2>The numbers did not load</h2>
      <p>{message} Your recorded events are untouched. Try again, or reload the page.</p>
      <Button variant="primary" size="sm" icon="refresh" onClick={onRetry}>
        Try again
      </Button>
    </section>
  )
}

function LoadingState() {
  return (
    <div className="an" aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading analytics
      </span>
      <header className="an-head">
        <div className="an-head__titles">
          <Skeleton style={{ width: 160, height: 28 }} />
          <Skeleton style={{ width: 220, height: 16 }} />
        </div>
        <Skeleton style={{ width: 320, maxWidth: '100%', height: 44 }} />
      </header>
      <div className="an-stats an-stats--loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="an-stat">
            <Skeleton style={{ width: 90, height: 14 }} />
            <Skeleton style={{ width: 110, height: 30 }} />
            <Skeleton style={{ width: 150, height: 14 }} />
          </div>
        ))}
      </div>
      <div className="an-panel surface">
        <Skeleton style={{ width: 120, height: 20 }} />
        <Skeleton style={{ width: '100%', height: 240 }} />
      </div>
      <div className="an-grid">
        <div className="an-panel surface">
          <Skeleton style={{ width: '100%', height: 160 }} />
        </div>
        <div className="an-panel surface">
          <Skeleton style={{ width: '100%', height: 160 }} />
        </div>
      </div>
    </div>
  )
}
