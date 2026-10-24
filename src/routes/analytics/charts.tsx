/* Hand-rolled SVG charts for the dashboard. No chart library: each chart is drawn for its data. */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Bucket, SeriesPoint } from '../../analytics/aggregate'
import { Segmented } from '../../ui/controls'
import { formatClock, formatCompact, formatCount, formatDay, formatHour, formatPercent, formatWeekday, niceTicks } from './format'
import type { BarRow } from './format'

/** The width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Arrow keys, Home and End move a reading position across n points. */
function indexKeys(n: number, active: number | null, set: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (n === 0) return
    const current = active ?? n - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(n - 1, current + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, current - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') {
      set(null)
      return
    }
    if (next == null) return
    e.preventDefault()
    set(next)
  }
}

export type ChartView = 'chart' | 'table'

/** A titled panel whose chart can be read as a table instead. */
export function ChartPanel({
  title,
  note,
  view,
  onView,
  children,
  table,
  className,
  actions,
}: {
  title: string
  note?: ReactNode
  view: ChartView
  onView: (v: ChartView) => void
  children: ReactNode
  table: ReactNode
  className?: string
  actions?: ReactNode
}) {
  const id = useId()
  return (
    <section className={['an-panel surface', className].filter(Boolean).join(' ')} aria-labelledby={id}>
      <header className="an-panel__head">
        <div className="an-panel__titles">
          <h2 id={id}>{title}</h2>
          {note && <p className="an-panel__note">{note}</p>}
        </div>
        <div className="an-panel__actions">
          {actions}
          <Segmented
            size="sm"
            label={`${title}: show as`}
            value={view}
            onChange={onView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      </header>
      {view === 'chart' ? children : <div className="an-table-wrap" tabIndex={0}>{table}</div>}
    </section>
  )
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="an-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`an-legend__key ${i.className}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

function pointLabel(p: SeriesPoint, bucket: Bucket) {
  return bucket === 'hour' ? `${formatClock(p.start)} to ${formatClock(p.start + 3_600_000)}` : formatWeekday(p.start)
}

/** The signature: views and link clicks over the range, one axis, crosshair and tooltip. */
export function TrafficChart({ series, bucket, compact }: { series: SeriesPoint[]; bucket: Bucket; compact: boolean }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const descId = useId()
  const n = series.length
  const height = compact ? 210 : 280
  const m = { top: 12, right: 12, bottom: 30, left: 40 }
  const w = Math.max(0, width - m.left - m.right)
  const h = height - m.top - m.bottom
  const max = Math.max(1, ...series.map((p) => Math.max(p.views, p.clicks)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const x = (i: number) => m.left + (n <= 1 ? w / 2 : (i * w) / (n - 1))
  const y = (v: number) => m.top + h - (v / top) * h
  const line = (key: 'views' | 'clicks') => series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('')
  const area = n ? `${line('views')}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''

  const labelEvery = Math.max(1, Math.ceil(n / (compact ? 4 : 7)))
  const xLabels = series
    .map((p, i) => ({ i, text: bucket === 'hour' ? formatClock(p.start) : formatDay(p.start) }))
    .filter(({ i }) => (n - 1 - i) % labelEvery === 0)

  function onPointer(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  const point = active != null ? series[active] : null
  const tipLeft = active != null ? x(active) : 0
  const flip = tipLeft > width / 2

  return (
    <div className="an-chart" ref={wrapRef}>
      <div
        className="an-chart__focus"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Views and link clicks by ${bucket === 'hour' ? 'hour' : 'day'}. Use the arrow keys to read each ${bucket === 'hour' ? 'hour' : 'day'}.`}
        aria-describedby={descId}
        onKeyDown={indexKeys(n, active, setActive)}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="an-svg">
            {ticks.map((t) => (
              <g key={t}>
                <line className="an-gridline" x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} />
                <text className="an-axis" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {xLabels.map(({ i, text }) => (
              <text key={i} className="an-axis" x={x(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}>
                {text}
              </text>
            ))}
            <path className="an-area" d={area} />
            <path className="an-line an-line--views" d={line('views')} />
            <path className="an-line an-line--clicks" d={line('clicks')} />
            {point && active != null && (
              <g>
                <line className="an-crosshair" x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + h} />
                <circle className="an-dot an-dot--views" cx={x(active)} cy={y(point.views)} r={4} />
                <circle className="an-dot an-dot--clicks" cx={x(active)} cy={y(point.clicks)} r={4} />
              </g>
            )}
            <rect
              className="an-hit"
              x={m.left}
              y={m.top}
              width={w}
              height={h}
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}
        {point && (
          <div className={flip ? 'an-tip an-tip--flip' : 'an-tip'} style={{ left: tipLeft }} aria-hidden="true">
            <p className="an-tip__when">{pointLabel(point, bucket)}</p>
            <p className="an-tip__row">
              <span className="an-tip__key an-tip__key--views" />
              <strong className="num">{formatCount(point.views)}</strong> views
            </p>
            <p className="an-tip__row">
              <span className="an-tip__key an-tip__key--clicks" />
              <strong className="num">{formatCount(point.clicks)}</strong> link clicks
            </p>
            <p className="an-tip__row an-tip__row--quiet">
              {formatCount(point.visitors)} visitors{point.views ? `, ${formatPercent(point.clicks / point.views)} click rate` : ''}
            </p>
          </div>
        )}
      </div>
      <p id={descId} className="visually-hidden" aria-live="polite">
        {point ? `${pointLabel(point, bucket)}: ${formatCount(point.views)} views, ${formatCount(point.clicks)} link clicks, ${formatCount(point.visitors)} visitors.` : ''}
      </p>
    </div>
  )
}

export function TrafficTable({ series, bucket }: { series: SeriesPoint[]; bucket: Bucket }) {
  return (
    <table className="an-table">
      <thead>
        <tr>
          <th scope="col">{bucket === 'hour' ? 'Hour' : 'Day'}</th>
          <th scope="col" className="num-col">Views</th>
          <th scope="col" className="num-col">Visitors</th>
          <th scope="col" className="num-col">Link clicks</th>
          <th scope="col" className="num-col">Click rate</th>
        </tr>
      </thead>
      <tbody>
        {series
          .slice()
          .reverse()
          .map((p) => (
            <tr key={p.key}>
              <th scope="row">{bucket === 'hour' ? <span className="mono">{formatClock(p.start)}</span> : formatWeekday(p.start)}</th>
              <td className="num-col num">{formatCount(p.views)}</td>
              <td className="num-col num">{formatCount(p.visitors)}</td>
              <td className="num-col num">{formatCount(p.clicks)}</td>
              <td className="num-col num">{p.views ? formatPercent(p.clicks / p.views) : 'None'}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

/** Page views by hour of day: 24 columns from one baseline. */
export function HoursChart({ hours }: { hours: number[] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const descId = useId()
  const height = 168
  const m = { top: 10, right: 4, bottom: 26, left: 32 }
  const w = Math.max(0, width - m.left - m.right)
  const h = height - m.top - m.bottom
  const max = Math.max(1, ...hours)
  const ticks = niceTicks(max, 2)
  const top = ticks[ticks.length - 1]
  const slot = w / 24
  const bar = Math.max(2, Math.min(24, slot - 3))
  const y = (v: number) => m.top + h - (v / top) * h
  const total = hours.reduce((s, v) => s + v, 0)
  const value = active != null ? hours[active] : 0
  const r = Math.min(2, bar / 2)

  return (
    <div className="an-chart" ref={wrapRef}>
      <div
        className="an-chart__focus"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label="Page views by hour of day. Use the arrow keys to read each hour."
        aria-describedby={descId}
        onKeyDown={indexKeys(24, active, setActive)}
        onFocus={() => setActive((a) => a ?? hours.indexOf(max))}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="an-svg">
            {ticks.map((t) => (
              <g key={t}>
                <line className="an-gridline" x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} />
                <text className="an-axis" x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {hours.map((v, i) => {
              const bx = m.left + i * slot + (slot - bar) / 2
              const by = y(v)
              const bh = m.top + h - by
              return (
                <g key={i}>
                  {bh > 0 && (
                    <path
                      className={active === i ? 'an-bar is-active' : 'an-bar'}
                      d={`M${bx},${m.top + h}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bar - r}Q${bx + bar},${by} ${bx + bar},${by + r}V${m.top + h}Z`}
                    />
                  )}
                  <rect className="an-hit" x={m.left + i * slot} y={m.top} width={slot} height={h} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
                </g>
              )
            })}
            {[0, 6, 12, 18, 23].map((hr) => (
              <text key={hr} className="an-axis" x={m.left + hr * slot + slot / 2} y={height - 8} textAnchor={hr === 23 ? 'end' : hr === 0 ? 'start' : 'middle'}>
                {formatHour(hr)}
              </text>
            ))}
          </svg>
        )}
        {active != null && (
          <div className={m.left + active * slot > width / 2 ? 'an-tip an-tip--flip' : 'an-tip'} style={{ left: m.left + active * slot + slot / 2 }} aria-hidden="true">
            <p className="an-tip__when mono">
              {formatHour(active)} to {formatHour((active + 1) % 24)}
            </p>
            <p className="an-tip__row">
              <strong className="num">{formatCount(value)}</strong> views
            </p>
            <p className="an-tip__row an-tip__row--quiet">{total ? formatPercent(value / total) : '0%'} of the day</p>
          </div>
        )}
      </div>
      <p id={descId} className="visually-hidden" aria-live="polite">
        {active != null ? `${formatHour(active)}: ${formatCount(value)} views.` : ''}
      </p>
    </div>
  )
}

export function HoursTable({ hours }: { hours: number[] }) {
  const total = hours.reduce((s, v) => s + v, 0)
  return (
    <table className="an-table">
      <thead>
        <tr>
          <th scope="col">Hour</th>
          <th scope="col" className="num-col">Views</th>
          <th scope="col" className="num-col">Share</th>
        </tr>
      </thead>
      <tbody>
        {hours.map((v, i) => (
          <tr key={i}>
            <th scope="row" className="mono">
              {formatHour(i)}
            </th>
            <td className="num-col num">{formatCount(v)}</td>
            <td className="num-col num">{total ? formatPercent(v / total) : '0%'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}


/** Horizontal bars from one baseline, the count and share written beside each. */
export function BarList({ rows, max = 7, empty }: { rows: BarRow[]; max?: number; empty: string }) {
  if (rows.length === 0) return <p className="an-none">{empty}</p>
  const shown = rows.slice(0, max)
  const rest = rows.slice(max)
  const restRow: BarRow | null = rest.length
    ? { key: '__other', label: `Other (${rest.length})`, count: rest.reduce((s, r) => s + r.count, 0), share: rest.reduce((s, r) => s + r.share, 0) }
    : null
  const top = Math.max(...shown.map((r) => r.share), restRow?.share ?? 0) || 1
  return (
    <ul className="an-bars">
      {[...shown, ...(restRow ? [restRow] : [])].map((r) => (
        <li key={r.key} className="an-bars__row">
          <span className="an-bars__label">{r.label}</span>
          <span className="an-bars__value num">
            {formatCount(r.count)} <span className="an-bars__share">{formatPercent(r.share, 0)}</span>
          </span>
          <span className="an-bars__track" aria-hidden="true">
            <span className="an-bars__fill" style={{ width: `${(r.share / top) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function BarTable({ rows, head, empty }: { rows: BarRow[]; head: string; empty: string }) {
  if (rows.length === 0) return <p className="an-none">{empty}</p>
  return (
    <table className="an-table">
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className="num-col">Count</th>
          <th scope="col" className="num-col">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{r.label}</th>
            <td className="num-col num">{formatCount(r.count)}</td>
            <td className="num-col num">{formatPercent(r.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
