import { Link } from 'react-router'
import { track } from '../../analytics'
import { DEMO_ACCOUNT } from '../../lib/defaults'
import { SITE_HOST } from '../../lib/types'
import { Wordmark } from '../../ui/controls'

/** Colophon block: the wordmark, one paragraph of what LinkUp is and where it stands, the real links. */
export function Footer() {
  return (
    <footer className="lfoot">
      <div className="container lfoot__grid">
        <Wordmark />
        <p className="lfoot__colophon">
          LinkUp makes one page at <span className="mono">{SITE_HOST}</span> for creators and small communities. It is at its demo stage: accounts, pages and
          analytics stay in this browser.
        </p>
        <nav className="lfoot__links" aria-label="Footer">
          <Link to="/signup" onClick={() => track('landing_cta_clicked', { cta: 'footer_make_page' })}>
            Make your page
          </Link>
          <Link to="/signin" onClick={() => track('landing_cta_clicked', { cta: 'footer_sign_in' })}>
            Sign in
          </Link>
          <Link to={`/${DEMO_ACCOUNT.handle}`} onClick={() => track('landing_cta_clicked', { cta: 'footer_demo_page' })}>
            The demo page
          </Link>
        </nav>
      </div>
    </footer>
  )
}
