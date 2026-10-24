import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { track } from '../../analytics'
import { newId } from '../../lib/ids'
import { LIMITS, type LinkItem } from '../../lib/types'
import { isValidUrl } from '../../lib/url'
import { Button, IconButton, TextField, Toggle } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/Toast'
import { dropIndex, insertAt, moveItem, needsProtocol } from './helpers'
import type { SectionProps } from './types'

type Drag = { id: string; from: number; to: number; startY: number; dy: number; mids: number[]; shift: number }
type FocusTarget = { id: string; part: 'title' | 'grip' } | { id: null; part: 'add' }

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
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const atLimit = links.length >= LIMITS.links

  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    const el = target.part === 'add' ? addRef.current : fields.current.get(`${target.part}:${target.id}`)
    el?.focus()
  })

  const setLinks = (fn: (links: LinkItem[]) => LinkItem[]) => update((d) => ({ ...d, links: fn(d.links) }))
  const patch = (id: string, change: Partial<LinkItem>) => setLinks((list) => list.map((l) => (l.id === id ? { ...l, ...change } : l)))
  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) fields.current.set(key, el)
    else fields.current.delete(key)
  }

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

  function move(from: number, to: number, via: 'drag' | 'keyboard') {
    if (from === to || to < 0 || to >= links.length) return
    const link = links[from]
    setLinks((list) => moveItem(list, from, to))
    setAnnouncement(`Moved “${nameOf(link)}” to position ${to + 1} of ${links.length}.`)
    track('link_reordered', { from, to, via }, meta)
  }

  function onGripKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!step) return
    e.preventDefault()
    focusNext.current = { id: links[index].id, part: 'grip' }
    move(index, index + step, 'keyboard')
  }

  function onGripDown(e: PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0 || !listRef.current) return
    const rows = Array.from(listRef.current.children) as HTMLElement[]
    const rects = rows.map((r) => r.getBoundingClientRect())
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0
    e.preventDefault()
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      id: links[index].id,
      from: index,
      to: index,
      startY: e.clientY,
      dy: 0,
      mids: rects.map((r) => r.top + r.height / 2),
      shift: rects[index].height + gap,
    })
  }

  function onGripMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const dy = e.clientY - drag.startY
    setDrag({ ...drag, dy, to: dropIndex(drag.mids, drag.from, drag.mids[drag.from] + dy) })
  }

  function onGripUp() {
    if (!drag) return
    move(drag.from, drag.to, 'drag')
    setDrag(null)
  }

  function rowShift(index: number) {
    if (!drag) return undefined
    if (index === drag.from) return drag.dy
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.shift
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return drag.shift
    return 0
  }

  return (
    <section className="ed-section surface" aria-labelledby="ed-links">
      <div className="ed-section__head">
        <h2 id="ed-links" className="ed-section__title">
          Links
        </h2>
        <span className="ed-section__count mono">
          {links.length} of {LIMITS.links}
        </span>
      </div>
      <p id={hintId} className="visually-hidden">
        Drag the handle, or focus it and press the up and down arrow keys, to change the order.
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {announcement}
      </p>

      {links.length === 0 ? (
        <div className="ed-empty">
          <p className="ed-empty__title">No links yet.</p>
          <p className="ed-empty__text">Add the first place people should go from your page.</p>
        </div>
      ) : (
        <ol ref={listRef} className={drag ? 'ed-links is-dragging' : 'ed-links'}>
          {links.map((link, index) => {
            const shift = rowShift(index)
            const dragging = drag?.id === link.id
            const problem = touched[link.id] ? urlProblem(link.url) : null
            const name = nameOf(link)
            return (
              <li
                key={link.id}
                className={['ed-link', dragging && 'is-lifted', !link.visible && 'is-hidden'].filter(Boolean).join(' ')}
                style={shift ? ({ '--dy': `${shift}px` } as CSSProperties) : undefined}
              >
                <button
                  type="button"
                  ref={register(`grip:${link.id}`)}
                  className="ed-link__grip"
                  aria-label={`Move “${name}”, position ${index + 1} of ${links.length}`}
                  aria-describedby={hintId}
                  onKeyDown={(e) => onGripKey(e, index)}
                  onPointerDown={(e) => onGripDown(e, index)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={() => setDrag(null)}
                >
                  <Icon name="grip" size={18} />
                </button>

                <div className="ed-link__fields">
                  <TextField
                    ref={register(`title:${link.id}`) as (el: HTMLInputElement | null) => void}
                    label="Title"
                    value={link.title}
                    maxLength={LIMITS.linkTitle}
                    counter
                    placeholder="What people tap"
                    autoComplete="off"
                    onChange={(e) => patch(link.id, { title: e.target.value })}
                  />
                  <div className="ed-link__url">
                    <TextField
                      label="Address"
                      value={link.url}
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="example.com/page"
                      error={problem}
                      onChange={(e) => patch(link.id, { url: e.target.value })}
                      onBlur={() => setTouched((t) => (t[link.id] ? t : { ...t, [link.id]: true }))}
                    />
                    {touched[link.id] && needsProtocol(link.url) && (
                      <button type="button" className="ed-link__fix" onClick={() => patch(link.id, { url: `https://${link.url.trim()}` })}>
                        Add https://
                      </button>
                    )}
                  </div>
                </div>

                <div className="ed-link__actions">
                  <div className="ed-link__show">
                    <Toggle checked={link.visible} label={`Show “${name}” on your page`} onChange={(visible) => patch(link.id, { visible })} />
                    <span className="ed-link__state" aria-hidden="true">
                      {link.visible ? 'Shown' : 'Hidden'}
                    </span>
                  </div>
                  <IconButton icon="duplicate" label={atLimit ? `Duplicate (the page holds ${LIMITS.links} links at most)` : `Duplicate “${name}”`} size="sm" disabled={atLimit} onClick={() => duplicate(index)} />
                  <IconButton icon="trash" label={`Delete “${name}”`} size="sm" onClick={() => remove(index)} />
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
        {atLimit && (
          <p id={`${hintId}-limit`} className="ed-links__limit">
            A page holds {LIMITS.links} links at most. Delete one to add another.
          </p>
        )}
      </div>
    </section>
  )
}
