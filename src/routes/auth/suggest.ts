import { handleProblem } from '../../lib/handle'
import { LIMITS } from '../../lib/types'

/**
 * A page address suggested from a person's name: lowercase letters and digits only,
 * accents folded, everything else dropped. "The Design Square" becomes "thedesignsquare".
 * Returns '' when nothing usable is left (a name in another script, or too short).
 */
export function suggestHandle(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, LIMITS.handleMax)
  return handleProblem(slug) ? '' : slug
}
