import { useId, useState, type InputHTMLAttributes, type Ref } from 'react'
import { Icon } from '../../ui/Icon'
import './password-field.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string
  hint?: string
  error?: string | null
  ref?: Ref<HTMLInputElement>
}

/** A password input with a show and hide control in its right edge; the field markup matches TextField. */
export function PasswordField({ label, hint, error, className, ref, ...rest }: Props) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const msg = error || hint ? `${id}-msg` : undefined
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      </div>
      <div className="input-wrap">
        <input
          ref={ref}
          id={id}
          type={shown ? 'text' : 'password'}
          className={['input', 'input--with-action', className].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={msg}
          spellCheck={false}
          autoCapitalize="off"
          {...rest}
        />
        <button
          type="button"
          className="pw-toggle"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => setShown((s) => !s)}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {error ? (
        <p className="field__error" id={msg} role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : (
        hint && (
          <p className="field__hint" id={msg}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}
