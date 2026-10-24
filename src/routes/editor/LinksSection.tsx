import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { track } from '../../analytics'
import { newId } from '../../lib/ids'
import { LIMITS, type LinkItem } from '../../lib/types'
import { isValidUrl } from '../../lib/url'
import { Button, IconButton, TextField, Toggle } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/Toast'
import { dropIndex, insertAt, moveItem, needsProtocol } from './helpers'
import { LinkMenu } from './LinkMenu'
import type { SectionProps } from './types'

/** A drag in progress. Positions are page coordinates (client Y plus scroll), so the list can scroll under the finger. */
type Drag = { id: string; from: number; to: number; startY: number; dy: number; mids: number[]; shift: number; minDy: number; maxDy: number }
type FocusTarget = { id: string; part: 'title' | 'grip' | 'more' } | { id: null; part: 'add' }

/** How close to the top or bottom edge (px) a dragged row starts scrolling the page, and the fastest step per frame. */
const EDGE = 96
const EDGE_TOP = 136
const MAX_STEP = 16

const nameOf = (link: LinkItem) => link.title.trim() || 'Untitled link'

function urlProblem(url: string) {
  if (!url.trim()) return 'Add an address so this link opens.'
  if (!isValidUrl(url)) return 'That address looks incomplete. Write it like example.com/page.'
  return null
}

