import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from './events'
import { csvCell, eventsToCsv, eventsToJson, exportFileName } from './export'

const event: AnalyticsEvent = {
  v: 1, id: 'e1', name: 'link_click', stream: 'page', ts: Date.UTC(2026, 9, 24, 10), anonymousId: 'a', userId: null, sessionId: 's', pageId: 'p', handle: 'h',
  props: { linkId: 'l1', title: 'Say "hi", then\nleave', position: 2 },
  context: { path: '/h', referrer: '', source: 'Instagram', medium: null, campaign: null, device: 'mobile', browser: 'Chrome', os: 'Android', language: 'en', timezone: 'Asia/Kolkata', country: 'India', screen: '1x1' },
}

describe('csv', () => {
  it('escapes quotes, commas and line breaks and guards formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell(null)).toBe('')
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(true)).toBe('true')
  })

  it('flattens props and context into columns', () => {
    const csv = eventsToCsv([event, { ...event, id: 'e2', props: { social: 'x' }, sample: true }])
    const [header, first, second] = csv.trim().split('\r\n')
    const cols = header.split(',')
    expect(cols).toContain('props.linkId')
    expect(cols).toContain('props.social')
    expect(cols).toContain('context.source')
    expect(cols.indexOf('time')).toBe(4)
    expect(first).toContain('"Say ""hi"", then\nleave"')
    expect(first).toContain('2026-10-24T10:00:00.000Z')
    expect(second.split(',')[cols.indexOf('sample')]).toBe('true')
  })

  it('writes JSON that reads back', () => {
    expect(JSON.parse(eventsToJson([event]))).toEqual([event])
  })

  it('names files after the page, range and date', () => {
    expect(exportFileName('the/design', '30d', 'csv', new Date(2026, 9, 24).getTime())).toBe('linkup-thedesign-30d-2026-10-24.csv')
  })
})
