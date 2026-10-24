import avatar from '../assets/avatar.jpg'
import { newId } from './ids'
import type { Look, PageContent, SocialId } from './types'

export const DEFAULT_LOOK: Look = { ground: 'paper', tint: 'thu', buttonStyle: 'moulded', buttonShape: 'soft' }

export const EMPTY_SOCIALS: Record<SocialId, string> = { instagram: '', linkedin: '', youtube: '', whatsapp: '', x: '', website: '' }

/** A new page: the person's name and one empty link to fill. */
export function blankContent(name: string): PageContent {
  return {
    photo: null,
    name: name.trim().slice(0, 30),
    tagline: '',
    bio: '',
    location: '',
    links: [{ id: newId(), title: 'My first link', url: '', visible: true }],
    socials: { ...EMPTY_SOCIALS },
    look: { ...DEFAULT_LOOK },
  }
}

/** The demo account's page, carried over from the project's original sample profile. */
export function demoContent(): PageContent {
  return {
    photo: avatar,
    name: 'The Design Square',
    tagline: 'The डिज़AIन Square',
    bio: 'Design. AI. Gupshup. Building small squares for real connections.',
    location: 'Delhi NCR',
    links: [
      { id: 'demo-l1', title: 'Join the next Square', url: 'forms.gle/thedesignsquare-next', visible: true },
      { id: 'demo-l2', title: 'AI हैंड्स-ऑन वर्कशॉप recap', url: 'linkedin.com/posts/thedesignsquare', visible: true },
      { id: 'demo-l3', title: 'Read the founder story', url: 'linkedin.com/in/chetnagrover', visible: true },
      { id: 'demo-l4', title: 'Partner with us', url: 'thedesignsquare.in/partner', visible: true },
    ],
    socials: {
      instagram: '@thedesignsquare.in',
      linkedin: 'linkedin.com/in/chetnagrover',
      youtube: '@thedesignsquare',
      whatsapp: 'chat.whatsapp.com/the-square',
      x: '',
      website: 'thedesignsquare.in',
    },
    look: { ...DEFAULT_LOOK },
  }
}

export const DEMO_ACCOUNT = {
  email: 'demo@linkup.to',
  password: 'linkup-demo',
  name: 'The Design Square',
  handle: 'thedesignsquare',
}
