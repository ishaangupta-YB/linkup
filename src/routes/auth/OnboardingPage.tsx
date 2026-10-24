import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import * as api from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { LIMITS, SITE_HOST } from '../../lib/types'
import { track } from '../../analytics'
import { Button, Skeleton, TextField } from '../../ui/controls'
import { AddressLabel, AuthLayout } from './AuthLayout'
import { useKeepSubmitInView } from './formKeys'
import { suggestHandle } from './suggest'
import { handleCheckHint, useHandleCheck } from './useHandleCheck'

type Gate = 'loading' | 'ready' | 'has-page' | 'error'

/** Step two of sign-up: claim linkup.to/<handle>. Runs inside RequireAuth. */
export default function OnboardingPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const name = auth.account?.name ?? ''
  const suggestion = suggestHandle(name)
  const [gate, setGate] = useState<Gate>('loading')
  const [attempt, setAttempt] = useState(0)
  const [value, setValue] = useState(suggestion)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const check = useHandleCheck(value)

  // Someone who already has a page skips this step.
  useEffect(() => {
    let live = true
    api
      .getMyPage()
      .then((page) => live && setGate(page ? 'has-page' : 'ready'))
      .catch(() => live && setGate('error'))
    return () => {
      live = false
    }
  }, [attempt])

  useKeepSubmitInView(formRef, gate === 'ready')

  if (gate === 'has-page') return <Navigate to="/app/editor" replace />

  const unavailable = check.status === 'unavailable' ? check.reason : null
  const error = submitError ?? unavailable

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!check.handle) {
      setSubmitError('Choose an address for your page.')
      inputRef.current?.focus()
      return
    }
    if (check.status === 'unavailable') {
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const page = await api.claimHandle(check.handle)
      track('handle_claimed', { suggested: page.handle === suggestion }, { pageId: page.id, handle: page.handle })
      navigate('/app/editor', { replace: true })
    } catch (err) {
      setBusy(false)
      setSubmitError(err instanceof Error ? err.message : 'The address could not be claimed. Try again.')
      inputRef.current?.focus()
    }
  }

  const stamp =
    check.status === 'available' ? ({ text: 'Free', tone: 'given' } as const) : check.status === 'unavailable' ? ({ text: 'Not free', tone: 'grey' } as const) : null

  return (
    <AuthLayout
      title="Claim your address"
      docTitle="Claim your address"
      lead="This is the link you put in your bio. You can change it later in settings."
      band={<AddressLabel handle={check.handle} note={check.status === 'available' ? 'Yours once you claim it.' : check.status === 'unavailable' ? 'Try another address.' : check.status === 'checking' ? 'Checking.' : 'Type an address to check it.'} stamp={stamp} />}
    >
      {gate === 'loading' && (
        <div className="auth__form" aria-busy="true" aria-label="Loading">
          <Skeleton className="sk-label" />
          <Skeleton className="sk-input" />
          <Skeleton className="sk-input" />
        </div>
      )}
      {gate === 'error' && (
        <div className="auth__form" role="alert">
          <p className="auth__alert">Your account did not load. Check that this browser allows site storage, then try again.</p>
          <Button variant="primary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {gate === 'ready' && (
        <form ref={formRef} className="auth__form" onSubmit={onSubmit} noValidate>
          <TextField
            ref={inputRef}
            label="Page address"
            name="handle"
            prefix={`${SITE_HOST}/`}
            // Not "username": the login is the email, and a password manager would offer saved emails here.
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            aria-required="true"
            maxLength={LIMITS.handleMax}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSubmitError(null)
            }}
            error={error}
            hint={<span aria-live="polite">{handleCheckHint(check)}</span>}
          />
          {suggestion && value !== suggestion && (
            <p className="auth__inline">
              From your name:{' '}
              <button type="button" className="auth__link auth__link--btn mono" onClick={() => setValue(suggestion)}>
                {suggestion}
              </button>
            </p>
          )}
          <Button type="submit" variant="primary" className="auth__submit" loading={busy} disabled={check.status === 'checking' && !busy}>
            {busy ? 'Claiming' : 'Claim this address'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
