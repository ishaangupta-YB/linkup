import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import * as api from './api'
import type { Account } from './types'
import { identify, track } from '../analytics'

type AuthState =
  | { status: 'loading'; account: null }
  | { status: 'signedOut'; account: null }
  | { status: 'signedIn'; account: Account }

type Auth = AuthState & {
  signIn: (input: { email: string; password: string }) => Promise<Account>
  signUp: (input: { name: string; email: string; password: string }) => Promise<Account>
  signOut: () => Promise<void>
  /** Replace the cached account after an update in settings. */
  setAccount: (account: Account | null) => void
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', account: null })

  const setAccount = useCallback((account: Account | null) => {
    setState(account ? { status: 'signedIn', account } : { status: 'signedOut', account: null })
    identify(account?.id ?? null)
  }, [])

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

  const value = useMemo<Auth>(
    () => ({
      ...state,
      setAccount,
      async signIn(input) {
        const account = await api.signIn(input)
        setAccount(account)
        track('signed_in')
        return account
      },
      async signUp(input) {
        const account = await api.signUp(input)
        setAccount(account)
        track('signed_up')
        return account
      },
      async signOut() {
        track('signed_out')
        await api.signOut()
        setAccount(null)
      },
    }),
    [state, setAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

/** Route guard: signed-out visitors go to /signin and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <div className="route-loading" role="status" aria-label="Loading" />
  if (auth.status === 'signedOut') return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
