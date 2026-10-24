import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as api from '../lib/api'
import { AuthProvider, RequireAuth } from '../lib/auth'
import { useMyPage } from '../lib/page'
import { ToastProvider } from '../ui/Toast'
import { AppShell } from './AppShell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function EditProbe() {
  const my = useMyPage()
  return (
    <button id="edit" type="button" onClick={() => my.updateDraft((d) => ({ ...d, bio: 'Typed here' }))}>
      edit
    </button>
  )
}

let root: Root
let el: HTMLDivElement
const settle = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T & HTMLElement>(sel)
const key = (target: Element, k: string) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const accountButton = () => q<HTMLButtonElement>('button[aria-label="Account menu"]')!

beforeEach(async () => {
  api.setLatency(0)
  localStorage.clear()
  await api.signUp({ name: 'Asha Rao', email: 'asha@example.com', password: '12345678' })
  await api.claimHandle('asha')
  el = document.createElement('div')
  document.body.append(el)
  root = createRoot(el)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/app/editor']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route path="editor" element={<EditProbe />} />
                <Route path="settings" element={<p id="settings">settings</p>} />
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    ),
  )
  await settle(120)
})
afterEach(() => {
  act(() => root.unmount())
  el.remove()
})

describe('AppShell', () => {
  it('shows the save state and one publish action per bar', () => {
    expect(q('.save-state')?.textContent).toBe('Saved')
    expect(q('.save-state')?.getAttribute('aria-live')).toBe('polite')
    expect(q('.topbar__publish')?.textContent).toBe('Publish')
    expect(q('.tabbar__publish')?.textContent).toBe('Publish')
  })

  it('opens the account menu with who is signed in, and works from the keyboard', async () => {
    const button = accountButton()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.textContent).toBe('AR')
    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(q('.menu__panel--account .menu__head')?.textContent).toBe('Asha Raoasha@example.com')
    const items = Array.from(el.querySelectorAll<HTMLElement>('.menu__panel--account [role="menuitem"]'))
    expect(items.map((i) => i.textContent)).toEqual(['Settings', 'Sign out'])
    expect(document.activeElement).toBe(items[0])
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(items[1])
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(items[0])
    key(document.activeElement!, 'End')
    expect(document.activeElement).toBe(items[1])
    key(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(items[0])
    key(document.activeElement!, 'Escape')
    expect(q('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('opens on ArrowUp at the last item, and closes on a tap outside', () => {
    const button = accountButton()
    key(button, 'ArrowUp')
    expect(document.activeElement?.textContent).toBe('Sign out')
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(q('[role="menu"]')).toBeNull()
  })

  it('goes to settings from the menu', async () => {
    act(() => accountButton().click())
    act(() => q<HTMLAnchorElement>('.menu__panel--account a[role="menuitem"]')!.click())
    await settle()
    expect(q('#settings')).not.toBeNull()
  })

  it('offers the page address in a menu', () => {
    const chip = q<HTMLButtonElement>('.addr-chip')!
    expect(chip.textContent).toBe('linkup.to/asha')
    act(() => chip.click())
    expect(q('.menu__panel--address .menu__sub')?.textContent).toBe('Not published yet')
    const open = q<HTMLAnchorElement>('.menu__panel--address a[role="menuitem"]')!
    expect(open.getAttribute('href')).toBe('/asha')
    expect(open.getAttribute('target')).toBe('_blank')
  })

  it('shows a conflict with a reload, and the reason on the save state', async () => {
    const page = (await api.getMyPage())!
    act(() => q<HTMLButtonElement>('#edit')!.click())
    // Another tab saves first.
    await api.saveDraft({ ...page.draft, bio: 'From the other tab' })
    await settle(800)
    const notice = q('.shell__notice')!
    expect(notice.getAttribute('role')).toBe('alert')
    expect(notice.textContent).toContain(api.CONFLICT_MESSAGE)
    const state = q<HTMLButtonElement>('.save-state__btn')!
    expect(state.textContent).toBe('Not saved')
    expect(state.title).toBe(api.CONFLICT_MESSAGE)
    act(() => notice.querySelector('button')!.click())
    await settle()
    expect(q('.shell__notice')).toBeNull()
    expect(q('.save-state')?.textContent).toBe('Saved')
    expect((await api.getMyPage())?.draft.bio).toBe('From the other tab')
  })
})
