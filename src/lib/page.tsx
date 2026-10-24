import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from './api'
import { useOptionalAuth } from './auth'
import { rescueDraft, takeRescuedDraft } from './rescue'
import type { Page, PageContent } from './types'
import { normaliseContent } from './validate'
import { track } from '../analytics'

export type SaveStatus = 'saved' | 'saving' | 'error'

type MyPage = {
  status: 'loading' | 'ready' | 'none' | 'error'
  page: Page | null
  error: string | null
  saveStatus: SaveStatus
  /** Why the last save failed, in words for the person. */
  saveError: string | null
  /**
   * True when a save was refused because the draft was changed in another tab after this tab
   * loaded it. Nothing is overwritten; `reload` shows the stored version.
   */
  conflict: boolean
  /** True when the draft differs from what /:handle serves. */
  hasUnpublishedChanges: boolean
  /** Apply an edit to the draft. Autosaves 600 ms after the last call. */
  updateDraft: (update: (draft: PageContent) => PageContent) => void
  /** Saves anything pending now. Resolves false when it could not be saved. */
  flush: () => Promise<boolean>
  publish: () => Promise<void>
  unpublish: () => Promise<void>
  /** Loads the page again as stored, dropping this tab's unsaved edits (used after a conflict). */
  reload: () => void
  /** Replace the cached page (after claiming or changing the address). */
  setPage: (page: Page) => void
}

const AUTOSAVE_MS = 600
const RETRY_FIRST_MS = 2_000
const RETRY_MAX_MS = 30_000
export const SIGNED_OUT_SAVE_MESSAGE = 'You were signed out. Sign in again to save your changes.'
const PageContext = createContext<MyPage | null>(null)

