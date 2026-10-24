import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { ApiError, emailProblem } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { LIMITS } from '../../lib/types'
import { Button, TextField } from '../../ui/controls'
import { AddressLabel, AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { suggestHandle } from './suggest'

type Field = 'name' | 'email' | 'password'
type Values = Record<Field, string>

function problems(v: Values): Record<Field, string | null> {
  return {
    name: v.name.trim() ? null : 'Enter your name.',
    email: v.email.trim() ? emailProblem(v.email) : 'Enter your email address.',
    password: v.password.length >= LIMITS.passwordMin ? null : `Use at least ${LIMITS.passwordMin} characters.`,
  }
}

export default function SignUpPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Values>({ name: '', email: '', password: '' })
  const [touched, setTouched] = useState<Record<Field, boolean>>({ name: false, email: false, password: false })
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // A visitor who is already signed in has nothing to do here. After our own submit we navigate ourselves.
  if (auth.status === 'signedIn' && !submitted) return <Navigate to="/app/editor" replace />

  const issues = problems(values)
  const shown = (f: Field) => (touched[f] ? issues[f] : null)
  const emailTaken = serverError?.code === 'email_taken'

  function set(f: Field, value: string) {
    setValues((v) => ({ ...v, [f]: value }))
    if (f === 'email' && emailTaken) setServerError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true })
    const first = (['name', 'email', 'password'] as const).find((f) => issues[f])
    if (first) {
      const fieldRefs = { name: nameRef, email: emailRef, password: passwordRef }
      fieldRefs[first].current?.focus()
      return
    }
    setServerError(null)
    setBusy(true)
    setSubmitted(true)
    try {
      await auth.signUp(values)
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setSubmitted(false)
      setBusy(false)
      const apiErr = err instanceof ApiError ? err : new ApiError('invalid_input', 'The account could not be made. Try again.')
      setServerError(apiErr)
      if (apiErr.code === 'email_taken') emailRef.current?.focus()
    }
  }

  const handle = suggestHandle(values.name)

  return (
    <AuthLayout
      title="Make your page"
      docTitle="Sign up"
      lead="Your name, your links, one address to share."
      band={<AddressLabel handle={handle} note="You choose the address in the next step." />}
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        <TextField
          ref={nameRef}
          label="Your name"
          name="name"
          autoComplete="name"
          required
          aria-required="true"
          maxLength={LIMITS.name}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={shown('name')}
          hint="Shown at the top of your page. You can change it later."
        />
        <TextField
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          required
          aria-required="true"
          placeholder="name@example.com"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailTaken ? 'An account with that email already exists.' : shown('email')}
        />
        {emailTaken && (
          <p className="auth__inline">
            Is it yours?{' '}
            <Link to="/signin" state={{ email: values.email }} className="auth__link">
              Sign in with it instead
            </Link>
          </p>
        )}
        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          aria-required="true"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={shown('password')}
          hint={`At least ${LIMITS.passwordMin} characters.`}
        />
        {serverError && !emailTaken && (
          <p className="auth__alert" role="alert">
            {serverError.message}
          </p>
        )}
        <Button type="submit" variant="primary" className="auth__submit" loading={busy}>
          {busy ? 'Making your account' : 'Make my account'}
        </Button>
      </form>
      <p className="auth__switch">
        Already have an account?{' '}
        <Link to="/signin" className="auth__link">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
