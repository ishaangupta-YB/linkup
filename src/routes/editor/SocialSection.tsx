import { SOCIALS, type SocialId } from '../../lib/types'
import { socialHref } from '../../lib/url'
import { TextField } from '../../ui/controls'
import type { SectionProps } from './types'

function hint(id: SocialId, value: string) {
  if (!value.trim()) return 'Leave empty to hide this icon.'
  const href = socialHref(id, value)
  return href ? `Opens ${href.replace(/^https?:\/\//, '')}` : null
}

export function SocialSection({ draft, update }: SectionProps) {
  return (
    <section className="ed-section surface" aria-labelledby="ed-social">
      <h2 id="ed-social" className="ed-section__title">
        Social icons
      </h2>
      <p className="ed-section__lede">Each filled field puts a small icon under your links.</p>
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
              inputMode={s.id === 'whatsapp' ? 'tel' : 'url'}
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
