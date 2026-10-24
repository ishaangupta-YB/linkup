import type { SocialId } from '../lib/types'
import { isSafeHref, toHref } from '../lib/url'
import type { IconName } from '../ui/Icon'

export const SOCIAL_ICON: Record<SocialId, IconName> = {
  instagram: 'instagram',
  linkedin: 'linkedin',
  youtube: 'youtube',
  whatsapp: 'whatsapp',
  x: 'x',
  website: 'globe',
}

export function initials(name: string, fallback: string) {
  const words = (name.trim() || fallback.trim()).split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters.map((w) => Array.from(w)[0] ?? '').join('').toUpperCase() || '?'
}

/** The href a link opens on the public page, or null when it must not be a link. */
export function linkHref(url: string) {
  return url.trim() && isSafeHref(url) ? toHref(url) : null
}

export function hostOf(href: string | null) {
  if (!href) return null
  if (/^(mailto|tel):/i.test(href)) return href.replace(/^(mailto|tel):/i, '')
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
