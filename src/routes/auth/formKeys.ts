import { useEffect, type KeyboardEvent, type RefObject } from 'react'

/**
 * Enter on a field whose key reads "next" moves to the next field of its form instead of
 * submitting, so a half-filled form never flashes errors for the fields not reached yet.
 * On the last field it does nothing special, and Enter submits as usual.
 */
export function nextOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  const form = e.currentTarget.form
  if (!form) return
  const fields = [...form.elements].filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.disabled && !el.readOnly && !el.hidden && el.type !== 'hidden',
  )
  const next = fields[fields.indexOf(e.currentTarget) + 1]
  if (!next) return
  e.preventDefault()
  next.focus()
}

/** The fixed bars above a form: room left at the top when a field is scrolled up. */
const TOP_ROOM = 72
const KEYBOARD_SETTLE_MS = 320

/**
 * While a field in the form has focus and an on-screen keyboard shrinks the visible area, scrolls
 * just far enough that the submit button shows above the keyboard, never so far that the focused
 * field leaves the top. Does nothing where there is no visualViewport (no on-screen keyboard to dodge).
 * `mounted` re-runs it when the form appears later than the screen, after a loading state.
 */
export function useKeepSubmitInView(formRef: RefObject<HTMLFormElement | null>, mounted: unknown = true) {
  useEffect(() => {
    const form = formRef.current
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!form || !vv) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const fit = () => {
      const field = document.activeElement
      if (!(field instanceof HTMLElement) || !form.contains(field) || !field.matches('input, textarea')) return
      const submit = form.querySelector<HTMLElement>('[type="submit"]')
      if (!submit) return
      // Only when the keyboard is up: the visible area is clearly shorter than the window.
      if (window.innerHeight - vv.height < 120) return
      const visibleTop = vv.offsetTop
      const visibleBottom = vv.offsetTop + vv.height - 12
      const over = submit.getBoundingClientRect().bottom - visibleBottom
      if (over <= 0) return
      const room = field.getBoundingClientRect().top - (visibleTop + TOP_ROOM)
      const by = Math.min(over, Math.max(0, room))
      if (by <= 0) return
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' })
    }
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(fit, KEYBOARD_SETTLE_MS)
    }

    form.addEventListener('focusin', later)
    vv.addEventListener('resize', later)
    return () => {
      clearTimeout(timer)
      form.removeEventListener('focusin', later)
      vv.removeEventListener('resize', later)
    }
  }, [formRef, mounted])
}
