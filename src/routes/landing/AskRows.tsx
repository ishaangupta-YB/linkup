import { LIMITS } from '../../lib/types'

const ASKS = [
  { q: 'How many links fit?', a: `Up to ${LIMITS.links}. Reorder by drag or keyboard.` },
  { q: 'Can a link rest for a while?', a: 'Hide it. It stays in your editor, off your page.' },
  { q: 'What if I delete the wrong one?', a: 'Undo brings it back. Duplicate makes a copy.' },
  { q: 'When do visitors see my edits?', a: 'Edits save as a draft until you publish.' },
]

/** Rows: the questions a creator asks first, the head block beside them. */
export function AskRows() {
  return (
    <section className="asks" aria-labelledby="asks-title">
      <div className="container asks__grid">
        <h2 id="asks-title" className="asks__title">
          Up to eight links, and an undo.
        </h2>
        <dl className="asks__rows">
          {ASKS.map((r) => (
            <div key={r.q} className="asks__row">
              <dt>{r.q}</dt>
              <dd>{r.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
