import type { ReactNode } from 'react'
import { ButtonLink, Wordmark } from '../../ui/controls'
import './public.css'

/** A calm screen for an address that leads nowhere: what happened and two ways on. */
export function Missing({ title, children, primary, secondary }: { title: ReactNode; children: ReactNode; primary: { to: string; label: string }; secondary?: { to: string; label: string } }) {
  return (
    <div className="app-scope grain missing">
      <header className="missing__bar">
        <Wordmark />
      </header>
      <main className="missing__body">
        <h1 className="missing__title">{title}</h1>
        <p className="missing__text">{children}</p>
        <div className="missing__actions">
          <ButtonLink to={primary.to} variant="primary">
            {primary.label}
          </ButtonLink>
          {secondary && (
            <ButtonLink to={secondary.to} variant="quiet">
              {secondary.label}
            </ButtonLink>
          )}
        </div>
      </main>
    </div>
  )
}
