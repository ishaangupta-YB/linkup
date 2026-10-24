import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastInput = {
  message: string
  /** An undo-style action; the toast closes when it runs. */
  action?: { label: string; run: () => void }
  /**
   * Milliseconds on screen, paused while the pointer is over the toast or focus is in it.
   * Defaults: 8000 with an action (time to reach it, WCAG 2.2.1), 8000 for an error, 5000 otherwise.
   */
  duration?: number
  /** 'error' draws the alert icon instead of the check. */
  tone?: 'info' | 'error'
}

type ToastItem = ToastInput & { id: number }

type Show = (toast: ToastInput) => void

const ToastContext = createContext<Show | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++
    // One toast at a time: a new message replaces the old one.
    setToasts([{ ...toast, id }])
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function toastDuration(toast: ToastInput) {
  return toast.duration ?? (toast.action || toast.tone === 'error' ? 8000 : 5000)
}

function ToastView({ toast, onDone }: { toast: ToastItem; onDone: () => void }) {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const remaining = useRef(toastDuration(toast))

  // Counts down only while nobody is pointing at or focused in the toast; resumes where it stopped.
  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const timer = setTimeout(() => done.current(), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(1000, remaining.current - (Date.now() - started))
    }
  }, [paused])

  return (
    <div
      className={toast.tone === 'error' ? 'toast toast--error' : 'toast'}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={18} className="toast__icon" />
      <span className="toast__text">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action!.run()
            onDone()
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={onDone}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside <ToastProvider>')
  return show
}

/** The toast function when a provider is mounted, else null (for code that also runs without one). */
export function useOptionalToast(): Show | null {
  return useContext(ToastContext)
}
