import { describe, expect, it } from 'vitest'
import { suggestHandle } from './suggest'

describe('suggestHandle', () => {
  it('joins the words of a name', () => {
    expect(suggestHandle('The Design Square')).toBe('thedesignsquare')
  })
  it('folds accents and drops punctuation', () => {
    expect(suggestHandle('  Zoë Ândré-Smith! ')).toBe('zoeandresmith')
  })
  it('keeps digits', () => {
    expect(suggestHandle('Studio 54')).toBe('studio54')
  })
  it('caps the length at the handle maximum', () => {
    expect(suggestHandle('a'.repeat(50))).toHaveLength(30)
  })
  it('returns nothing when no usable letters are left', () => {
    expect(suggestHandle('डिज़ाइन')).toBe('')
    expect(suggestHandle('Al')).toBe('')
  })
  it('never suggests a reserved address', () => {
    expect(suggestHandle('Settings')).toBe('')
  })
})
