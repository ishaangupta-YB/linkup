/** The shared data model. Every screen and the demo backend speak these types. */

export type SocialId = 'instagram' | 'linkedin' | 'youtube' | 'whatsapp' | 'x' | 'website'

export const SOCIALS: { id: SocialId; label: string; placeholder: string }[] = [
  { id: 'instagram', label: 'Instagram', placeholder: '@yourname' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/yourname' },
  { id: 'youtube', label: 'YouTube', placeholder: '@yourchannel' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: 'wa.me/919800000000' },
  { id: 'x', label: 'X', placeholder: '@yourname' },
  { id: 'website', label: 'Website', placeholder: 'yourname.com' },
]

export type LinkItem = {
  id: string
  title: string
  url: string
  /** Hidden links stay in the editor but are left off the public page. */
  visible: boolean
}

/** The page ground: white paper, drenched pharmacy green, or night. */
export type Ground = 'paper' | 'green' | 'night'
/** The plastic tint behind the link buttons, named after the organiser's days. */
export type Tint = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type ButtonStyle = 'moulded' | 'clear' | 'label'
export type ButtonShape = 'soft' | 'pill' | 'square'

export type Look = {
  ground: Ground
  tint: Tint
  buttonStyle: ButtonStyle
  buttonShape: ButtonShape
}

export type PageContent = {
  /** A data URL (uploaded) or a bundled asset URL. Null shows initials. */
  photo: string | null
  name: string
  tagline: string
  bio: string
  location: string
  links: LinkItem[]
  socials: Record<SocialId, string>
  look: Look
}

export type Page = {
  id: string
  ownerId: string
  handle: string
  /** What the editor edits; autosaved. */
  draft: PageContent
  /** What /:handle serves. Null until the first publish. */
  published: PageContent | null
  publishedAt: number | null
  updatedAt: number
}

export type Account = {
  id: string
  email: string
  name: string
  createdAt: number
  settings: AccountSettings
}

export type AccountSettings = {
  /** Count the owner's own visits to their public page. Off by default. */
  countOwnVisits: boolean
}

/** What a visitor of /:handle receives: only the published content. */
export type PublicPage = {
  pageId: string
  handle: string
  content: PageContent
  publishedAt: number
}

export const LIMITS = {
  name: 30,
  tagline: 40,
  bio: 160,
  location: 30,
  linkTitle: 40,
  links: 8,
  handleMin: 3,
  handleMax: 30,
  passwordMin: 8,
}

export const SITE_HOST = 'linkup.to'
