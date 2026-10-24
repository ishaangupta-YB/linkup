import { Link } from 'react-router'
import { track } from '../../analytics'
import { useAuth } from '../../lib/auth'
import { ButtonLink, Wordmark } from '../../ui/controls'

/** Edge-aligned: the wordmark at one edge, sign in and the one action at the other. */
export function LandingNav() {
  const auth = useAuth()
  const signedIn = auth.status === 'signedIn'
  return (
    <header className="lnav">
      <div className="container lnav__row">
        <Wordmark />
        <nav className="lnav__end" aria-label="Account">
          {signedIn ? (
            <ButtonLink to="/app/editor" variant="secondary" onClick={() => track('landing_cta_clicked', { cta: 'nav_open_editor' })}>
              Open your editor
            </ButtonLink>
          ) : (
            <>
              <Link className="lnav__link" to="/signin" onClick={() => track('landing_cta_clicked', { cta: 'nav_sign_in' })}>
                Sign in
              </Link>
              <ButtonLink to="/signup" variant="secondary" onClick={() => track('landing_cta_clicked', { cta: 'nav_make_page' })}>
                Make your page
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
