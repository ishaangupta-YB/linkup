import { Link } from 'react-router'
import { track } from '../../analytics'
import { DEMO_ACCOUNT } from '../../lib/defaults'
import { SITE_HOST } from '../../lib/types'
import { Wordmark } from '../../ui/controls'
import { Icon } from '../../ui/Icon'

const BUILDER_URL = 'https://www.linkedin.com/in/ishaangupta1201'

/** Colophon block: the wordmark, one paragraph of what LinkUp is and where it stands, who built it, the real links. */
export function Footer() {
  return (
    <footer className="lfoot">
      <div className="container lfoot__grid">
        <Wordmark />
        <div className="lfoot__colophon">
          <p>
            LinkUp makes one page at <span className="mono">{SITE_HOST}</span> for creators and small communities. It is at its demo stage: accounts, pages and
            analytics stay in this browser.
          </p>
          <p className="lfoot__credit">
            <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('landing_cta_clicked', { cta: 'footer_builder_linkedin' })}>
              <Icon name="linkedin" size={16} fill="currentColor" stroke="none" />
              Built by Ishaan Gupta
              <span className="visually-hidden"> on LinkedIn, opens in a new tab</span>
            </a>
          </p>
        </div>
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