function sameContent(a: PageContent | null, b: PageContent | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The stored draft version a save is based on. */
type Base = { pageId: string; at: number | undefined }

function baseOf(page: Page): Base {
  return { pageId: page.id, at: page.draftUpdatedAt }
}

/** Loads the signed-in account's page and owns its draft, autosave and publishing. */
export function MyPageProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MyPage['status']>('loading')
  const [page, setPageState] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loadCount, setLoadCount] = useState(0)
  const [conflict, setConflictState] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<PageContent | null>(null)
  const saving = useRef<Promise<boolean> | null>(null)
  /** The newest draft, saved or not. */
  const latest = useRef<PageContent | null>(null)
  /** The stored draft version this tab's edits are based on. */
  const base = useRef<Base | null>(null)
  const conflictRef = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(RETRY_FIRST_MS)
  const writeNowRef = useRef<() => Promise<boolean>>(async () => true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveErrorRef = useRef<string | null>(null)
  const auth = useOptionalAuth()
  const recheck = useRef(auth?.recheck)
  useEffect(() => {
    recheck.current = auth?.recheck
  }, [auth?.recheck])

  const setConflict = useCallback((next: boolean) => {
    conflictRef.current = next
    setConflictState(next)
  }, [])

  const failSave = useCallback((message: string) => {
    setSaveStatus('error')
    saveErrorRef.current = message
    setSaveError(message)
  }, [])

  useEffect(() => {
    let live = true
    api
      .getMyPage()
      .then((p) => {
        if (!live) return
        let next = p
        if (p) {
          base.current = baseOf(p)
          // Edits this tab could not save before the session ended come back now.
          const rescued = takeRescuedDraft(p.id)
          if (rescued) {
            base.current = { pageId: p.id, at: rescued.basedOn }
            next = { ...p, draft: rescued.content }
            pending.current = rescued.content
            setSaveStatus('saving')
            timer.current = setTimeout(() => void writeNowRef.current(), 0)
          }
        }
        setPageState(next)
        latest.current = next?.draft ?? null
        setStatus(next ? 'ready' : 'none')
      })
      .catch((e: unknown) => {
        if (!live) return
        if (e instanceof api.ApiError && e.code === 'unauthenticated') void recheck.current?.()
        setError(e instanceof Error ? e.message : 'Your page could not be loaded.')
        setStatus('error')
      })
    return () => {
      live = false
    }
  }, [loadCount])

  /** Saves one draft. Never rejects: a failure keeps the draft pending and, when retrying can help, schedules a retry. */
  const saveOnce = useCallback(
    (content: PageContent): Promise<boolean> => {
      const sent = base.current
      const run = (async () => {
        try {
          const saved = await api.saveDraft(content, sent ? { basedOn: sent.at, pageId: sent.pageId } : undefined)
          base.current = baseOf(saved)
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
          const code = e instanceof api.ApiError ? e.code : null
          // This tab itself stored a newer draft meanwhile (the tab was hidden mid-save): this older one is obsolete.
          if (code === 'conflict' && base.current !== sent) {
            if (!pending.current) {
              setSaveStatus('saved')
              saveErrorRef.current = null
              setSaveError(null)
            }
            return true
          }
          pending.current ??= content
          if (code === 'conflict') {
            setConflict(true)
            failSave(e instanceof Error ? e.message : api.CONFLICT_MESSAGE)
          } else if (code === 'unauthenticated') {
            failSave(SIGNED_OUT_SAVE_MESSAGE)
            // Let the route guard send the person to sign in; the draft is kept in memory meanwhile.
            void recheck.current?.()
          } else {
            failSave(e instanceof Error ? e.message : 'Your changes could not be saved.')
            // Retrying the same refused content cannot help; the next edit saves again.
            if (code !== 'invalid_input') {
              if (retryTimer.current) clearTimeout(retryTimer.current)
              retryTimer.current = setTimeout(() => void writeNowRef.current(), retryDelay.current)
              retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS)
            }
          }
          return false
        } finally {
          saving.current = null
        }
      })()
      saving.current = run
      return run
    },
    [failSave, setConflict],
  )

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
      if (!content) {
        // A synchronous save (tab hidden) may have written it already; the label must not stay on Saving.
        if (!conflictRef.current && !saveErrorRef.current) setSaveStatus('saved')
        return true
      }
      if (conflictRef.current) return false
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
      // After a conflict nothing more is saved until the stored version is reloaded.
      if (conflictRef.current) return
      setSaveStatus('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void writeNow(), AUTOSAVE_MS)
    },
    [writeNow],
  )

  // A closing tab cannot wait for the async save, so the newest draft is written synchronously.
  useEffect(() => {
    const saveNowSync = (closing: boolean) => {
      const content = pending.current ?? (saving.current ? latest.current : null)
      if (!content) return
      const sent = base.current
      try {
        if (conflictRef.current) throw new api.ApiError('conflict', api.CONFLICT_MESSAGE)
        const saved = api.saveDraftSync(content, sent ? { basedOn: sent.at, pageId: sent.pageId } : undefined)
        base.current = baseOf(saved)
        pending.current = null
        // Nothing else in flight: the stored draft is the newest one, so say so (and drop an old error).
        if (!saving.current) {
          saveErrorRef.current = null
          setSaveError(null)
          setSaveStatus('saved')
        }
      } catch {
        // Signed out, edited elsewhere or out of space. Leaving the editor keeps the draft in memory
        // for when the same page loads again (after signing back in); otherwise it stays pending.
        if (closing && sent) rescueDraft({ pageId: sent.pageId, basedOn: sent.at, content })
      }
    }
    const onPageHide = () => saveNowSync(false)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveNowSync(false)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer.current) clearTimeout(timer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      saveNowSync(true)
    }
  }, [])

  // Another tab saved: show what it stored, unless this tab has edits of its own in progress
  // (those then meet the conflict check instead of being replaced).
  useEffect(() => {
    let live = true
    const busy = () => !!(pending.current || saving.current || timer.current || retryTimer.current || conflictRef.current)
    const unsubscribe = api.onExternalChange(({ db }) => {
      if (!db || busy()) return
      api
        .getMyPage()
        .then((p) => {
          if (!live || busy() || !p) return
          base.current = baseOf(p)
          latest.current = p.draft
          setPageState((current) => (current && JSON.stringify(current) === JSON.stringify(p) ? current : p))
          setStatus('ready')
        })
        .catch(() => {
          // Signed out there: the auth provider follows the session and the guard redirects.
        })
    })
    return () => {
      live = false
      unsubscribe()
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

  const reload = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    timer.current = retryTimer.current = null
    pending.current = null
    retryDelay.current = RETRY_FIRST_MS
    setConflict(false)
    saveErrorRef.current = null
    setSaveError(null)
    setSaveStatus('saved')
    setStatus('loading')
    setLoadCount((n) => n + 1)
  }, [setConflict])

  const setPage = useCallback((p: Page) => {
    // Unsaved edits stay on screen (and pending) and keep the version they were based on.
    if (!pending.current) {
      latest.current = p.draft
      base.current = baseOf(p)
    }
    setPageState((current) => (pending.current && current ? { ...p, draft: current.draft } : p))
    setStatus('ready')
  }, [])

  const hasUnpublishedChanges = useMemo(
    () => !!page && (!page.published || !sameContent(normaliseContent(page.draft), normaliseContent(page.published))),
    [page],
  )

  const value = useMemo<MyPage>(
    () => ({
      status,
      page,
      error,
      saveStatus,
      saveError,
      conflict,
      flush: writeNow,
      hasUnpublishedChanges,
      updateDraft,
      publish,
      unpublish,
      reload,
      setPage,
    }),
    [status, page, error, saveStatus, saveError, conflict, writeNow, hasUnpublishedChanges, updateDraft, publish, unpublish, reload, setPage],
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}

export function useMyPage() {
  const ctx = useContext(PageContext)
  if (!ctx) throw new Error('useMyPage must be used inside <MyPageProvider>')
  return ctx
}
