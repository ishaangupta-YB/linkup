import { SOCIALS, type SocialId } from '../../lib/types'
import { socialHref } from '../../lib/url'
import { TextField } from '../../ui/controls'
import type { SectionProps } from './types'

/** The phone keyboard each field wants: @ handles get the key with @ on it, addresses the URL keys, WhatsApp the number pad. */
const INPUT_MODE: Record<SocialId, 'email' | 'url' | 'tel'> = {
  instagram: 'email',
  linkedin: 'url',
  youtube: 'email',
  whatsapp: 'tel',
  x: 'email',
  website: 'url',
}

function hint(id: SocialId, value: string) {
  if (!value.trim()) return 'Leave empty to hide this icon.'
  const href = socialHref(id, value)
  return href ? `Opens ${href.replace(/^https?:\/\//, '')}` : null
}

export function SocialSection({ draft, update }: SectionProps) {
  const shown = SOCIALS.filter((s) => socialHref(s.id, draft.socials[s.id] ?? '')).length
  return (
    <section id="ed-sec-social" className="ed-section surface" aria-labelledby="ed-social">
      <div className="ed-section__head">
        <h2 id="ed-social" className="ed-section__title" tabIndex={-1}>
          Social icons
        </h2>
        <span className="ed-section__count mono">
          {shown} of {SOCIALS.length}
        </span>
      </div>
      <p className="ed-section__lede">{shown ? 'Each filled field puts a small icon under your links.' : 'No icons yet. Fill any field below and its icon appears under your links.'}</p>
      <div className="ed-socials">
        {SOCIALS.map((s) => {
          const value = draft.socials[s.id] ?? ''
          const text = hint(s.id, value)
          return (
            <TextField
              key={s.id}
              label={s.label}
              value={value}
              placeholder={s.placeholder}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode={INPUT_MODE[s.id]}
              enterKeyHint="next"
              hint={text}
              error={text === null ? 'Add the full number with its country code, like 919800000000.' : null}
              onChange={(e) => {
                const next = e.target.value
                update((d) => ({ ...d, socials: { ...d.socials, [s.id]: next } }))
              }}
            />
          )
        })}
      </div>
    </section>
  )
}
