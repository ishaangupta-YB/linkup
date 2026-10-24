import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let show: ReturnType<typeof useToast> | null = null
function Probe() {
  show = useToast()
  return null
}

let root: Root
let el: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  el = document.createElement('div')
  document.body.append(el)
  root = createRoot(el)
  act(() => root.render(<ToastProvider><Probe /></ToastProvider>))
})
afterEach(() => {
  act(() => root.unmount())
  el.remove()
  vi.useRealTimers()
})

const toast = () => el.querySelector('.toast')
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('Toast', () => {
  it('keeps a toast with an action for 8 seconds', () => {
    act(() => show!({ message: 'Link removed.', action: { label: 'Undo', run: () => {} } }))
    advance(7900)
    expect(toast()).not.toBeNull()
    advance(200)
    expect(toast()).toBeNull()
  })

  it('keeps a plain message for 5 seconds and an error for 8', () => {
    act(() => show!({ message: 'Copied.' }))
    advance(5100)
    expect(toast()).toBeNull()
    act(() => show!({ message: 'Not saved.', tone: 'error' }))
    advance(5100)
    expect(toast()?.className).toContain('toast--error')
    advance(3000)
    expect(toast()).toBeNull()
  })

  it('pauses while focus is inside it and resumes after', () => {
    act(() => show!({ message: 'Link removed.', action: { label: 'Undo', run: () => {} } }))
    advance(6000)
    const undo = el.querySelector<HTMLButtonElement>('.toast__action')!
    act(() => undo.focus())
    advance(20_000)
    expect(toast()).not.toBeNull()
    act(() => undo.blur())
    advance(1900)
    expect(toast()).not.toBeNull()
    advance(200)
    expect(toast()).toBeNull()
  })

  it('pauses while a mouse is over it', () => {
    act(() => show!({ message: 'Saved.' }))
    const t = toast()!
    act(() => { t.dispatchEvent(Object.assign(new MouseEvent('pointerover', { bubbles: true }), { pointerType: 'mouse' })) })
    advance(10_000)
    expect(toast()).not.toBeNull()
    act(() => { t.dispatchEvent(Object.assign(new MouseEvent('pointerout', { bubbles: true }), { pointerType: 'mouse' })) })
    advance(5100)
    expect(toast()).toBeNull()
  })

  it('runs the action and closes', () => {
    const run = vi.fn()
    act(() => show!({ message: 'Link removed.', action: { label: 'Undo', run } }))
    act(() => el.querySelector<HTMLButtonElement>('.toast__action')!.click())
    expect(run).toHaveBeenCalledOnce()
    expect(toast()).toBeNull()
  })
})
