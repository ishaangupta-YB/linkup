import { useId, type CSSProperties } from 'react'
import { track } from '../../analytics'
import type { ButtonShape, ButtonStyle, Ground, Look, Tint } from '../../lib/types'
import { Segmented } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import type { SectionProps } from './types'

const GROUNDS: { value: Ground; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'green', label: 'Green' },
  { value: 'night', label: 'Night' },
]

const TINTS: { value: Tint; label: string }[] = [
  { value: 'mon', label: 'Rose' },
  { value: 'tue', label: 'Apricot' },
  { value: 'wed', label: 'Butter' },
  { value: 'thu', label: 'Mint' },
  { value: 'fri', label: 'Sky' },
  { value: 'sat', label: 'Lilac' },
  { value: 'sun', label: 'Orchid' },
]

const STYLES: { value: ButtonStyle; label: string }[] = [
  { value: 'moulded', label: 'Moulded' },
  { value: 'clear', label: 'Clear' },
  { value: 'label', label: 'Label' },
]

const SHAPES: { value: ButtonShape; label: string }[] = [
  { value: 'soft', label: 'Soft' },
  { value: 'pill', label: 'Pill' },
  { value: 'square', label: 'Square' },
]

export function LookSection({ draft, update, meta }: SectionProps) {
  const look = draft.look
  const tintName = useId()

  function set<K extends keyof Look>(field: K, value: Look[K]) {
    if (look[field] === value) return
    update((d) => ({ ...d, look: { ...d.look, [field]: value } }))
    track('look_changed', { field, value }, meta)
  }

  return (
    <section className="ed-section surface" aria-labelledby="ed-look">
      <h2 id="ed-look" className="ed-section__title">
        Look
      </h2>

      <div className="ed-look">
        <div className="ed-look__row">
          <span className="ed-look__label" aria-hidden="true">
            Ground
          </span>
          <Segmented label="Ground" options={GROUNDS} value={look.ground} onChange={(v) => set('ground', v)} />
        </div>

        <fieldset className="ed-look__row ed-tints">
          <legend className="ed-look__label">Button colour</legend>
          <div className="ed-tints__keys">
            {TINTS.map((t) => (
              <label key={t.value} className="ed-tint" style={{ '--t': `var(--p-${t.value})` } as CSSProperties}>
                <input type="radio" name={tintName} value={t.value} checked={look.tint === t.value} onChange={() => set('tint', t.value)} />
                <span className="ed-tint__key" aria-hidden="true">
                  <Icon name="check" size={16} className="ed-tint__check" />
                </span>
                <span className="ed-tint__name">{t.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="ed-look__row">
          <span className="ed-look__label" aria-hidden="true">
            Button style
          </span>
          <Segmented label="Button style" options={STYLES} value={look.buttonStyle} onChange={(v) => set('buttonStyle', v)} />
        </div>

        <div className="ed-look__row">
          <span className="ed-look__label" aria-hidden="true">
            Button shape
          </span>
          <Segmented label="Button shape" options={SHAPES} value={look.buttonShape} onChange={(v) => set('buttonShape', v)} />
        </div>
      </div>
    </section>
  )
}
