import { startTransition, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import * as api from '../../lib/api'
import { ApiError, emailProblem } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useMyPage } from '../../lib/page'
import { LIMITS, SITE_HOST, type Account, type Page } from '../../lib/types'
import { pageAddress, pagePath } from '../../lib/url'
import { flush, isOptedOut, setOptOut, track, transportName } from '../../analytics'
import { Button, Skeleton, TextField, Toggle } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { useTitle } from '../../ui/hooks'
import { PasswordField } from '../auth/PasswordField'
import { handleCheckHint, useHandleCheck } from '../auth/useHandleCheck'
import { formatStamp } from './format'
import './settings.css'

type Feedback = { tone: 'ok' | 'error'; text: string } | null

function message(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

function Section({ id, title, intro, children, danger }: { id: string; title: string; intro?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? 'set-section surface set-section--danger' : 'set-section surface'} aria-labelledby={id}>
      <div className="set-section__head">
        <h2 id={id}>{title}</h2>
        {intro && <p className="set-section__intro">{intro}</p>}
      </div>
      <div className="set-section__body">{children}</div>
    </section>
  )
}

/** The result line under a section's action: what the server said, never a guess. */
function Result({ feedback }: { feedback: Feedback }) {
  return (
    <p className={feedback ? `set-result set-result--${feedback.tone}` : 'set-result'} role={feedback?.tone === 'error' ? 'alert' : 'status'}>
      {feedback && <Icon name={feedback.tone === 'ok' ? 'check' : 'alert'} size={16} />}
      {feedback?.text}
    </p>
  )
}

