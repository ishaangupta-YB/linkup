import { SITE_HOST, type SocialId } from './types'

export function hasProtocol(url: string) {
  // A colon followed by a digit is a port (example.com:8080), not a scheme; tel: is the exception.
  return /^(tel:|[a-z][a-z0-9+.-]*:(?!\d))/i.test(url.trim())
}

/** The href a stored URL opens. Bare domains get https://. */
export function toHref(url: string) {
  const trimmed = url.trim()
  return hasProtocol(trimmed) ? trimmed : `https://${trimmed}`
}

/** True when the URL would open a real web or mail address once https:// is added. */
export function isValidUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(trimmed)) return true
  if (/^tel:\+?[0-9 ()-]{5,}$/i.test(trimmed)) return true
  try {
    const u = new URL(toHref(trimmed))
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return /^[^.]+(\.[^.]+)+$/.test(u.hostname) && !u.hostname.endsWith('.')
  } catch {
    return false
  }
}

/** Links on a public page may only be web, mail or phone links. Anything else (javascript:, data:) is refused. */
export function isSafeHref(url: string) {
  return /^(https?:|mailto:|tel:)/i.test(toHref(url))
}

/** The address a public page lives at, without protocol, for display. */
export function pageAddress(handle: string) {
  return `${SITE_HOST}/${handle}`
}

/** The path inside this app that serves a public page. */
export function pagePath(handle: string) {
  return `/${handle}`
}

/** Turns what a person types in a social field into the URL the icon opens. */
export function socialHref(id: SocialId, value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const handle = v.replace(/^@/, '')
  // A leading @ always means a handle, even when it contains a dot (@studio.in).
  const isUrl = !v.startsWith('@') && (hasProtocol(v) || /^[\w-]+(\.[\w-]+)+\//.test(v) || /\.(com|in|me|to|io|co|org|net)\b/i.test(v))
  switch (id) {
    case 'instagram':
      return isUrl ? toHref(v) : `https://instagram.com/${handle}`
    case 'youtube':
      return isUrl ? toHref(v) : `https://youtube.com/@${handle}`
    case 'x':
      return isUrl ? toHref(v) : `https://x.com/${handle}`
    case 'whatsapp': {
      if (isUrl) return toHref(v)
      const digits = v.replace(/[^0-9]/g, '')
      return digits.length >= 8 ? `https://wa.me/${digits}` : null
    }
    case 'linkedin':
      return isUrl ? toHref(v) : `https://linkedin.com/in/${handle}`
    case 'website':
      return toHref(v)
  }
}
