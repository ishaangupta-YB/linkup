/**
 * What the backend accepts for a page. The demo API runs these on every write, the way a
 * real server would, so a screen that forgets a check cannot store something unsafe.
 * `normaliseContent` never throws (it trims, collapses and clamps); `contentProblem` names
 * what must be refused outright (unsafe link addresses, an oversized photo, too many links).
 */
import { DEFAULT_LOOK, EMPTY_SOCIALS } from './defaults'
import { LIMITS, SOCIALS, type ButtonShape, type ButtonStyle, type Ground, type LinkItem, type Look, type PageContent, type SocialId, type Tint } from './types'
import { hasProtocol, isSafeHref } from './url'

/** Longest stored link or social address. Browsers handle far longer, people never need it. */
export const MAX_URL = 2048
/** Longest stored social value (a handle or a profile address). */
export const MAX_SOCIAL = 200

const GROUNDS: Ground[] = ['paper', 'green', 'night']
const TINTS: Tint[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const BUTTON_STYLES: ButtonStyle[] = ['moulded', 'clear', 'label']
const BUTTON_SHAPES: ButtonShape[] = ['soft', 'pill', 'square']

// C0 and C1 controls except tab and newlines, and the bidi overrides that can disguise text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g

/** Cuts to `max` UTF-16 units without splitting a surrogate pair. */
function clamp(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * Trims, strips control characters and clamps to `max`. Single-line text has every run of
 * whitespace (tabs and newlines included) collapsed to one space; multiline text keeps its
 * line breaks but at most one blank line in a row.
 */
export function normaliseText(value: unknown, max: number, { multiline = false } = {}): string {
  let text = typeof value === 'string' ? value : value == null ? '' : String(value)
  text = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '')
  text = multiline
    ? text
        .split('\n')
        .map((line) => line.replace(/ {2,}/g, ' ').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ')
  return clamp(text.trim(), max).trim()
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function normaliseLook(look: unknown): Look {
  const l = (look && typeof look === 'object' ? look : {}) as Partial<Record<keyof Look, unknown>>
  return {
    ground: oneOf(l.ground, GROUNDS, DEFAULT_LOOK.ground),
    tint: oneOf(l.tint, TINTS, DEFAULT_LOOK.tint),
    buttonStyle: oneOf(l.buttonStyle, BUTTON_STYLES, DEFAULT_LOOK.buttonStyle),
    buttonShape: oneOf(l.buttonShape, BUTTON_SHAPES, DEFAULT_LOOK.buttonShape),
  }
}

function normaliseLink(link: unknown, index: number): LinkItem {
  const l = (link && typeof link === 'object' ? link : {}) as Partial<Record<keyof LinkItem, unknown>>
  // Deterministic, so normalising the same content twice gives the same result.
  const id = typeof l.id === 'string' && /^[\w-]{1,64}$/.test(l.id) ? l.id : `link-${index + 1}`
  return {
    id,
    title: normaliseText(l.title, LIMITS.linkTitle),
    url: normaliseText(l.url, MAX_URL),
    visible: l.visible !== false,
  }
}

/**
 * The stored form of a draft: every field present, in a fixed order, text trimmed and
 * clamped to LIMITS, unknown keys dropped. Idempotent, and never throws.
 */
export function normaliseContent(content: PageContent): PageContent {
  const c = (content && typeof content === 'object' ? content : {}) as Partial<Record<keyof PageContent, unknown>>
  const socialsIn = (c.socials && typeof c.socials === 'object' ? c.socials : {}) as Partial<Record<SocialId, unknown>>
  const socials = { ...EMPTY_SOCIALS }
  for (const s of SOCIALS) socials[s.id] = normaliseText(socialsIn[s.id], MAX_SOCIAL)
  const links = Array.isArray(c.links) ? c.links.map(normaliseLink) : []
  // Two links with one id would confuse reordering and click counts; the later one gets a new id.
  const seen = new Set<string>()
  for (const [i, link] of links.entries()) {
    while (seen.has(link.id)) link.id = `${link.id.slice(0, 56)}-${i + 1}`
    seen.add(link.id)
  }
  return {
    photo: typeof c.photo === 'string' && c.photo ? c.photo : null,
    name: normaliseText(c.name, LIMITS.name),
    tagline: normaliseText(c.tagline, LIMITS.tagline),
    bio: normaliseText(c.bio, LIMITS.bio, { multiline: true }),
    location: normaliseText(c.location, LIMITS.location),
    links,
    socials,
    look: normaliseLook(c.look),
  }
}

/** Approximate decoded size of a base64 data URL, in bytes. */
export function dataUrlBytes(url: string) {
  const comma = url.indexOf(',')
  const body = comma >= 0 ? url.slice(comma + 1) : url
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
}

/** Null when the photo value can be stored, otherwise why not. */
export function photoValueProblem(photo: string | null): string | null {
  if (photo == null || photo === '') return null
  if (photo.startsWith('data:')) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(photo)) return 'That photo could not be stored. Choose a JPEG, PNG, WebP or GIF image.'
    if (dataUrlBytes(photo) > LIMITS.photoBytes) return `That photo is too large to store. Choose one under ${Math.round(LIMITS.photoBytes / 1024)} KB.`
    return null
  }
  // A bundled asset (the demo photo) or a stored image address; never a script.
  if (photo.startsWith('/') || photo.startsWith('asset:') || /^https?:\/\//i.test(photo)) return null
  return 'That photo could not be stored. Choose an image file.'
}

/** True when a stored address would open as something other than a web, mail or phone link. */
export function isUnsafeUrl(url: string) {
  const trimmed = url.trim()
  return !!trimmed && hasProtocol(trimmed) && !isSafeHref(trimmed)
}

/**
 * Null when the draft can be saved, otherwise the reason in plain words. Run it on the
 * content as sent; `normaliseContent` then takes care of lengths and whitespace.
 */
export function contentProblem(content: PageContent): string | null {
  if (!content || typeof content !== 'object') return 'The page could not be read. Reload and try again.'
  const links = Array.isArray(content.links) ? content.links : []
  if (links.length > LIMITS.links) return `A page holds ${LIMITS.links} links at most.`
  for (const [i, link] of links.entries()) {
    const url = typeof link?.url === 'string' ? link.url : ''
    if (isUnsafeUrl(url)) {
      const title = typeof link?.title === 'string' && link.title.trim() ? `“${link.title.trim()}”` : `number ${i + 1}`
      return `Link ${title} has an address that cannot open on a page. Start it with https://, mailto: or tel:.`
    }
  }
  const socials = (content.socials ?? {}) as Partial<Record<SocialId, unknown>>
  for (const s of SOCIALS) {
    const value = socials[s.id]
    if (typeof value === 'string' && isUnsafeUrl(value)) return `The ${s.label} address cannot open on a page. Use a handle or an https:// address.`
  }
  return photoValueProblem(typeof content.photo === 'string' ? content.photo : null)
}
