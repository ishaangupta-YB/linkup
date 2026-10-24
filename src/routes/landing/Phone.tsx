import type { PageContent } from '../../lib/types'
import { pageAddress } from '../../lib/url'
import { ProfileView } from '../../profile/ProfileView'

/** The real public page, rendered by ProfileView in preview mode inside one phone frame. The screen scrolls. */
export function Phone({ content, handle, label, className }: { content: PageContent; handle: string; label?: string; className?: string }) {
  return (
    <div
      className={['phone', className].filter(Boolean).join(' ')}
      data-slot="phone"
      data-kind="product"
      data-alt="The LinkUp public page as it renders on a phone"
    >
      <div className="phone__screen" tabIndex={0} role="region" aria-label={label ?? `Preview of ${pageAddress(handle)}`}>
        <ProfileView content={content} handle={handle} mode="preview" />
      </div>
    </div>
  )
}
