import { LIMITS } from './types'

/** Paths the app itself uses; nobody can claim them as a page address. */
export const RESERVED_HANDLES = new Set([
  'app', 'api', 'admin', 'analytics', 'about', 'account', 'auth', 'blog', 'dashboard', 'docs', 'editor', 'help',
  'home', 'login', 'logout', 'onboarding', 'pricing', 'privacy', 'settings', 'signin', 'signout', 'signup',
  'static', 'assets', 'support', 'terms', 'www', 'linkup', 'new', 'null', 'undefined',
])

export function normaliseHandle(input: string) {
  return input.trim().replace(/^@/, '').toLowerCase()
}

/** Null when the handle is well formed, otherwise the reason in plain words. */
export function handleProblem(handle: string): string | null {
  if (handle.length < LIMITS.handleMin) return `Use at least ${LIMITS.handleMin} characters.`
  if (handle.length > LIMITS.handleMax) return `Use ${LIMITS.handleMax} characters or fewer.`
  if (!/^[a-z0-9._]+$/.test(handle)) return 'Use lowercase letters, numbers, dots and underscores.'
  if (/^[._]|[._]$/.test(handle)) return 'Start and end with a letter or number.'
  if (/[._]{2}/.test(handle)) return 'Use one dot or underscore at a time.'
  if (RESERVED_HANDLES.has(handle)) return 'That address is used by LinkUp itself.'
  return null
}
