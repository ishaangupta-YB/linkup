import { useMemo, useState, type CSSProperties } from 'react'
import { DEMO_ACCOUNT, demoContent } from '../../lib/defaults'
import type { ButtonShape, ButtonStyle, Ground, Look, Tint } from '../../lib/types'
import { Segmented, type SegmentOption } from '../../ui/controls'
import { Phone } from './Phone'

const GROUNDS: SegmentOption<Ground>[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'green', label: 'Green' },
  { value: 'night', label: 'Night' },
]

const TINT_NAMES: Record<Tint, string> = { mon: 'Rose', tue: 'Apricot', wed: 'Butter', thu: 'Mint', fri: 'Sky', sat: 'Lilac', sun: 'Orchid' }
const TINTS: SegmentOption<Tint>[] = (Object.keys(TINT_NAMES) as Tint[]).map((t) => ({
  value: t,
  title: TINT_NAMES[t],
  label: (
    <>
      <span className="swatch" style={{ '--t': `var(--p-${t})` } as CSSProperties} aria-hidden="true" />
      <span className="visually-hidden">{TINT_NAMES[t]}</span>
    </>
  ),
}))

const STYLES: SegmentOption<ButtonStyle>[] = [
  { value: 'moulded', label: 'Moulded' },
  { value: 'clear', label: 'Clear' },
  { value: 'label', label: 'Label' },
]

const SHAPES: SegmentOption<ButtonShape>[] = [
  { value: 'soft', label: 'Soft' },
  { value: 'pill', label: 'Pill' },
  { value: 'square', label: 'Square' },
]

/** A first step in a tray: the look controls on sunken plastic, the real page beside them answering live. */
export function LookTray() {
  const base = useMemo(() => demoContent(), [])
  const [look, setLook] = useState<Look>(base.look)
  const set =
    <K extends keyof Look>(key: K) =>
    (value: Look[K]) =>
      setLook((l) => ({ ...l, [key]: value }))
  const content = useMemo(() => ({ ...base, look }), [base, look])

  return (
    <section className="looks" aria-labelledby="looks-title">
      <div className="container looks__grid">
        <div className="looks__side">
          <div className="looks__head">
            <h2 id="looks-title">Three grounds, seven tints, nine buttons.</h2>
            <p className="lead">Every page is made of the same parts. Try them on the demo page.</p>
          </div>
          <div className="looks__tray plastic">
            <div className="looks__row">
              <span className="looks__label" aria-hidden="true">
                Ground
              </span>
              <Segmented label="Ground" options={GROUNDS} value={look.ground} onChange={set('ground')} />
            </div>
            <div className="looks__row">
              <span className="looks__label" aria-hidden="true">
                Tint <span className="looks__value">{TINT_NAMES[look.tint]}</span>
              </span>
              <Segmented label="Tint" options={TINTS} value={look.tint} onChange={set('tint')} className="looks__tints" />
            </div>
            <div className="looks__row">
              <span className="looks__label" aria-hidden="true">
                Buttons
              </span>
              <Segmented label="Button style" options={STYLES} value={look.buttonStyle} onChange={set('buttonStyle')} />
            </div>
            <div className="looks__row">
              <span className="looks__label" aria-hidden="true">
                Shape
              </span>
              <Segmented label="Button shape" options={SHAPES} value={look.buttonShape} onChange={set('buttonShape')} />
            </div>
          </div>
        </div>
        <div className="looks__stage">
          <Phone className="looks__phone" content={content} handle={DEMO_ACCOUNT.handle} label="The demo page with the look you picked, scrollable" />
        </div>
      </div>
    </section>
  )
}
