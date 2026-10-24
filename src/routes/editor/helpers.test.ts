import { describe, expect, it } from 'vitest'
import { dropIndex, insertAt, moveItem, needsProtocol, photoProblem, squareCrop } from './helpers'

describe('moveItem', () => {
  it('moves down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('clamps the target and ignores a bad source', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
    expect(moveItem(['a', 'b'], 0, -3)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
  it('does not mutate the input', () => {
    const list = ['a', 'b']
    moveItem(list, 0, 1)
    expect(list).toEqual(['a', 'b'])
  })
})

describe('insertAt', () => {
  it('restores an item at its old index, or at the end when the list shrank', () => {
    expect(insertAt(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c'])
    expect(insertAt(['a'], 4, 'b')).toEqual(['a', 'b'])
  })
})

describe('dropIndex', () => {
  const mids = [20, 80, 140, 200]
  it('stays put with no movement', () => {
    expect(dropIndex(mids, 1, 80)).toBe(1)
  })
  it('lands past the rows whose midpoint it crossed', () => {
    expect(dropIndex(mids, 0, 150)).toBe(2)
    expect(dropIndex(mids, 3, 10)).toBe(0)
    expect(dropIndex(mids, 0, 999)).toBe(3)
  })
})

describe('squareCrop', () => {
  it('centres a landscape photo and caps the size', () => {
    expect(squareCrop(2000, 1000, 512)).toEqual({ sx: 500, sy: 0, side: 1000, out: 512 })
  })
  it('never scales a small photo up', () => {
    expect(squareCrop(300, 400, 512)).toEqual({ sx: 0, sy: 50, side: 300, out: 300 })
  })
})

describe('photoProblem', () => {
  it('accepts images up to 8 MB', () => {
    expect(photoProblem({ type: 'image/png', size: 8 * 1024 * 1024 })).toBeNull()
  })
  it('refuses other files and big ones', () => {
    expect(photoProblem({ type: 'application/pdf', size: 10 })).toMatch(/not an image/)
    expect(photoProblem({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).toMatch(/8 MB/)
  })
})

describe('needsProtocol', () => {
  it('flags bare domains only', () => {
    expect(needsProtocol('example.com')).toBe(true)
    expect(needsProtocol('https://example.com')).toBe(false)
    expect(needsProtocol('mailto:a@b.co')).toBe(false)
    expect(needsProtocol('  ')).toBe(false)
  })
})
