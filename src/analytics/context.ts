import type { Device, EventContext } from './events'

/** Referrer hosts and the source name a creator recognises. First match wins. */
const SOURCE_HOSTS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$|^l\.instagram\.com$/, 'Instagram'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)whatsapp\.(com|net)$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'X'],
  [/(^|\.)facebook\.com$|^fb\.me$|^l\.facebook\.com$/, 'Facebook'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, 'Telegram'],
]

const UTM_SOURCES: Record<string, string> = {
  ig: 'Instagram',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  li: 'LinkedIn',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  youtube: 'YouTube',
  yt: 'YouTube',
  x: 'X',
  twitter: 'X',
  facebook: 'Facebook',
  fb: 'Facebook',
  google: 'Google',
  email: 'Email',
  newsletter: 'Email',
  qr: 'QR code',
}

/** Names the source of a visit from its UTM tag or referrer. Same-site and empty referrers are Direct. */
export function deriveSource(search: string, referrer: string, ownHost: string): { source: string; medium: string | null; campaign: string | null } {
  const params = new URLSearchParams(search)
  const utm = params.get('utm_source')?.trim().toLowerCase()
  const medium = params.get('utm_medium')?.trim() || null
  const campaign = params.get('utm_campaign')?.trim() || null
  if (utm) return { source: UTM_SOURCES[utm] ?? capitalise(utm), medium, campaign }
  if (!referrer) return { source: 'Direct', medium, campaign }
  let host: string
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return { source: 'Direct', medium, campaign }
  }
  if (!host || host === ownHost.replace(/^www\./, '')) return { source: 'Direct', medium, campaign }
  for (const [pattern, name] of SOURCE_HOSTS) if (pattern.test(host)) return { source: name, medium, campaign }
  return { source: host, medium, campaign }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function deriveDevice(ua: string, width: number): Device {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android.*Mobile|Opera Mini|IEMobile/i.test(ua)) return 'mobile'
  if (width > 0 && width < 600) return 'mobile'
  return 'desktop'
}

export function deriveBrowser(ua: string): string {
  if (/Instagram/i.test(ua)) return 'Instagram in-app'
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook in-app'
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn in-app'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS/.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Other'
}

export function deriveOs(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Other'
}

/** IANA time zone to country, for the zones most visitors come from. Unknown zones keep their region. */
const TZ_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Singapore': 'Singapore',
  'Asia/Karachi': 'Pakistan',
  'Asia/Dhaka': 'Bangladesh',
  'Asia/Kathmandu': 'Nepal',
  'Asia/Colombo': 'Sri Lanka',
  'Asia/Tokyo': 'Japan',
  'Asia/Shanghai': 'China',
  'Asia/Hong_Kong': 'Hong Kong',
  'Europe/London': 'United Kingdom',
  'Europe/Berlin': 'Germany',
  'Europe/Paris': 'France',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Madrid': 'Spain',
  'Europe/Rome': 'Italy',
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Denver': 'United States',
  'America/Los_Angeles': 'United States',
  'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada',
  'America/Sao_Paulo': 'Brazil',
  'Australia/Sydney': 'Australia',
  'Australia/Melbourne': 'Australia',
  'Africa/Lagos': 'Nigeria',
  'Africa/Nairobi': 'Kenya',
  'Africa/Johannesburg': 'South Africa',
  UTC: 'Unknown',
}

export function countryFromTimezone(tz: string): string {
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz]
  const region = tz.split('/')[0]
  return region && region !== tz ? `Other (${region})` : 'Unknown'
}

/** Reads everything about the current visit that goes on an event. */
export function collectContext(): EventContext {
  const ua = navigator.userAgent
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  })()
  return {
    path: location.pathname,
    referrer: document.referrer,
    ...deriveSource(location.search, document.referrer, location.hostname),
    device: deriveDevice(ua, window.innerWidth),
    browser: deriveBrowser(ua),
    os: deriveOs(ua),
    language: navigator.language || 'unknown',
    timezone,
    country: countryFromTimezone(timezone),
    screen: `${screen.width}x${screen.height}`,
  }
}
