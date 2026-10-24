import { track } from '../../analytics'
import { SITE_HOST } from '../../lib/types'
import { ButtonLink } from '../../ui/controls'

const PLACES = [
  { where: 'Instagram bio', source: 'instagram' },
  { where: 'WhatsApp about', source: 'whatsapp' },
  { where: 'LinkedIn profile', source: 'linkedin' },
]

/** The close: the address set as pharmacy labels, one per place it is pasted, and the action again. */
export function Close() {
  return (
    <section className="close" aria-labelledby="close-title">
      <div className="container close__grid">
        <div className="close__text">
          <h2 id="close-title">Paste it where people look.</h2>
          <p className="lead">
            Tag each copy with <span className="mono">?utm_source=</span> and every source shows up by name.
          </p>
          <div className="close__actions">
            <ButtonLink to="/signup" variant="primary" onClick={() => track('landing_cta_clicked', { cta: 'close_make_page' })}>
              Make your page
            </ButtonLink>
            <ButtonLink to="/signin" variant="secondary" onClick={() => track('landing_cta_clicked', { cta: 'close_demo_sign_in' })}>
              Try the demo account
            </ButtonLink>
          </div>
        </div>
        <ul className="close__labels plastic" aria-label="Your address, tagged for each place you paste it">
          {PLACES.map((p) => (
            <li key={p.source} className="rx close__label">
              <span className="close__where">{p.where}</span>
              <span className="mono close__addr">
                {SITE_HOST}/your-name
                <wbr />
                ?utm_source={p.source}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
