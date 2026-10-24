import { useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { normaliseHandle } from '../../lib/handle'

export type HandleCheck =
  | { status: 'idle'; handle: string; reason: null }
  | { status: 'checking'; handle: string; reason: null }
  | { status: 'current'; handle: string; reason: null }
  | { status: 'available'; handle: string; reason: null }
  | { status: 'unavailable'; handle: string; reason: string }
  | { status: 'error'; handle: string; reason: string }

const DEBOUNCE_MS = 300

/**
 * Live availability for a page address, 300 ms after the last keystroke.
 * `current` is the address the account already has (settings), which reads as its own.
 */
export function useHandleCheck(value: string, current?: string): HandleCheck {
  const handle = normaliseHandle(value)
  const [result, setResult] = useState<HandleCheck>({ status: 'idle', handle: '', reason: null })

  useEffect(() => {
    if (!handle || handle === current) return
    let live = true
    const timer = setTimeout(() => {
      api
        .checkHandle(handle)
        .then((r) => {
          if (!live) return
          setResult(r.available ? { status: 'available', handle: r.handle, reason: null } : { status: 'unavailable', handle: r.handle, reason: r.reason ?? 'That address is not available.' })
        })
        .catch(() => live && setResult({ status: 'error', handle, reason: 'The address could not be checked. Keep typing or try again.' }))
    }, DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [handle, current])

  if (!handle) return { status: 'idle', handle: '', reason: null }
  if (handle === current) return { status: 'current', handle, reason: null }
  // Until the answer for this exact address arrives, it is being checked.
  if (result.handle !== handle) return { status: 'checking', handle, reason: null }
  return result
}

/** The line under the address field for each state. */
export function handleCheckHint(check: HandleCheck): string {
  switch (check.status) {
    case 'idle':
      return 'Letters, numbers, dots and underscores.'
    case 'checking':
      return 'Checking the address.'
    case 'current':
      return 'This is your address now.'
    case 'available':
      return `linkup.to/${check.handle} is free.`
    case 'unavailable':
    case 'error':
      return check.reason
  }
}
