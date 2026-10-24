import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { SOCIALS, type LinkItem, type PageContent, type SocialId } from '../lib/types'
import { isSafeHref, pagePath, socialHref } from '../lib/url'
import { Icon } from '../ui/Icon'
import { hostOf, initials, linkHref, SOCIAL_ICON } from './helpers'
import './profile.css'

export type ProfileViewProps = {
  content: PageContent
  handle: string
  /** live: the real public page. preview: inside the editor or landing; links open in a new tab and nothing is tracked. */
  mode: 'live' | 'preview'
  onLinkClick?: (link: LinkItem, position: number) => void
  onSocialClick?: (id: SocialId, href: string) => void
  onShare?: () => void
}

/** The whole public page. It fills its container and sizes itself from the container's width. */
export function ProfileView({ content, handle, mode, onLinkClick, onSocialClick, onShare }: ProfileViewProps) {
  const { look } = content
  const live = mode === 'live'
  const links = content.links.filter((l) => l.visible && (l.title.trim() || l.url.trim()))
  const socials = SOCIALS.map((s) => ({ ...s, href: socialHref(s.id, content.socials[s.id] ?? '') })).filter(
    (s): s is typeof s & { href: string } => !!s.href && isSafeHref(s.href),
  )
  const name = content.name.trim() || `@${handle}`
  // The live page owns the document's h1; previews sit under their screen's own h1.
  const Name = live ? 'h1' : 'h2'

  return (
    <div
      className="pv grain"
      data-mode={mode}
      data-ground={look.ground}
      data-style={look.buttonStyle}
      data-shape={look.buttonShape}
      style={{ '--t': `var(--p-${look.tint})` } as CSSProperties}
    >
      <div className="pv__col">
        <div className="pv__bar">
          <ShareButton handle={handle} live={live} onShare={onShare} />
        </div>

        <header className="pv__head">
          {content.photo ? (
            <img className="pv__photo" src={content.photo} alt="" width={112} height={112} />
          ) : (
            <span className="pv__photo pv__photo--initials" aria-hidden="true">
              {initials(content.name, handle)}
            </span>
          )}
          <Name className="pv__name">{name}</Name>
          {content.tagline.trim() && <p className="pv__tagline">{content.tagline}</p>}
          {content.bio.trim() && <p className="pv__bio">{content.bio}</p>}
          {content.location.trim() && (
            <p className="pv__location">
              <Icon name="pin" size={16} />
              <span>{content.location}</span>
            </p>
          )}
        </header>

        {links.length > 0 ? (
          <ul className="pv__links">
            {links.map((link, i) => {
              const href = linkHref(link.url)
              const title = link.title.trim() || link.url.trim()
              const inner = <LinkFace title={title} host={hostOf(href)} position={i + 1} />
              return (
                <li key={link.id}>
                  {href ? (
                    <a
                      className="pv-link"
                      href={href}
                      target="_blank"
                  rel="noopener noreferrer"
                      onClick={live && onLinkClick ? () => onLinkClick(link, i) : undefined}
                    >
                      {inner}
                    </a>
                  ) : (
                    <span className="pv-link pv-link--off" title="This link has no working address yet">
                      {inner}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="pv__empty">No links on this page yet.</p>
        )}

        {socials.length > 0 && (
          <ul className="pv__socials" aria-label="Elsewhere">
            {socials.map((s) => (
              <li key={s.id}>
                <a
                  className="pv__social"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  onClick={live && onSocialClick ? () => onSocialClick(s.id, s.href) : undefined}
                >
                  <Icon name={SOCIAL_ICON[s.id]} size={20} />
                </a>
              </li>
            ))}
          </ul>
        )}

        <footer className="pv__foot">
          {live ? (
            <Link className="pv__made" to="/">
              Made with LinkUp
            </Link>
          ) : (
            <a className="pv__made" href="/" target="_blank" rel="noopener noreferrer">
              Made with LinkUp
            </a>
          )}
        </footer>
      </div>
    </div>
  )
}

function LinkFace({ title, host, position }: { title: string; host: string | null; position: number }) {
  return (
    <>
      <span className="pv-link__body">
        <span className="pv-link__title">{title}</span>
        <span className="pv-link__host">{host ?? 'No address yet'}</span>
      </span>
      <span className="pv-link__stub" aria-hidden="true">
        {String(position).padStart(2, '0')}
      </span>
    </>
  )
}

function ShareButton({ handle, live, onShare }: { handle: string; live: boolean; onShare?: () => void }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function share() {
    const url = live ? window.location.href : `${window.location.origin}${pagePath(handle)}`
    onShare?.()
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url })
      } catch {
        // Closing the share sheet rejects; nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy this address', url)
    }
  }

  return (
    <button type="button" className="pv__share" onClick={() => void share()} aria-live="polite">
      <Icon name={copied ? 'check' : 'share'} size={16} />
      <span>{copied ? 'Copied' : 'Share'}</span>
    </button>
  )
}
