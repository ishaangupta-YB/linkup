import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from '../ui/Icon'

/**
 * A menu button (WAI-ARIA menu pattern). Enter, Space or the arrow keys open it; the arrow
 * keys, Home and End move between items; Escape closes it and returns focus to the button;
 * Tab, a tap outside or choosing an item closes it.
 */
type MenuCtx = { close: (returnFocus?: boolean) => void }
const MenuContext = createContext<MenuCtx | null>(null)

export function Menu({
  label,
  button,
  buttonClassName,
  panelClassName,
  head,
  children,
}: {
  /** The button's accessible name, e.g. "Account". */
  label: string
  /** What the button shows. */
  button: ReactNode
  buttonClassName?: string
  panelClassName?: string
  /** Content above the items that is not itself an item (who is signed in, the address). */
  head?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const firstFocus = useRef<'first' | 'last'>('first')

  const items = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])

  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    if (returnFocus) trigger.current?.focus()
  }, [])

  const openWith = (where: 'first' | 'last') => {
    firstFocus.current = where
    setOpen(true)
  }

  // Focus moves into the menu once it is drawn.
  useEffect(() => {
    if (!open) return
    const all = items()
    ;(firstFocus.current === 'last' ? all[all.length - 1] : all[0])?.focus()
  }, [open])

  // A tap or click anywhere outside closes it, without pulling focus back.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openWith(e.key === 'ArrowUp' ? 'last' : 'first')
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      e.preventDefault()
      all[(to + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(all.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="menu" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(false) : openWith('first'))}
        onKeyDown={onTriggerKey}
      >
        {button}
      </button>
      {open && (
        <div className={['menu__panel', panelClassName].filter(Boolean).join(' ')} onKeyDown={onMenuKey}>
          {head && <div className="menu__head">{head}</div>}
          <div role="menu" id={`${id}-menu`} aria-label={label} ref={list} className="menu__list">
            <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
          </div>
        </div>
      )}
    </div>
  )
}

function useMenu() {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('Menu items must be inside <Menu>')
  return ctx
}

function ItemBody({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </>
  )
}

/** A menu item that runs an action. The menu closes first and focus goes back to its button. */
export function MenuButton({ icon, onSelect, children }: { icon?: IconName; onSelect: () => void; children: ReactNode }) {
  const { close } = useMenu()
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className="menu__item"
      onClick={() => {
        close()
        onSelect()
      }}
    >
      <ItemBody icon={icon}>{children}</ItemBody>
    </button>
  )
}

/** A menu item that goes to a route in the app. */
export function MenuLink({ icon, to, onSelect, children }: { icon?: IconName; to: string; onSelect?: () => void; children: ReactNode }) {
  const { close } = useMenu()
  return (
    <Link
      role="menuitem"
      tabIndex={-1}
      className="menu__item"
      to={to}
      onClick={() => {
        close(false)
        onSelect?.()
      }}
    >
      <ItemBody icon={icon}>{children}</ItemBody>
    </Link>
  )
}

/** A menu item that opens an address in a new tab. */
export function MenuAnchor({ icon, href, onSelect, children }: { icon?: IconName; href: string; onSelect?: () => void; children: ReactNode }) {
  const { close } = useMenu()
  return (
    <a
      role="menuitem"
      tabIndex={-1}
      className="menu__item"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        close(false)
        onSelect?.()
      }}
    >
      <ItemBody icon={icon}>{children}</ItemBody>
    </a>
  )
}
