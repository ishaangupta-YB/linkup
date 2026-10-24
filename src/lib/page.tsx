import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from './api'
import type { Page, PageContent } from './types'
import { track } from '../analytics'

export type SaveStatus = 'saved' | 'saving' | 'error'

type MyPage = {
  status: 'loading' | 'ready' | 'none' | 'error'
  page: Page | null
  error: string | null
  saveStatus: SaveStatus
  /** True when the draft differs from what /:handle serves. */
  hasUnpublishedChanges: boolean
  /** Apply an edit to the draft. Autosaves 600 ms after the last call. */
  updateDraft: (update: (draft: PageContent) => PageContent) => void
  publish: () => Promise<void>
  unpublish: () => Promise<void>
  reload: () => void
  /** Replace the cached page (after claiming or changing the address). */
  setPage: (page: Page) => void
}

const AUTOSAVE_MS = 600
const PageContext = createContext<MyPage | null>(null)

function sameContent(a: PageContent | null, b: PageContent | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Loads the signed-in account's page and owns its draft, autosave and publishing. */
export function MyPageProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MyPage['status']>('loading')
  const [page, setPageState] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loadCount, setLoadCount] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<PageContent | null>(null)
  const saving = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    let live = true
    api
      .getMyPage()
      .then((p) => {
        if (!live) return
        setPageState(p)
        setStatus(p ? 'ready' : 'none')
      })
      .catch((e: unknown) => {
        if (!live) return
        setError(e instanceof Error ? e.message : 'Your page could not be loaded.')
        setStatus('error')
      })
    return () => {
      live = false
    }
  }, [loadCount])

  const writeNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const content = pending.current
    if (!content) return saving.current ?? undefined
    pending.current = null
    const run = (saving.current ?? Promise.resolve()).then(() => api.saveDraft(content))
    saving.current = run
    try {
      const saved = await run
      // A newer edit may have arrived while saving; keep the local draft, update the rest.
      setPageState((current) => (current ? { ...saved, draft: current.draft } : saved))
      if (!pending.current) setSaveStatus('saved')
    } catch {
      pending.current ??= content
      setSaveStatus('error')
    } finally {
      if (saving.current === run) saving.current = null
    }
  }, [])

  const updateDraft = useCallback(
    (update: (draft: PageContent) => PageContent) => {
      setPageState((current) => {
        if (!current) return current
        const draft = update(current.draft)
        if (draft === current.draft) return current
        pending.current = draft
        return { ...current, draft }
      })
      setSaveStatus('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void writeNow(), AUTOSAVE_MS)
    },
    [writeNow],
  )

  // Save anything pending before the tab closes or the provider unmounts.
  useEffect(() => {
    const onHide = () => void writeNow()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      void writeNow()
    }
  }, [writeNow])

  const publish = useCallback(async () => {
    await writeNow()
    const published = await api.publish()
    setPageState((current) => (current ? { ...published, draft: current.draft } : published))
    track('page_published', { links: published.published?.links.filter((l) => l.visible).length ?? 0 }, { pageId: published.id, handle: published.handle })
  }, [writeNow])

  const unpublish = useCallback(async () => {
    await writeNow()
    const next = await api.unpublish()
    setPageState((current) => (current ? { ...next, draft: current.draft } : next))
    track('page_unpublished', {}, { pageId: next.id, handle: next.handle })
  }, [writeNow])

  const value = useMemo<MyPage>(
    () => ({
      status,
      page,
      error,
      saveStatus,
      hasUnpublishedChanges: !!page && !sameContent(page.draft, page.published),
      updateDraft,
      publish,
      unpublish,
      reload: () => {
        setStatus('loading')
        setLoadCount((n) => n + 1)
      },
      setPage: (p: Page) => {
        setPageState(p)
        setStatus('ready')
      },
    }),
    [status, page, error, saveStatus, updateDraft, publish, unpublish],
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}

export function useMyPage() {
  const ctx = useContext(PageContext)
  if (!ctx) throw new Error('useMyPage must be used inside <MyPageProvider>')
  return ctx
}
