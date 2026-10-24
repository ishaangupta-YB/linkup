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
  /** Why the last save failed, in words for the person. */
  saveError: string | null
  /** True when the draft differs from what /:handle serves. */
  hasUnpublishedChanges: boolean
  /** Apply an edit to the draft. Autosaves 600 ms after the last call. */
  updateDraft: (update: (draft: PageContent) => PageContent) => void
  /** Saves anything pending now. Resolves false when it could not be saved. */
  flush: () => Promise<boolean>
  publish: () => Promise<void>
  unpublish: () => Promise<void>
  reload: () => void
  /** Replace the cached page (after claiming or changing the address). */
  setPage: (page: Page) => void
}

const AUTOSAVE_MS = 600
const RETRY_FIRST_MS = 2_000
const RETRY_MAX_MS = 30_000
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
  const saving = useRef<Promise<boolean> | null>(null)
  /** The newest draft, saved or not. */
  const latest = useRef<PageContent | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(RETRY_FIRST_MS)
  const writeNowRef = useRef<() => Promise<boolean>>(async () => true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveErrorRef = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .getMyPage()
      .then((p) => {
        if (!live) return
        setPageState(p)
        latest.current = p?.draft ?? null
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

  /** Saves one draft. Never rejects: a failure keeps the draft pending and schedules a retry. */
  const saveOnce = useCallback((content: PageContent): Promise<boolean> => {
    const run = (async () => {
      try {
        const saved = await api.saveDraft(content)
        // A newer edit may have arrived while saving; keep the local draft, update the rest.
        setPageState((current) => (current ? { ...saved, draft: current.draft } : saved))
        retryDelay.current = RETRY_FIRST_MS
        // A newer draft was written synchronously while this older one was in flight; write it again on top.
        if (!pending.current && latest.current && latest.current !== content) {
          pending.current = latest.current
          timer.current = setTimeout(() => void writeNowRef.current(), 0)
          return true
        }
        if (!pending.current) {
          setSaveStatus('saved')
          saveErrorRef.current = null
          setSaveError(null)
        }
        return true
      } catch (e) {
        pending.current ??= content
        setSaveStatus('error')
        const message = e instanceof Error ? e.message : 'Your changes could not be saved.'
        saveErrorRef.current = message
        setSaveError(message)
        // A signed-out session cannot be fixed by retrying.
        if (!(e instanceof api.ApiError && e.code === 'unauthenticated')) {
          if (retryTimer.current) clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => void writeNowRef.current(), retryDelay.current)
          retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS)
        }
        return false
      } finally {
        saving.current = null
      }
    })()
    saving.current = run
    return run
  }, [])

  /** Saves everything pending, waiting for any save in flight. True when nothing is left unsaved. */
  const writeNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    timer.current = retryTimer.current = null
    for (;;) {
      if (saving.current) {
        await saving.current
        continue
      }
      const content = pending.current
      if (!content) return true
      pending.current = null
      if (!(await saveOnce(content))) return false
    }
  }, [saveOnce])

  useEffect(() => {
    writeNowRef.current = writeNow
  }, [writeNow])

  const updateDraft = useCallback(
    (update: (draft: PageContent) => PageContent) => {
      setPageState((current) => {
        if (!current) return current
        const draft = update(current.draft)
        if (draft === current.draft) return current
        pending.current = draft
        latest.current = draft
        return { ...current, draft }
      })
      setSaveStatus('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void writeNow(), AUTOSAVE_MS)
    },
    [writeNow],
  )

  // A closing tab cannot wait for the async save, so the newest draft is written synchronously.
  useEffect(() => {
    const saveNowSync = () => {
      const content = pending.current ?? (saving.current ? latest.current : null)
      if (!content) return
      try {
        api.saveDraftSync(content)
        pending.current = null
      } catch {
        // Signed out or out of space; the draft stays pending for the next save.
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveNowSync()
    }
    window.addEventListener('pagehide', saveNowSync)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', saveNowSync)
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer.current) clearTimeout(timer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      saveNowSync()
    }
  }, [])

  const requireSaved = useCallback(async () => {
    if (!(await writeNow())) throw new Error(`Your latest changes are not saved yet, so nothing was published. ${saveErrorRef.current ?? ''}`.trim())
  }, [writeNow])

  const publish = useCallback(async () => {
    await requireSaved()
    const published = await api.publish()
    setPageState((current) => (current ? { ...published, draft: current.draft } : published))
    track('page_published', { links: published.published?.links.filter((l) => l.visible).length ?? 0 }, { pageId: published.id, handle: published.handle })
  }, [requireSaved])

  const unpublish = useCallback(async () => {
    await requireSaved()
    const next = await api.unpublish()
    setPageState((current) => (current ? { ...next, draft: current.draft } : next))
    track('page_unpublished', {}, { pageId: next.id, handle: next.handle })
  }, [requireSaved])

  const value = useMemo<MyPage>(
    () => ({
      status,
      page,
      error,
      saveStatus,
      saveError,
      flush: writeNow,
      hasUnpublishedChanges: !!page && !sameContent(page.draft, page.published),
      updateDraft,
      publish,
      unpublish,
      reload: () => {
        setStatus('loading')
        setLoadCount((n) => n + 1)
      },
      setPage: (p: Page) => {
        latest.current = p.draft
        setPageState(p)
        setStatus('ready')
      },
    }),
    [status, page, error, saveStatus, saveError, writeNow, updateDraft, publish, unpublish],
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}

export function useMyPage() {
  const ctx = useContext(PageContext)
  if (!ctx) throw new Error('useMyPage must be used inside <MyPageProvider>')
  return ctx
}
