import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SaveStatus } from '../../lib/page'
import type { Page } from '../../lib/types'
import { pageAddress, pagePath } from '../../lib/url'
import { ProfileView } from '../../profile/ProfileView'
import { Button, Segmented } from '../../ui/controls'
import { Icon } from '../../ui/Icon'

type Device = 'phone' | 'desktop'
const DESKTOP_WIDTH = 1280

const DEVICES = [
  { value: 'phone' as const, label: <><Icon name="phone" size={16} />Phone</> },
  { value: 'desktop' as const, label: <><Icon name="monitor" size={16} />Desktop</> },
]

function PublishNote({ page, unpublished, saveStatus }: { page: Page; unpublished: boolean; saveStatus: SaveStatus }) {
  const unsaved = saveStatus === 'error' && <strong className="ed-preview__unsaved">Your latest changes are not saved yet; LinkUp keeps trying. </strong>
  if (!page.published)
    return (
      <p className="ed-preview__note">
        {unsaved}Not published yet. Publish to put this page at <span className="mono">{pageAddress(page.handle)}</span>.
      </p>
    )
  if (unpublished) return <p className="ed-preview__note">{unsaved}You have changes the live page does not show yet. Publish to update it.</p>
  return <p className="ed-preview__note">{unsaved}The live page matches this preview.</p>
}

function LiveLink({ page }: { page: Page }) {
  if (!page.published) return null
  return (
    <a className="btn btn--quiet btn--sm" href={pagePath(page.handle)} target="_blank" rel="noopener noreferrer">
      <Icon name="external" size={16} />
      Open live page
    </a>
  )
}

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** The desktop signature: the draft in a phone standing on a plastic tray, beside the editor. */
export function PreviewPane({ page, unpublished, saveStatus }: { page: Page; unpublished: boolean; saveStatus: SaveStatus }) {
  const [device, setDevice] = useState<Device>('phone')
  const [stageRef, stage] = useBoxSize<HTMLDivElement>()
  const scale = stage.width ? Math.min(1, stage.width / DESKTOP_WIDTH) : 0.5

  return (
    <aside className="ed-preview" aria-label="Preview of your page">
      <div className="ed-preview__bar">
        <Segmented label="Preview width" size="sm" options={DEVICES} value={device} onChange={setDevice} />
        <LiveLink page={page} />
      </div>

      <div ref={stageRef} className="ed-preview__stage" data-device={device} style={{ '--t': `var(--p-${page.draft.look.tint})` } as CSSProperties}>
        <div className="ed-tray plastic" aria-hidden="true" />
        {device === 'phone' ? (
          <div className="ed-phone">
            <div className="ed-phone__screen">
              <ProfileView content={page.draft} handle={page.handle} mode="preview" />
            </div>
          </div>
        ) : (
          <div className="ed-wide" style={{ width: DESKTOP_WIDTH * scale, height: Math.max(0, stage.height) }}>
            <div className="ed-wide__screen" style={{ width: DESKTOP_WIDTH, height: Math.max(0, stage.height) / scale, transform: `scale(${scale})` }}>
              <ProfileView content={page.draft} handle={page.handle} mode="preview" />
            </div>
          </div>
        )}
      </div>

      <PublishNote page={page} unpublished={unpublished} saveStatus={saveStatus} />
    </aside>
  )
}

/** Phones and narrow windows: the preview as a full-screen sheet. Esc or the close button returns focus. */
export function PreviewSheet({ page, unpublished, saveStatus, open, onClose }: { page: Page; unpublished: boolean; saveStatus: SaveStatus; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  // Unmounting while open (the window grew past 1100px) closes the sheet for good.
  useEffect(() => () => closeRef.current(), [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnTo.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="ed-sheet"
      aria-labelledby="ed-sheet-title"
      onClose={() => {
        onClose()
        returnTo.current?.focus()
      }}
    >
      {open && (
        <>
          <div className="ed-sheet__bar">
            <h2 id="ed-sheet-title" className="ed-sheet__title">
              Preview
            </h2>
            <Button variant="secondary" size="sm" icon="close" className="ed-sheet__close" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="ed-sheet__note">
            <PublishNote page={page} unpublished={unpublished} saveStatus={saveStatus} />
            <LiveLink page={page} />
          </div>
          <div className="ed-sheet__body">
            <ProfileView content={page.draft} handle={page.handle} mode="preview" />
          </div>
        </>
      )}
    </dialog>
  )
}
