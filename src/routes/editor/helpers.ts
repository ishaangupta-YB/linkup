import type { SaveStatus } from '../../lib/page'
import { hasProtocol } from '../../lib/url'

/** A copy of the list with the item at `from` moved to `to` (both clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice()
  if (from < 0 || from >= list.length) return next
  const target = Math.max(0, Math.min(list.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/** A copy of the list with `item` inserted at `index` (clamped to the end). */
export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const next = list.slice()
  next.splice(Math.max(0, Math.min(list.length, index)), 0, item)
  return next
}

/**
 * Where a dragged row lands: the number of other rows whose midpoint sits above the
 * dragged row's centre. `mids` are the midpoints of every row at drag start, in order.
 */
export function dropIndex(mids: readonly number[], from: number, centre: number): number {
  let index = 0
  mids.forEach((mid, i) => {
    if (i !== from && mid < centre) index++
  })
  return index
}

/** The square crop and output size for a profile photo: centred, at most `max` px a side. */
export function squareCrop(width: number, height: number, max: number) {
  const side = Math.min(width, height)
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) / 2),
    side,
    out: Math.max(1, Math.min(max, side)),
  }
}

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024

/** Why a chosen file cannot be a profile photo, or null when it can. */
export function photoProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'That file is not an image. Choose a JPEG, PNG, WebP or GIF.'
  if (file.size > PHOTO_MAX_BYTES) return 'That image is larger than 8 MB. Choose a smaller one.'
  return null
}

/** True when a typed address would gain from an explicit https:// (it has no scheme yet). */
export function needsProtocol(url: string) {
  const trimmed = url.trim()
  return trimmed.length > 0 && !hasProtocol(trimmed)
}

/** The few words beside the phone Preview button: what the draft is waiting on, or null when the live page matches it. */
export function draftStatus(published: boolean, unpublished: boolean, save: SaveStatus): { tone: 'error' | 'draft'; short: string } | null {
  if (save === 'error') return { tone: 'error', short: 'Not saved yet' }
  if (!published) return { tone: 'draft', short: 'Not published' }
  if (unpublished) return { tone: 'draft', short: 'Changes not live' }
  return null
}
