import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextOnEnter, useKeepSubmitInView } from './formKeys'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

function Form() {
  const formRef = useRef<HTMLFormElement>(null)
  useKeepSubmitInView(formRef)
  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <input id="one" enterKeyHint="next" onKeyDown={nextOnEnter} />
      <input id="two" />
      <button type="submit">Go</button>
    </form>
  )
}

let host: HTMLDivElement
let root: Root
const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number }

beforeEach(async () => {
  vi.useFakeTimers()
  viewport.height = 740
  viewport.offsetTop = 0
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 })
  window.scrollBy = vi.fn() as typeof window.scrollBy
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<Form />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('nextOnEnter', () => {
  it('moves to the next field instead of submitting', () => {
    const one = host.querySelector<HTMLInputElement>('#one')!
    one.focus()
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    act(() => void one.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('two')
  })
})

describe('useKeepSubmitInView', () => {
  it('scrolls the submit button above the keyboard, keeping the field in view', () => {
    const two = host.querySelector<HTMLInputElement>('#two')!
    const button = host.querySelector('button')!
    two.getBoundingClientRect = () => rect(300, 44)
    button.getBoundingClientRect = () => rect(420, 44)
    // The keyboard takes the bottom 340px.
    viewport.height = 400
    act(() => two.focus())
    act(() => void vi.advanceTimersByTime(400))
    // The button's bottom (464) must clear 400 - 12; the field may rise up to 300 - 72.
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 76, behavior: expect.any(String) })
  })

  it('never scrolls the focused field out of the top', () => {
    const two = host.querySelector<HTMLInputElement>('#two')!
    const button = host.querySelector('button')!
    two.getBoundingClientRect = () => rect(100, 44)
    button.getBoundingClientRect = () => rect(600, 44)
    viewport.height = 400
    act(() => two.focus())
    act(() => void vi.advanceTimersByTime(400))
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 28, behavior: expect.any(String) })
  })

  it('does nothing while no keyboard is up', () => {
    const two = host.querySelector<HTMLInputElement>('#two')!
    const button = host.querySelector('button')!
    two.getBoundingClientRect = () => rect(600, 44)
    button.getBoundingClientRect = () => rect(900, 44)
    act(() => two.focus())
    act(() => void vi.advanceTimersByTime(400))
    expect(window.scrollBy).not.toHaveBeenCalled()
  })
})
