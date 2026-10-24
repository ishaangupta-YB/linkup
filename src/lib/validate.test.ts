import { describe, expect, it } from 'vitest'
import { blankContent, demoContent } from './defaults'
import { LIMITS, type PageContent } from './types'
import { contentProblem, dataUrlBytes, isUnsafeUrl, normaliseContent, normaliseText, photoValueProblem } from './validate'

function content(patch: Partial<PageContent> = {}): PageContent {
  return { ...blankContent('Asha'), ...patch }
}

describe('normaliseText', () => {
  it('trims, strips control characters and collapses whitespace on one line', () => {
    expect(normaliseText('  Hello\u0000  \t world\n ', 40)).toBe('Hello world')
    expect(normaliseText('a‮b', 40)).toBe('ab')
    expect(normaliseText(undefined, 40)).toBe('')
    expect(normaliseText(42, 40)).toBe('42')
  })

  it('keeps line breaks in multiline text, at most one blank line', () => {
    expect(normaliseText('one  \r\n\r\n\r\n\ntwo\u0007', 160, { multiline: true })).toBe('one\n\ntwo')
  })

  it('clamps without splitting a surrogate pair or leaving a trailing space', () => {
    expect(normaliseText('abcdefgh', 5)).toBe('abcde')
    expect(normaliseText('abcd😀', 5)).toBe('abcd')
    expect(normaliseText('abcd efgh', 5)).toBe('abcd')
  })

  it('keeps joiners that scripts and emoji need', () => {
    expect(normaliseText('डिज़AIन', 40)).toBe('डिज़AIन'.normalize('NFC'))
    expect(normaliseText('👩‍💻', 40)).toBe('👩‍💻')
  })
})

describe('normaliseContent', () => {
  it('clamps every field to LIMITS and drops unknown keys', () => {
    const long = 'x'.repeat(500)
    const out = normaliseContent({
      ...content({ name: long, tagline: long, bio: long, location: long, links: [{ id: 'a', title: long, url: ' example.com ', visible: true }] }),
      extra: 'dropped',
    } as PageContent)
    expect(out.name).toHaveLength(LIMITS.name)
    expect(out.tagline).toHaveLength(LIMITS.tagline)
    expect(out.bio).toHaveLength(LIMITS.bio)
    expect(out.location).toHaveLength(LIMITS.location)
    expect(out.links[0].title).toHaveLength(LIMITS.linkTitle)
    expect(out.links[0].url).toBe('example.com')
    expect('extra' in out).toBe(false)
  })

  it('fills missing pieces and resets unknown look values', () => {
    const out = normaliseContent({ name: 'A', links: [{ title: 'T' }], look: { ground: 'neon' } } as unknown as PageContent)
    expect(out.socials.instagram).toBe('')
    expect(out.look).toEqual({ ground: 'paper', tint: 'thu', buttonStyle: 'moulded', buttonShape: 'soft' })
    expect(out.links[0]).toEqual({ id: 'link-1', title: 'T', url: '', visible: true })
  })

  it('gives duplicate link ids a unique one, deterministically', () => {
    const links = [
      { id: 'a', title: '1', url: '', visible: true },
      { id: 'a', title: '2', url: '', visible: false },
    ]
    const once = normaliseContent(content({ links }))
    expect(new Set(once.links.map((l) => l.id)).size).toBe(2)
    expect(normaliseContent(once)).toEqual(once)
    expect(normaliseContent(content({ links }))).toEqual(once)
  })

  it('is idempotent on the demo page', () => {
    const demo = demoContent()
    expect(normaliseContent(normaliseContent(demo))).toEqual(normaliseContent(demo))
    expect(normaliseContent(demo).tagline).toBe(demo.tagline)
  })
})

describe('contentProblem', () => {
  it('accepts an ordinary page', () => {
    expect(contentProblem(demoContent())).toBeNull()
    expect(contentProblem(content({ links: [{ id: 'a', title: 'Mail', url: 'mailto:me@example.com', visible: true }] }))).toBeNull()
  })

  it('refuses script and data addresses in links and socials', () => {
    expect(contentProblem(content({ links: [{ id: 'a', title: 'Bad', url: 'javascript:alert(1)', visible: true }] }))).toMatch(/“Bad”.*https:\/\//)
    expect(contentProblem(content({ links: [{ id: 'a', title: '', url: ' DATA:text/html,hi', visible: true }] }))).toMatch(/number 1/)
    expect(contentProblem(content({ socials: { ...blankContent('A').socials, website: 'javascript:alert(1)' } }))).toMatch(/Website/)
    expect(isUnsafeUrl('vbscript:x')).toBe(true)
    expect(isUnsafeUrl('example.com/a:b')).toBe(false)
    expect(isUnsafeUrl('')).toBe(false)
  })

  it('refuses more links than a page holds', () => {
    const links = Array.from({ length: LIMITS.links + 1 }, (_, i) => ({ id: `l${i}`, title: 'T', url: '', visible: true }))
    expect(contentProblem(content({ links }))).toMatch(/8 links at most/)
  })

  it('caps the photo size and refuses non-image data', () => {
    const small = `data:image/jpeg;base64,${'A'.repeat(1000)}`
    const large = `data:image/jpeg;base64,${'A'.repeat(Math.ceil((LIMITS.photoBytes * 4) / 3) + 8)}`
    expect(photoValueProblem(small)).toBeNull()
    expect(dataUrlBytes(large)).toBeGreaterThan(LIMITS.photoBytes)
    expect(photoValueProblem(large)).toMatch(/under 400 KB/)
    expect(photoValueProblem('data:text/html;base64,PHNjcmlwdD4=')).toMatch(/JPEG, PNG/)
    expect(photoValueProblem('javascript:alert(1)')).toMatch(/image file/)
    expect(photoValueProblem('/assets/avatar.jpg')).toBeNull()
    expect(photoValueProblem(null)).toBeNull()
    expect(contentProblem(content({ photo: large }))).toMatch(/too large/)
  })
})
