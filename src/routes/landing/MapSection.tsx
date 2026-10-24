import { DEMO_ACCOUNT, demoContent } from '../../lib/defaults'
import { SITE_HOST } from '../../lib/types'
import { Icon, type IconName } from '../../ui/Icon'

const SOURCES: { icon: IconName; label: string }[] = [
  { icon: 'instagram', label: 'Instagram bio' },
  { icon: 'whatsapp', label: 'WhatsApp' },
  { icon: 'linkedin', label: 'LinkedIn' },
  { icon: 'youtube', label: 'YouTube' },
]

/** Connectors between two columns of the map: from n evenly spaced nodes to m evenly spaced nodes. */
function Edges({ from, to }: { from: number; to: number }) {
  const ys = (n: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 100)
  const a = ys(from)
  const b = ys(to)
  const pairs =
    from >= to
      ? a.map((y, i) => [y, b[Math.min(Math.floor((i * to) / from), to - 1)]])
      : b.map((y, i) => [a[Math.min(Math.floor((i * from) / to), from - 1)], y])
  return (
    <svg className="map__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {pairs.map(([y1, y2], i) => (
        <path key={i} d={`M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/** Map / Diagram: one visit traced from a bio, through the page, to the tap that gets counted. */
export function MapSection() {
  const links = demoContent().links.filter((l) => l.visible)
  return (
    <section className="map" aria-labelledby="map-title">
      <div className="container">
        <div className="split-head">
          <h2 id="map-title">From your bio to the tap.</h2>
          <p className="lead">LinkUp notes where each visit came from, and what was tapped.</p>
        </div>

        <ol className="map__diagram" aria-label="How a visit reaches your page and gets counted">
          <li className="map__col">
            <ul className="map__nodes">
              {SOURCES.map((s) => (
                <li key={s.label} className="map__node map__node--source">
                  <Icon name={s.icon} size={20} />
                  {s.label}
                </li>
              ))}
            </ul>
            <p className="map__legend">Where they find you</p>
          </li>
          <li className="map__gap" aria-hidden="true">
            <Edges from={SOURCES.length} to={1} />
          </li>
          <li className="map__col">
            <div className="map__nodes">
              <div className="map__node map__node--page plastic">
                <span className="mono map__host">{SITE_HOST}/</span>
                <span className="mono map__handle">{DEMO_ACCOUNT.handle}</span>
              </div>
            </div>
            <p className="map__legend">Your page</p>
          </li>
          <li className="map__gap" aria-hidden="true">
            <Edges from={1} to={links.length} />
          </li>
          <li className="map__col">
            <ul className="map__nodes">
              {links.map((l) => (
                <li key={l.id} className="map__node map__node--link">
                  {l.title}
                </li>
              ))}
            </ul>
            <p className="map__legend">Your links</p>
          </li>
          <li className="map__gap" aria-hidden="true">
            <Edges from={links.length} to={1} />
          </li>
          <li className="map__col">
            <div className="map__nodes">
              <dl className="map__node map__node--record rx">
                <div>
                  <dt>Source</dt>
                  <dd className="mono">instagram</dd>
                </div>
                <div>
                  <dt>Tapped</dt>
                  <dd className="mono">{links[0]?.title}</dd>
                </div>
                <div>
                  <dt>Device</dt>
                  <dd className="mono">mobile</dd>
                </div>
              </dl>
            </div>
            <p className="map__legend">What gets counted</p>
          </li>
        </ol>
      </div>
    </section>
  )
}
