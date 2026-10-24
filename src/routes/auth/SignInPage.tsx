import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError, emailProblem } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { DEMO_ACCOUNT } from '../../lib/defaults'
import { Button, TextField } from '../../ui/controls'
import { AddressLabel, AuthLayout } from './AuthLayout'
import { nextOnEnter, useKeepSubmitInView } from './formKeys'
import { PasswordField } from './PasswordField'

type LocationState = { from?: string; email?: string; message?: string } | null

/** Only paths inside this app; never an outside URL from history state. */
function safeFrom(from: unknown) {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/signin') ? from : '/app/editor'
}

export default function SignInPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState
  const target = safeFrom(state?.from)
  const [email, setEmail] = useState(state?.email ?? '')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState({ email: false, password: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  useKeepSubmitInView(formRef)

  if (auth.status === 'signedIn' && !submitted) return <Navigate to={target} replace />

  const emailIssue = email.trim() ? emailProblem(email) : 'Enter your email address.'
  const passwordIssue = password ? null : 'Enter your password.'

  async function run(input: { email: string; password: string }, kind: 'form' | 'demo') {
    setError(null)
    setBusy(kind)
    setSubmitted(true)
    try {
      await auth.signIn(input)
      navigate(target, { replace: true })
    } catch (err) {
      setSubmitted(false)
      setBusy(null)
      setError(err instanceof ApiError ? err.message : 'Signing in failed. Try again.')
      passwordRef.current?.select()
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (emailIssue) return emailRef.current?.focus()
    if (passwordIssue) return passwordRef.current?.focus()
    void run({ email, password }, 'form')
  }

  function useDemo() {
    setEmail(DEMO_ACCOUNT.email)
    setPassword(DEMO_ACCOUNT.password)
    setTouched({ email: false, password: false })
    void run({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password }, 'demo')
  }

  return (
    <AuthLayout
      title="Sign in"
      docTitle="Sign in"
      lead="Edit your page, publish it and see what people tap."
      band={<AddressLabel handle="" note="Your address stays the same every time you publish." />}
    >
      <form ref={formRef} className="auth__form" onSubmit={onSubmit} noValidate>
        {/* Why the person landed here, when the guard sent them (signed out in another tab, session ended). */}
        {typeof state?.message === 'string' && state.message && (
          <p className="auth__note" role="status">
            {state.message}
          </p>
        )}
        <TextField
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          // The email is this account's username, so a password manager fills it with the password.
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onKeyDown={nextOnEnter}
          required
          aria-required="true"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          onBlur={() => email.trim() && setTouched((t) => ({ ...t, email: true }))}
          error={touched.email ? emailIssue : null}
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
          aria-required="true"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
          error={touched.password ? passwordIssue : null}
        />
        {error && (
          <p className="auth__alert" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="auth__submit" loading={busy === 'form'} disabled={busy === 'demo'}>
          {busy === 'form' ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
      <div className="auth__demo">
        <Button className="auth__submit" onClick={useDemo} loading={busy === 'demo'} disabled={busy === 'form'}>
          {busy === 'demo' ? 'Opening the demo' : 'Use the demo account'}
        </Button>
        <p className="auth__demo-note">
          Signs in as <span className="mono">{DEMO_ACCOUNT.email}</span>, a sample page you can edit.
        </p>
      </div>
      <p className="auth__switch">
        New to LinkUp?{' '}
        <Link to="/signup" className="auth__link">
          Make your page
        </Link>
      </p>
    </AuthLayout>
  )
}
