import { useEffect, useRef, useState } from 'react'
import { track } from '../../analytics'
import { useMyPage } from '../../lib/page'
import { pageAddress } from '../../lib/url'
import { Button, Skeleton } from '../../ui/controls'
import { useMediaQuery, useTitle } from '../../ui/hooks'
import { LinksSection } from './LinksSection'
import { LookSection } from './LookSection'
import { PreviewPane, PreviewSheet } from './Preview'
import { ProfileSection } from './ProfileSection'
import { SocialSection } from './SocialSection'
import './editor.css'

export default function EditorPage() {
  useTitle('Editor - LinkUp')
  const my = useMyPage()
  const wide = useMediaQuery('(min-width: 1100px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const opened = useRef(false)
  const page = my.page

  useEffect(() => {
    if (!page || opened.current) return
    opened.current = true
    track('editor_opened', {}, { pageId: page.id, handle: page.handle, dedupeKey: 'editor_opened' })
  }, [page])

  if (my.status === 'loading' || !page) return <EditorSkeleton wide={wide} />

  const meta = { pageId: page.id, handle: page.handle }
  const section = { draft: page.draft, update: my.updateDraft, meta }

  return (
    <div className="editor">
      <div className="editor__panels">
        <header className="editor__head">
          <h1 className="editor__title">Your page</h1>
          <p className="editor__lede">
            Changes save as you type. Publish to show them at <span className="mono">{pageAddress(page.handle)}</span>.
          </p>
        </header>
        <ProfileSection {...section} />
        <LinksSection {...section} />
        <SocialSection {...section} />
        <LookSection {...section} />
      </div>

      {wide ? (
        <PreviewPane page={page} unpublished={my.hasUnpublishedChanges} />
      ) : (
        <>
          <Button
            className="editor__preview-btn"
            icon="eye"
            onClick={() => {
              setSheetOpen(true)
              track('preview_opened', { where: 'sheet' }, meta)
            }}
          >
            Preview
          </Button>
          <PreviewSheet page={page} unpublished={my.hasUnpublishedChanges} open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </>
      )}
    </div>
  )
}

function EditorSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="editor" role="status" aria-label="Loading your page">
      <div className="editor__panels">
        <div className="editor__head">
          <Skeleton style={{ width: 160, height: 28 }} />
          <Skeleton style={{ width: 320, maxWidth: '100%', height: 16 }} />
        </div>
        <div className="ed-section surface">
          <Skeleton style={{ width: 80, height: 20 }} />
          <div className="ed-photo">
            <Skeleton className="ed-skel-photo" />
            <Skeleton style={{ width: 140, height: 32 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 40 }} />
          ))}
        </div>
        <div className="ed-section surface">
          <Skeleton style={{ width: 64, height: 20 }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 96 }} />
          ))}
        </div>
      </div>
      {wide && (
        <div className="ed-preview">
          <div className="ed-preview__stage">
            <Skeleton className="ed-skel-phone" />
          </div>
        </div>
      )}
    </div>
  )
}
