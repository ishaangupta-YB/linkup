import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastInput = {
  message: string
  /** An undo-style action; the toast closes when it runs. */
  action?: { label: string; run: () => void }
  /** Milliseconds; 5000 with an action, 3200 without. */
  duration?: number
}

type ToastItem = ToastInput & { id: number }

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

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

function ToastView({ toast, onDone }: { toast: ToastItem; onDone: () => void }) {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    const timer = setTimeout(() => done.current(), toast.duration ?? (toast.action ? 5000 : 3200))
    return () => clearTimeout(timer)
  }, [toast])
  return (
    <div className="toast">
      <Icon name="check" size={18} className="toast__icon" />
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
