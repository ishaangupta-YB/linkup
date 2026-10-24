import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { IconButton } from '../../ui/controls'
import { Icon, type IconName } from '../../ui/Icon'

export type LinkMenuItem = { key: string; label: string; icon: IconName; disabled?: boolean; danger?: boolean; run: () => void }

type Props = {
  /** The link's name, for the button's accessible name. */
  name: string
  items: LinkMenuItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  buttonRef: (el: HTMLButtonElement | null) => void
}

/**
 * The per-link actions menu: Move up, Move down, Duplicate, Delete. Touch users get explicit
 * moves here; arrow keys move between items, Esc and Tab close it, a tap outside closes it.
 */
export function LinkMenu({ name, items, open, onOpenChange, buttonRef }: Props) {
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const [up, setUp] = useState(false)

  // Open upward when the space under the button (above the tab bar) is too short.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return
    const rect = button.current.getBoundingClientRect()
    const need = list.current.offsetHeight + 96
    setUp(window.innerHeight - rect.bottom < need && rect.top > need)
  }, [open])

  useEffect(() => {
    if (!open) return
    const first = list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    first?.focus()
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, onOpenChange])

  function close(refocus: boolean) {
    onOpenChange(false)
    if (refocus) button.current?.focus()
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1
    if (e.key === 'ArrowDown') next = (at + 1) % buttons.length
    else if (e.key === 'ArrowUp') next = (at - 1 + buttons.length) % buttons.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    } else if (e.key === 'Tab') {
      close(false)
      return
    }
    if (next < 0) return
    e.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div ref={wrap} className="ed-menu">
      <IconButton
        ref={(el) => {
          button.current = el
          buttonRef(el)
        }}
        icon="more"
        size="sm"
        label={`More actions for “${name}”`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="ed-menu__button"
        onClick={() => onOpenChange(!open)}
      />
      {open && (
        <div ref={list} id={id} role="menu" aria-label={`Actions for “${name}”`} className={up ? 'ed-menu__list is-up' : 'ed-menu__list'} onKeyDown={onKey}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger ? 'ed-menu__item ed-menu__item--danger' : 'ed-menu__item'}
              disabled={item.disabled}
              onClick={() => {
                onOpenChange(false)
                item.run()
              }}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
