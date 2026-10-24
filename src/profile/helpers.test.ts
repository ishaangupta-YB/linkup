import { describe, expect, it } from 'vitest'
import { hostOf, initials, linkHref } from './helpers'

describe('linkHref', () => {
  it('adds https to bare domains and refuses unsafe or empty addresses', () => {
    expect(linkHref('example.com/a')).toBe('https://example.com/a')
    expect(linkHref('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(linkHref('javascript:alert(1)')).toBeNull()
    expect(linkHref('data:text/html,hi')).toBeNull()
    expect(linkHref('  ')).toBeNull()
  })
})

describe('initials', () => {
  it('takes the first and last word, or falls back to the handle', () => {
    expect(initials('The Design Square', 'x')).toBe('TS')
    expect(initials('mira', 'x')).toBe('M')
    expect(initials('  ', 'thedesignsquare')).toBe('T')
  })
})

describe('hostOf', () => {
  it('shows the site without www', () => {
    expect(hostOf('https://www.linkedin.com/in/x')).toBe('linkedin.com')
    expect(hostOf('tel:+911234567')).toBe('+911234567')
    expect(hostOf(null)).toBeNull()
  })
})
