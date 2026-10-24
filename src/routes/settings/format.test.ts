import { describe, expect, it } from 'vitest'
import { formatStamp } from './format'

describe('formatStamp', () => {
  it('writes the date then the 24-hour time', () => {
    expect(formatStamp(Date.UTC(2026, 9, 24, 14, 5), 'en-GB', 'UTC')).toBe('24 Oct 2026, 14:05')
  })
  it('pads the hour', () => {
    expect(formatStamp(Date.UTC(2026, 0, 3, 8, 0), 'en-GB', 'UTC')).toBe('3 Jan 2026, 08:00')
  })
})
