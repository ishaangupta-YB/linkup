import type { PageContent } from '../../lib/types'

/** What every editor section receives: the draft, a way to change it, and the ids analytics events carry. */
export type SectionProps = {
  draft: PageContent
  update: (fn: (draft: PageContent) => PageContent) => void
  meta: { pageId: string; handle: string }
}
