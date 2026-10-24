/**
 * A draft that could not be saved because the session ended (signed out in another tab, or
 * the session was removed). It is kept in this tab's memory only, never in storage, and handed
 * back when the same page loads again after signing in, so nothing typed is lost.
 */
import type { PageContent } from './types'

export type RescuedDraft = { pageId: string; basedOn: number | undefined; content: PageContent }

let rescued: RescuedDraft | null = null
let blocked = false

export function rescueDraft(draft: RescuedDraft) {
  if (!blocked) rescued = draft
}

/** The kept draft for this page, removed from memory as it is handed over. */
export function takeRescuedDraft(pageId: string): RescuedDraft | null {
  if (!rescued || rescued.pageId !== pageId) return null
  const draft = rescued
  rescued = null
  return draft
}

export function hasRescuedDraft() {
  return rescued != null
}

/**
 * A deliberate sign-out ("Sign out anyway") discards unsaved edits; nothing is kept until the
 * next sign-in.
 */
export function discardRescuedDrafts() {
  rescued = null
  blocked = true
}

export function allowRescuedDrafts() {
  blocked = false
}