export function LinksSection({ draft, update, meta }: SectionProps) {
  const links = draft.links
  const toast = useToast()
  const hintId = useId()
  const listRef = useRef<HTMLOListElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const fields = useRef(new Map<string, HTMLElement>())
  const focusNext = useRef<FocusTarget | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pointerY = useRef(0)
  const frame = useRef(0)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const atLimit = links.length >= LIMITS.links

  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    const el = target.part === 'add' ? addRef.current : fields.current.get(`${target.part}:${target.id}`)
    el?.focus()
  })

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const setLinks = (fn: (links: LinkItem[]) => LinkItem[]) => update((d) => ({ ...d, links: fn(d.links) }))
  const patch = (id: string, change: Partial<LinkItem>) => setLinks((list) => list.map((l) => (l.id === id ? { ...l, ...change } : l)))
  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) fields.current.set(key, el)
    else fields.current.delete(key)
  }
  const menuChange = useCallback((id: string) => (open: boolean) => setMenuFor((cur) => (open ? id : cur === id ? null : cur)), [])

  function add() {
    if (atLimit) return
    const link: LinkItem = { id: newId(), title: '', url: '', visible: true }
    setLinks((list) => [...list, link])
    focusNext.current = { id: link.id, part: 'title' }
    track('link_added', { count: links.length + 1, via: 'add' }, meta)
  }

  function duplicate(index: number) {
    if (atLimit) return
    const source = links[index]
    const copy: LinkItem = { ...source, id: newId() }
    setLinks((list) => insertAt(list, index + 1, copy))
    focusNext.current = { id: copy.id, part: 'title' }
    track('link_added', { count: links.length + 1, via: 'duplicate' }, meta)
  }

  function remove(index: number) {
    const link = links[index]
    const neighbour = links[index + 1] ?? links[index - 1]
    setLinks((list) => list.filter((l) => l.id !== link.id))
    focusNext.current = neighbour ? { id: neighbour.id, part: 'grip' } : { id: null, part: 'add' }
    track('link_removed', { count: links.length - 1 }, meta)
    toast({
      message: `Deleted “${nameOf(link)}”.`,
      action: {
        label: 'Undo',
        run: () => setLinks((list) => (list.some((l) => l.id === link.id) || list.length >= LIMITS.links ? list : insertAt(list, index, link))),
      },
    })
  }

  function move(from: number, to: number, via: 'drag' | 'keyboard' | 'menu') {
    if (from === to || to < 0 || to >= links.length) return
    const link = links[from]
    setLinks((list) => moveItem(list, from, to))
    setAnnouncement(`Moved “${nameOf(link)}” to position ${to + 1} of ${links.length}.`)
    track('link_reordered', { from, to, via }, meta)
  }

  function onGripKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : index
    if (to === index && !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    focusNext.current = { id: links[index].id, part: 'grip' }
    move(index, to, 'keyboard')
  }

  const setDrag = (next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }

  /** Re-reads where the dragged row sits from the last pointer position and the current scroll. */
  function follow() {
    const d = dragRef.current
    if (!d) return
    // Kept inside the list, so the lifted row never stretches the page while it scrolls.
    const dy = Math.max(d.minDy, Math.min(d.maxDy, pointerY.current + window.scrollY - d.startY))
    setDrag({ ...d, dy, to: dropIndex(d.mids, d.from, d.mids[d.from] + dy) })
  }

  /** Pixels to scroll this frame: negative near the top edge (under the sticky bars), positive near the bottom (over the tab bar). */
  function edgeStep(y: number) {
    const bottom = window.innerHeight - EDGE
    if (y < EDGE_TOP) return -Math.ceil(((EDGE_TOP - y) / EDGE_TOP) * MAX_STEP)
    if (y > bottom) return Math.ceil(((y - bottom) / EDGE) * MAX_STEP)
    return 0
  }

  function tick() {
    frame.current = 0
    if (!dragRef.current) return
    const step = edgeStep(pointerY.current)
    if (!step) return
    const before = window.scrollY
    window.scrollBy(0, step)
    if (window.scrollY === before) return
    follow()
    frame.current = requestAnimationFrame(tick)
  }

  function onGripDown(e: PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0 || !listRef.current) return
    const rows = Array.from(listRef.current.children) as HTMLElement[]
    const rects = rows.map((r) => r.getBoundingClientRect())
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0
    const scroll = window.scrollY
    e.preventDefault()
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    setMenuFor(null)
    pointerY.current = e.clientY
    setDrag({
      id: links[index].id,
      from: index,
      to: index,
      startY: e.clientY + scroll,
      dy: 0,
      mids: rects.map((r) => r.top + scroll + r.height / 2),
      shift: rects[index].height + gap,
      minDy: rects[0].top - rects[index].top,
      maxDy: rects[rects.length - 1].bottom - rects[index].bottom,
    })
  }

  function onGripMove(e: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return
    pointerY.current = e.clientY
    follow()
    if (!frame.current && edgeStep(e.clientY)) frame.current = requestAnimationFrame(tick)
  }

  function endDrag(commit: boolean) {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const d = dragRef.current
    setDrag(null)
    if (d && commit) move(d.from, d.to, 'drag')
  }

  function rowShift(index: number) {
    if (!drag) return undefined
    if (index === drag.from) return drag.dy
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.shift
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return drag.shift
    return 0
  }

  return (
    <section id="ed-sec-links" className="ed-section surface" aria-labelledby="ed-links">
      <div className="ed-section__head">
        <h2 id="ed-links" className="ed-section__title" tabIndex={-1}>
          Links
        </h2>
        <span className="ed-section__count mono">
          {links.length} of {LIMITS.links}
        </span>
      </div>
      <p id={hintId} className="visually-hidden">
        Drag the handle, or focus it and press the up and down arrow keys, to change the order. The more actions menu can also move a link.
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>

      {links.length === 0 ? (
        <div className="ed-empty">
          <p className="ed-empty__title">No links yet.</p>
          <p className="ed-empty__text">Add the first place people should go from your page: a shop, a booking form, your latest video.</p>
        </div>
      ) : (
        <ol ref={listRef} className={drag ? 'ed-links is-dragging' : 'ed-links'}>
          {links.map((link, index) => {
            const shift = rowShift(index)
            const dragging = drag?.id === link.id
            const problem = touched[link.id] ? urlProblem(link.url) : null
            const name = nameOf(link)
            const last = index === links.length - 1
            return (
              <li
                key={link.id}
                className={['ed-link', dragging && 'is-lifted', !link.visible && 'is-hidden', menuFor === link.id && 'is-menu-open'].filter(Boolean).join(' ')}
                style={shift ? ({ '--dy': `${shift}px` } as CSSProperties) : undefined}
              >
                <div className="ed-link__head">
                  <button
                    type="button"
                    ref={register(`grip:${link.id}`)}
                    className="ed-link__grip"
                    aria-label={`Move “${name}”, position ${index + 1} of ${links.length}`}
                    aria-describedby={hintId}
                    onKeyDown={(e) => onGripKey(e, index)}
                    onPointerDown={(e) => onGripDown(e, index)}
                    onPointerMove={onGripMove}
                    onPointerUp={() => endDrag(true)}
                    onPointerCancel={() => endDrag(false)}
                  >
                    <Icon name="grip" size={18} />
                  </button>
                  <span className="ed-link__pos" aria-hidden="true">
                    Link {index + 1}
                  </span>

                  <div className="ed-link__show">
                    <Toggle checked={link.visible} label={`Show “${name}” on your page`} onChange={(visible) => patch(link.id, { visible })} />
                    <span className="ed-link__state" aria-hidden="true">
                      {link.visible ? 'Shown' : 'Hidden'}
                    </span>
                  </div>

                  <div className="ed-link__quick">
                    <IconButton icon="duplicate" label={atLimit ? `Duplicate (the page holds ${LIMITS.links} links at most)` : `Duplicate “${name}”`} size="sm" disabled={atLimit} onClick={() => duplicate(index)} />
                    <IconButton icon="trash" label={`Delete “${name}”`} size="sm" onClick={() => remove(index)} />
                  </div>

                  <LinkMenu
                    name={name}
                    open={menuFor === link.id}
                    onOpenChange={menuChange(link.id)}
                    buttonRef={register(`more:${link.id}`)}
                    items={[
                      {
                        key: 'up',
                        label: 'Move up',
                        icon: 'chevronUp',
                        disabled: index === 0,
                        run: () => {
                          focusNext.current = { id: link.id, part: 'more' }
                          move(index, index - 1, 'menu')
                        },
                      },
                      {
                        key: 'down',
                        label: 'Move down',
                        icon: 'chevronDown',
                        disabled: last,
                        run: () => {
                          focusNext.current = { id: link.id, part: 'more' }
                          move(index, index + 1, 'menu')
                        },
                      },
                      { key: 'duplicate', label: atLimit ? `Duplicate (${LIMITS.links} at most)` : 'Duplicate', icon: 'duplicate', disabled: atLimit, run: () => duplicate(index) },
                      { key: 'delete', label: 'Delete', icon: 'trash', danger: true, run: () => remove(index) },
                    ]}
                  />
                </div>

                <div className="ed-link__fields">
                  <TextField
                    ref={register(`title:${link.id}`) as (el: HTMLInputElement | null) => void}
                    label="Title"
                    value={link.title}
                    maxLength={LIMITS.linkTitle}
                    counter
                    placeholder="What people tap"
                    autoComplete="off"
                    enterKeyHint="next"
                    onChange={(e) => patch(link.id, { title: e.target.value })}
                  />
                  <div className="ed-link__url">
                    <TextField
                      label="Address"
                      value={link.url}
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      placeholder="example.com/page"
                      error={problem}
                      onChange={(e) => patch(link.id, { url: e.target.value })}
                      onBlur={() => setTouched((t) => (t[link.id] ? t : { ...t, [link.id]: true }))}
                    />
                    {touched[link.id] && !problem && needsProtocol(link.url) && (
                      <button type="button" className="ed-link__fix" onClick={() => patch(link.id, { url: `https://${link.url.trim()}` })}>
                        Add https://
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="ed-links__foot">
        <Button ref={addRef} icon="plus" onClick={add} disabled={atLimit} aria-describedby={atLimit ? `${hintId}-limit` : undefined}>
          Add link
        </Button>
        {atLimit ? (
          <p id={`${hintId}-limit`} className="ed-links__limit">
            A page holds {LIMITS.links} links at most. Delete one to add another.
          </p>
        ) : (
          links.some((l) => !l.visible) && <p className="ed-links__limit">Hidden links stay in this list and are left off your page.</p>
        )}
      </div>
    </section>
  )
}
