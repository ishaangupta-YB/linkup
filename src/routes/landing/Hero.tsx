import { useMemo, type CSSProperties } from 'react'
import { track } from '../../analytics'
import { DEMO_ACCOUNT, demoContent } from '../../lib/defaults'
import { LIMITS, SITE_HOST } from '../../lib/types'
import { ButtonLink } from '../../ui/controls'
import { Phone } from './Phone'

const TINTS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export function Hero() {
  const content = useMemo(() => demoContent(), [])
  const shown = content.links.filter((l) => l.visible).length
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__light" aria-hidden="true">
        <span /> <span /> <span /> <span />
      </div>
      <div className="container hero__grid">
        <div className="hero__text">
          <h1 id="hero-title">See which link they tapped.</h1>
          <p className="lead hero__line">
            Put <span className="mono">{SITE_HOST}/your-name</span> in your bio and see what people tap.
          </p>
          <div className="hero__actions">
            <ButtonLink to="/signup" variant="primary" onClick={() => track('landing_cta_clicked', { cta: 'hero_make_page' })}>
              Make your page
            </ButtonLink>
            <ButtonLink to={`/${DEMO_ACCOUNT.handle}`} variant="secondary" onClick={() => track('landing_cta_clicked', { cta: 'hero_demo_page' })}>
              See the demo page
            </ButtonLink>
          </div>
        </div>

        <div className="hero__stage">
          <div className="hero__tray" aria-hidden="true">
            {TINTS.map((t) => (
              <span key={t} className="plastic hero__cell" style={{ '--t': `var(--p-${t})` } as CSSProperties} />
            ))}
          </div>
          <figure className="hero__device">
            <Phone
              className="hero__phone"
              content={content}
              handle={DEMO_ACCOUNT.handle}
              label={`The page at ${SITE_HOST}/${DEMO_ACCOUNT.handle}, scrollable`}
            />
            <figcaption className="rx hero__label">
              <p className="rx__head mono">{SITE_HOST}/</p>
              <p className="rx__name mono">{DEMO_ACCOUNT.handle}</p>
              <p className="rx__meta mono">
                {shown} links, room for {LIMITS.links}
              </p>
              <p className="rx__stamp mono">Published</p>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
