import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'md' | 'sm' | 'lg'

function buttonClass(variant: Variant, size: Size, extra?: string) {
  return ['btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, extra].filter(Boolean).join(' ')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: IconName
  /** Shows a busy state and blocks clicks while an action runs. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  )
})

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </Link>
  )
}

/** A square button with only an icon; `label` is its accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: Size }>(
  function IconButton({ icon, label, size = 'md', className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={['icon-btn', size === 'sm' && 'icon-btn--sm', className].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
        <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      </button>
    )
  },
)

type FieldShellProps = {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  count?: { value: number; max: number }
  children: ReactNode
}

function FieldShell({ id, label, hint, error, count, children }: FieldShellProps) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {count && (
          <span className="field__count num" aria-hidden="true">
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="field__error" id={`${id}-msg`} role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : (
        hint && (
          <p className="field__hint" id={`${id}-msg`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  hint?: ReactNode
  error?: string | null
  /** Shows a live counter against maxLength. */
  counter?: boolean
  /** Text fixed before the input, e.g. linkup.to/ */
  prefix?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, counter, prefix, maxLength, value, className, ...rest },
  ref,
) {
  const id = useId()
  const length = typeof value === 'string' ? value.length : 0
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} count={counter && maxLength ? { value: length, max: maxLength } : undefined}>
      <div className={prefix ? 'input-wrap input-wrap--prefix' : 'input-wrap'}>
        {prefix && (
          <span className="input-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={['input', className].filter(Boolean).join(' ')}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          {...rest}
        />
      </div>
    </FieldShell>
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null; counter?: boolean }>(
  function TextArea({ label, hint, error, counter, maxLength, value, className, rows = 3, ...rest }, ref) {
    const id = useId()
    const length = typeof value === 'string' ? value.length : 0
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} count={counter && maxLength ? { value: length, max: maxLength } : undefined}>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={['input', 'textarea', className].filter(Boolean).join(' ')}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          {...rest}
        />
      </FieldShell>
    )
  },
)

/** An on/off switch. The visible text, or `label` when there is none, names it. */
export function Toggle({ checked, onChange, label, showLabel = false, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; showLabel?: boolean; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" className="toggle__input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={showLabel ? undefined : label} />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      {showLabel && <span className="toggle__text">{label}</span>}
    </label>
  )
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; title?: string }

/** A radio group drawn as plastic keys; arrow keys move between options. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'md' | 'sm'
  className?: string
}) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={['segmented', size === 'sm' && 'segmented--sm', className].filter(Boolean).join(' ')}>
      {options.map((o) => (
        <label key={o.value} className="segmented__option" title={o.title}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={['skeleton', className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />
}

/** The LinkUp wordmark: a two-tone capsule and the name. */
export function Wordmark({ to = '/', small }: { to?: string; small?: boolean }) {
  return (
    <Link to={to} className={small ? 'wordmark wordmark--sm' : 'wordmark'} aria-label="LinkUp home">
      <svg className="wordmark__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="7" width="28" height="18" rx="9" className="wordmark__cap" />
        <rect x="2" y="7" width="15" height="18" rx="9" className="wordmark__fill" />
      </svg>
      <span>LinkUp</span>
    </Link>
  )
}
