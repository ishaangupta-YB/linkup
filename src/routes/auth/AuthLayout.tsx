import type { ReactNode } from 'react'
import { Wordmark } from '../../ui/controls'
import { useTitle } from '../../ui/hooks'
import { SITE_HOST } from '../../lib/types'
import './auth.css'

type Stamp = { text: string; tone: 'given' | 'grey' }

/** The paper label on the plastic band: the page address, set like a pharmacy label. */
export function AddressLabel({ handle, note, stamp }: { handle: string; note: string; stamp?: Stamp | null }) {
  return (
    <div className="addr-label">
      <p className="addr-label__head">Your page address</p>
      <p className="addr-label__addr mono">
        {SITE_HOST}/<wbr /><span className={handle ? 'addr-label__handle' : 'addr-label__handle addr-label__handle--empty'}>{handle || 'yourname'}</span>
      </p>
      <p className="addr-label__note">{note}</p>
      <div className="addr-label__stub" aria-hidden="true" />
      {stamp && <span className={`addr-stamp addr-stamp--${stamp.tone}`}>{stamp.text}</span>}
    </div>
  )
}

/** Sign in, sign up and onboarding: a white form surface on grain paper beside a quiet plastic band. */
export function AuthLayout({ title, docTitle, lead, band, children, foot }: { title: string; docTitle: string; lead?: ReactNode; band: ReactNode; children: ReactNode; foot?: ReactNode }) {
  useTitle(`${docTitle} - LinkUp`)
  return (
    <div className="app-scope grain auth">
      <header className="auth__bar">
        <Wordmark />
      </header>
      <main className="auth__body">
        <section className="auth__panel surface" aria-labelledby="auth-title">
          <h1 id="auth-title" className="auth__title">
            {title}
          </h1>
          {lead && <p className="auth__lead">{lead}</p>}
          {children}
        </section>
        <aside className="auth__band plastic" aria-label="Page address preview">
          {band}
        </aside>
        {foot && <div className="auth__foot">{foot}</div>}
      </main>
    </div>
  )
}
