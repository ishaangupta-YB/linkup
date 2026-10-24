import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import * as api from './api'
import { allowRescuedDrafts, discardRescuedDrafts, hasRescuedDraft } from './rescue'
import type { Account } from './types'
import { identify, track } from '../analytics'
import { useOptionalToast } from '../ui/Toast'

/** Why a signed-in person became signed out without pressing Sign out in this tab. */
export type SignedOutReason = 'elsewhere' | 'expired'

type AuthState =
  | { status: 'loading'; account: null; signedOutReason: null }
  | { status: 'signedOut'; account: null; signedOutReason: SignedOutReason | null }
  | { status: 'signedIn'; account: Account; signedOutReason: null }

type Auth = AuthState & {
  signIn: (input: { email: string; password: string }) => Promise<Account>
  signUp: (input: { name: string; email: string; password: string }) => Promise<Account>
  signOut: () => Promise<void>
  /** Replace the cached account after an update in settings. */
  setAccount: (account: Account | null) => void
  /**
   * Reads the session again, e.g. after a call failed as unauthenticated. A session that has
   * gone signs the tab out with `signedOutReason` 'expired'; the route guard then sends the
   * person to /signin.
   */
  recheck: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

function sameAccount(a: Account | null, b: Account | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', account: null, signedOutReason: null })
  const current = useRef<AuthState>(state)
  useEffect(() => {
    current.current = state
  }, [state])

  const apply = useCallback((account: Account | null, reason: SignedOutReason | null = null) => {
    const next: AuthState = account ? { status: 'signedIn', account, signedOutReason: null } : { status: 'signedOut', account: null, signedOutReason: reason }
    current.current = next
    setState(next)
    identify(account?.id ?? null)
  }, [])

  const setAccount = useCallback((account: Account | null) => apply(account), [apply])

  useEffect(() => {
    let live = true
    api
      .ensureDemoData()
      .then(api.getSession)
      .then((account) => live && setAccount(account))
      .catch(() => live && setAccount(null))
    return () => {
      live = false
    }
  }, [setAccount])

  /** Re-reads the session; `reason` says why it would have gone, if it has. */
  const refresh = useCallback(
    async (reason: SignedOutReason) => {
      let account: Account | null
      try {
        account = await api.getSession()
      } catch {
        return
      }
      const was = current.current
      if (was.status === 'loading') return
      if (sameAccount(was.account, account)) return
      apply(account, was.status === 'signedIn' && !account ? reason : null)
    },
    [apply],
  )

  // Another tab signed in, signed out or changed the account: follow it.
  useEffect(() => api.onExternalChange(() => void refresh('elsewhere')), [refresh])

  const recheck = useCallback(() => refresh('expired'), [refresh])

  const value = useMemo<Auth>(
    () => ({
      ...state,
      setAccount,
      recheck,
      async signIn(input) {
        const account = await api.signIn(input)
        allowRescuedDrafts()
        setAccount(account)
        track('signed_in')
        return account
      },
      async signUp(input) {
        const account = await api.signUp(input)
        allowRescuedDrafts()
        setAccount(account)
        track('signed_up')
        return account
      },
      async signOut() {
        track('signed_out')
        // Signing out here on purpose discards anything unsaved; nothing is handed to the next person.
        discardRescuedDrafts()
        await api.signOut()
        setAccount(null)
      },
    }),
    [state, setAccount, recheck],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

/** The auth context when there is one (tests may mount providers on their own), else null. */
export function useOptionalAuth() {
  return useContext(AuthContext)
}

/** What /signin receives in `location.state` when the guard sends someone there. */
export type SignInRedirectState = { from: string; reason?: SignedOutReason; message?: string }

function signedOutMessage(reason: SignedOutReason, kept: boolean) {
  if (reason === 'elsewhere') return kept ? 'You signed out in another tab. Sign in again to save the edits made here.' : 'You signed out in another tab.'
  return kept ? 'You were signed out. Sign in again and your unsaved edits will be saved.' : 'You were signed out. Sign in again to continue.'
}

/** Route guard: signed-out visitors go to /signin and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  const toast = useOptionalToast()
  const reason = auth.status === 'signedOut' ? auth.signedOutReason : null
  const told = useRef(false)
  useEffect(() => {
    if (!reason || told.current) return
    told.current = true
    // After the commit, so a draft the closing editor could not save has been kept by now.
    toast?.({ message: signedOutMessage(reason, hasRescuedDraft()), tone: 'error' })
  }, [reason, toast])
  if (auth.status === 'loading') return <div className="route-loading" role="status" aria-label="Loading" />
  if (auth.status === 'signedOut') {
    const state: SignInRedirectState = { from: location.pathname + location.search, ...(reason ? { reason, message: signedOutMessage(reason, false) } : {}) }
    return <Navigate to="/signin" replace state={state} />
  }
  return <>{children}</>
}