export default function SettingsPage() {
  useTitle('Settings - LinkUp')
  const auth = useAuth()
  const my = useMyPage()
  const account = auth.account

  return (
    <div className="settings">
      <header className="settings__head">
        <h1>Settings</h1>
      </header>
      {!account || my.status === 'loading' || !my.page ? (
        <SettingsSkeleton />
      ) : (
        <div className="settings__sections">
          <AccountSection account={account} onSaved={auth.setAccount} />
          <PasswordSection />
          <AddressSection page={my.page} onSaved={my.setPage} />
          <PublishingSection page={my.page} unpublish={my.unpublish} />
          <AnalyticsSection account={account} onSaved={auth.setAccount} />
          <DeleteSection handle={my.page.handle} onDeleted={() => auth.setAccount(null)} />
        </div>
      )}
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="settings__sections" aria-busy="true" aria-label="Loading settings">
      {[0, 1, 2].map((i) => (
        <div key={i} className="set-section surface">
          <div className="set-section__head">
            <Skeleton className="sk-head" />
            <Skeleton className="sk-line" />
          </div>
          <div className="set-section__body">
            <Skeleton className="sk-input" />
            <Skeleton className="sk-input" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AccountSection({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const [name, setName] = useState(account.name)
  const [email, setEmail] = useState(account.email)
  const [errors, setErrors] = useState<{ name?: string | null; email?: string | null }>({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const dirty = name.trim() !== account.name || email.trim().toLowerCase() !== account.email

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = { name: name.trim() ? null : 'Enter your name.', email: email.trim() ? emailProblem(email) : 'Enter your email address.' }
    setErrors(next)
    if (next.name || next.email) return
    if (!dirty) return setFeedback({ tone: 'ok', text: 'Nothing changed.' })
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await api.updateAccount({ name, email })
      onSaved(saved)
      setName(saved.name)
      setEmail(saved.email)
      setFeedback({ tone: 'ok', text: 'Saved.' })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_taken') setErrors({ email: err.message })
      else setFeedback({ tone: 'error', text: message(err, 'Your account was not saved. Try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="set-account" title="Account" intro="Your name is also the name at the top of a new page.">
      <form className="set-form" onSubmit={onSubmit} noValidate>
        <div className="set-grid">
          <TextField
            label="Name"
            name="name"
            autoComplete="name"
            maxLength={LIMITS.name}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setFeedback(null)
            }}
            onBlur={() => setErrors((x) => ({ ...x, name: name.trim() ? null : 'Enter your name.' }))}
            error={errors.name}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setFeedback(null)
            }}
            onBlur={() => setErrors((x) => ({ ...x, email: email.trim() ? emailProblem(email) : 'Enter your email address.' }))}
            error={errors.email}
          />
        </div>
        <div className="set-actions">
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            {busy ? 'Saving' : 'Save account'}
          </Button>
          <Result feedback={feedback} />
        </div>
      </form>
    </Section>
  )
}

function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<{ current?: string | null; next?: string | null }>({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const nextIssue = (v: string) => (v.length >= LIMITS.passwordMin ? null : `Use at least ${LIMITS.passwordMin} characters.`)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const found = { current: current ? null : 'Enter your current password.', next: nextIssue(next) }
    setErrors(found)
    if (found.current || found.next) return
    setBusy(true)
    setFeedback(null)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setFeedback({ tone: 'ok', text: 'Password changed. Use the new one next time you sign in.' })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'bad_credentials') setErrors({ current: err.message })
      else setFeedback({ tone: 'error', text: message(err, 'The password was not changed. Try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="set-password" title="Password">
      <form className="set-form" onSubmit={onSubmit} noValidate>
        <div className="set-grid">
          <PasswordField
            label="Current password"
            name="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              setFeedback(null)
            }}
            error={errors.current}
          />
          <PasswordField
            label="New password"
            name="new-password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value)
              setFeedback(null)
              if (errors.next) setErrors((x) => ({ ...x, next: nextIssue(e.target.value) }))
            }}
            onBlur={() => next && setErrors((x) => ({ ...x, next: nextIssue(next) }))}
            error={errors.next}
            hint={`At least ${LIMITS.passwordMin} characters.`}
          />
        </div>
        <div className="set-actions">
          <Button type="submit" size="sm" loading={busy}>
            {busy ? 'Changing' : 'Change password'}
          </Button>
          <Result feedback={feedback} />
        </div>
      </form>
    </Section>
  )
}

function AddressSection({ page, onSaved }: { page: Page; onSaved: (p: Page) => void }) {
  const [value, setValue] = useState(page.handle)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const check = useHandleCheck(value, page.handle)
  const changing = check.status !== 'current' && check.handle !== ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!changing) return
    if (check.status === 'unavailable') return
    const old = page.handle
    setBusy(true)
    try {
      const saved = await api.claimHandle(check.handle)
      onSaved(saved)
      setValue(saved.handle)
      setFeedback({ tone: 'ok', text: `Your page now lives at ${pageAddress(saved.handle)}. ${pageAddress(old)} no longer opens it.` })
    } catch (err) {
      setSubmitError(message(err, 'The address was not changed. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      id="set-address"
      title="Page address"
      intro={
        <>
          Your page is at <span className="mono">{pageAddress(page.handle)}</span>.
        </>
      }
    >
      <form className="set-form" onSubmit={onSubmit} noValidate>
        <div className="set-narrow">
          <TextField
            label="New address"
            name="handle"
            prefix={`${SITE_HOST}/`}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={LIMITS.handleMax}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSubmitError(null)
              setFeedback(null)
            }}
            error={submitError ?? (check.status === 'unavailable' ? check.reason : null)}
            hint={<span aria-live="polite">{check.handle ? handleCheckHint(check) : 'Enter the address you want.'}</span>}
          />
        </div>
        {changing && check.status !== 'unavailable' && (
          <p className="set-warn">
            <Icon name="alert" size={16} />
            <span>
              The old address, <span className="mono">{pageAddress(page.handle)}</span>, stops working straight away. Links you have already shared with it will
              show a missing page.
            </span>
          </p>
        )}
        <div className="set-actions">
          <Button type="submit" size="sm" loading={busy} disabled={!changing || (check.status === 'checking' && !busy)}>
            {busy ? 'Changing' : 'Change address'}
          </Button>
          <Result feedback={feedback} />
        </div>
      </form>
    </Section>
  )
}

function PublishingSection({ page, unpublish }: { page: Page; unpublish: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const live = !!page.published && page.publishedAt != null

  async function onUnpublish() {
    setBusy(true)
    setFeedback(null)
    try {
      await unpublish()
      setConfirming(false)
      setFeedback({ tone: 'ok', text: 'Unpublished. Visitors now see a missing page.' })
    } catch (err) {
      setFeedback({ tone: 'error', text: message(err, 'The page was not unpublished. Try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="set-publishing" title="Publishing">
      <dl className="set-facts">
        <div>
          <dt>Status</dt>
          <dd>{live ? 'Published' : 'Not published'}</dd>
        </div>
        <div>
          <dt>Last published</dt>
          <dd className="mono">{page.publishedAt != null ? formatStamp(page.publishedAt) : 'Never'}</dd>
        </div>
        {live && (
          <div>
            <dt>Live at</dt>
            <dd>
              <a className="set-link mono" href={pagePath(page.handle)} target="_blank" rel="noreferrer">
                {pageAddress(page.handle)}
              </a>
            </dd>
          </div>
        )}
      </dl>
      {live ? (
        confirming ? (
          <div className="set-confirm" role="group" aria-labelledby="unpub-q">
            <p id="unpub-q">Take your page offline? Visitors see a missing page until you publish again. Your draft stays as it is.</p>
            <div className="set-actions">
              <Button size="sm" variant="danger" loading={busy} onClick={onUnpublish}>
                {busy ? 'Unpublishing' : 'Unpublish'}
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>
                Keep it live
              </Button>
            </div>
          </div>
        ) : (
          <div className="set-actions">
            <Button size="sm" onClick={() => setConfirming(true)}>
              Unpublish
            </Button>
            <Result feedback={feedback} />
          </div>
        )
      ) : (
        <div className="set-actions">
          <p className="set-muted">Publish from the top bar when your page is ready.</p>
          <Result feedback={feedback} />
        </div>
      )}
    </Section>
  )
}

function AnalyticsSection({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const [optedOut, setOptedOutState] = useState(() => isOptedOut())
  // The switch moves at once; it springs back if the save fails.
  const [pendingOwn, setPendingOwn] = useState<boolean | null>(null)
  const busy = pendingOwn !== null
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function onCountOwn(next: boolean) {
    setPendingOwn(next)
    setFeedback(null)
    try {
      const saved = await api.updateAccount({ settings: { countOwnVisits: next } })
      onSaved(saved)
      setFeedback({ tone: 'ok', text: next ? 'Your own visits now count.' : 'Your own visits no longer count.' })
    } catch (err) {
      setFeedback({ tone: 'error', text: message(err, 'The setting was not saved. Try again.') })
    } finally {
      setPendingOwn(null)
    }
  }

  function onOptOut(next: boolean) {
    setOptOut(next)
    setOptedOutState(isOptedOut())
    setFeedback({ tone: 'ok', text: next ? 'This browser no longer records analytics.' : 'This browser records analytics again.' })
  }

  return (
    <Section id="set-analytics" title="Analytics">
      <ul className="set-toggles">
        <li>
          <div>
            <p className="set-toggles__name">Count my own visits</p>
            <p className="set-muted">When off, opening your page while signed in is left out of your numbers.</p>
          </div>
          <Toggle label="Count my own visits" checked={pendingOwn ?? account.settings.countOwnVisits} onChange={onCountOwn} disabled={busy} />
        </li>
        <li>
          <div>
            <p className="set-toggles__name">Do not record analytics in this browser</p>
            <p className="set-muted">Applies to this browser only, on every page.</p>
          </div>
          <Toggle label="Do not record analytics in this browser" checked={optedOut} onChange={onOptOut} />
        </li>
      </ul>
      <dl className="set-facts">
        <div>
          <dt>Sent to</dt>
          <dd className="mono">{transportName()}</dd>
        </div>
      </dl>
      <p className="set-muted">During the demo stage, analytics are stored in this browser only.</p>
      <Result feedback={feedback} />
    </Section>
  )
}

function DeleteSection({ handle, onDeleted }: { handle: string; onDeleted: () => void }) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === handle

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!matches) return setError(`Type ${handle} to confirm.`)
    setBusy(true)
    setError(null)
    track('account_deleted', {}, { handle })
    void flush()
    try {
      await api.deleteAccount()
      // One transition, so the route guard never sees a signed-out visitor on /app/settings and sends them to sign in.
      startTransition(() => {
        navigate('/', { replace: true })
        onDeleted()
      })
    } catch (err) {
      setBusy(false)
      setError(message(err, 'The account was not deleted. Try again.'))
    }
  }

  return (
    <Section id="set-danger" title="Delete account" danger intro="Deletes your account and your page. The address becomes free for anyone. This cannot be undone.">
      <form className="set-form" onSubmit={onSubmit} noValidate>
        <div className="set-narrow">
          <TextField
            label={`Type ${handle} to confirm`}
            name="confirm-handle"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              setError(null)
            }}
            error={error}
          />
        </div>
        <div className="set-actions">
          <Button type="submit" size="sm" variant="danger" icon="trash" loading={busy} disabled={!matches && !busy} aria-describedby={matches ? undefined : "delete-why"}>
            {busy ? 'Deleting' : 'Delete my account'}
          </Button>
          {!matches && (
            <p className="set-muted" id="delete-why">
              The button works once the address matches.
            </p>
          )}
        </div>
      </form>
    </Section>
  )
}
