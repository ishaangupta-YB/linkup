import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import * as api from '../../lib/api'
import type { LinkItem, PublicPage as PublicPageData, SocialId } from '../../lib/types'
import { pageAddress } from '../../lib/url'
import { track } from '../../analytics'
import { ProfileView } from '../../profile/ProfileView'
import { Button, Skeleton } from '../../ui/controls'
import { useTitle } from '../../ui/hooks'
import { Missing } from './Missing'
import './public.css'

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; page: PublicPageData }
type Loaded = { key: string; state: State }

/** The owner looking at their own page counts only when they asked for it in settings. */
function isUncountedOwner(pageId: string) {
  const viewer = api.sessionAccountIdSync()
  if (!viewer) return false
  const owner = api.pageOwnerSync(pageId)
  return !!owner && owner.ownerId === viewer && !owner.countOwnVisits
}

/** /:handle, the page visitors see. */
export default function PublicPage() {
  const { handle = '' } = useParams()
  const [attempt, setAttempt] = useState(0)
  const key = `${handle}#${attempt}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // Until the answer for this handle and attempt arrives, the page is loading.
  const state: State = loaded?.key === key ? loaded.state : { status: 'loading' }

  useEffect(() => {
    let live = true
    api
      .getPublicPage(handle)
      .then((page) => live && setLoaded({ key, state: page ? { status: 'ready', page } : { status: 'missing' } }))
      .catch(() => live && setLoaded({ key, state: { status: 'error' } }))
    return () => {
      live = false
    }
  }, [handle, key])

  const page = state.status === 'ready' ? state.page : null
  useTitle(page ? `${page.content.name.trim() || `@${page.handle}`} - LinkUp` : state.status === 'missing' ? 'No page here - LinkUp' : 'LinkUp')

  // One page view per load; the dedupe key keeps a remount or a quick reload from counting twice.
  useEffect(() => {
    if (!page || isUncountedOwner(page.pageId)) return
    track('page_view', { title: page.content.name }, { pageId: page.pageId, handle: page.handle, dedupeKey: `pv:${page.pageId}` })
  }, [page])

  // Clicks are recorded and the tracker sends page events at once; navigation is never held back.
  function counted(run: (ids: { pageId: string; handle: string }) => void) {
    if (!page || isUncountedOwner(page.pageId)) return
    run({ pageId: page.pageId, handle: page.handle })
  }
  const onLinkClick = (link: LinkItem, position: number) =>
    counted((ids) => track('link_click', { linkId: link.id, title: link.title, url: link.url, position }, ids))
  const onSocialClick = (id: SocialId, href: string) => counted((ids) => track('social_click', { network: id, url: href }, ids))
  const onShare = () => counted((ids) => track('share_click', {}, ids))

  if (state.status === 'loading') return <PublicSkeleton />
  if (state.status === 'missing') {
    return (
      <Missing title={<>No page at <span className="mono missing__addr">{pageAddress(handle.toLowerCase())}</span></>} primary={{ to: '/signup', label: 'Make your own page' }} secondary={{ to: '/', label: 'What is LinkUp' }}>
        Nobody has published a page at this address yet. If someone sent you this link, ask them to check it.
      </Missing>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="app-scope grain missing" role="alert">
        <main className="missing__body">
          <h1 className="missing__title">This page did not load</h1>
          <p className="missing__text">Something went wrong reading it in this browser. Try again in a moment.</p>
          <div className="missing__actions">
            <Button variant="primary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </main>
      </div>
    )
  }
  return (
    <div className="public">
      <ProfileView mode="live" content={state.page.content} handle={state.page.handle} onLinkClick={onLinkClick} onSocialClick={onSocialClick} onShare={onShare} />
    </div>
  )
}

/** The page's own shape while it loads: photo, name, two lines, four link buttons. */
function PublicSkeleton() {
  return (
    <div className="grain public-sk" role="status" aria-label="Loading page">
      <div className="public-sk__col">
        <Skeleton className="public-sk__photo" />
        <Skeleton className="public-sk__name" />
        <Skeleton className="public-sk__line" />
        <Skeleton className="public-sk__line public-sk__line--short" />
        <div className="public-sk__links">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="public-sk__link" />
          ))}
        </div>
      </div>
    </div>
  )
}
