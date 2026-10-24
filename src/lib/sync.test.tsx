import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { AuthProvider, RequireAuth, useAuth } from './auth'
import { MyPageProvider, SIGNED_OUT_SAVE_MESSAGE, useMyPage } from './page'
import { hasRescuedDraft } from './rescue'
import { ToastProvider } from '../ui/Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let my: ReturnType<typeof useMyPage> | null = null
let auth: ReturnType<typeof useAuth> | null = null
function PageProbe() {
  my = useMyPage()
  return null
}
function AuthProbe({ children }: { children?: ReactNode }) {
  auth = useAuth()
  return <>{children}</>
}

const roots: Root[] = []
async function render(node: ReactNode) {
  const root = createRoot(document.createElement('div'))
  roots.push(root)
  await act(async () => root.render(node))
  await settle()
  return root
}
async function settle(ms = 10) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}
/** What another tab does: write through the API, then the browser fires a storage event here. */
function otherTabWrote(key = api.DB_KEY) {
  window.dispatchEvent(new StorageEvent('storage', { key }))
}

beforeEach(async () => {
  api.setLatency(0)
  localStorage.clear()
  await api.signUp({ name: 'Asha', email: 'a@b.co', password: '12345678' })
  await api.claimHandle('asha')
})
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  vi.restoreAllMocks()
  api.setLatency(0)
})

describe('MyPageProvider across tabs', () => {
  it('shows a draft saved in another tab when this tab has no edits of its own', async () => {
    await render(<MyPageProvider><PageProbe /></MyPageProvider>)
    const before = my!.page!
    await api.saveDraft({ ...before.draft, bio: 'Saved in tab B' })
    otherTabWrote()
    await settle()
    expect(my!.page!.draft.bio).toBe('Saved in tab B')
    // Its next edit is based on what tab B stored, so it saves without a conflict.
    act(() => my!.updateDraft((d) => ({ ...d, name: 'Asha Rao' })))
    await act(() => my!.flush())
    expect(my!.conflict).toBe(false)
    expect((await api.getMyPage())?.draft).toMatchObject({ bio: 'Saved in tab B', name: 'Asha Rao' })
  })

  it('never overwrites a newer draft from another tab, and reload shows it', async () => {
    await render(<MyPageProvider><PageProbe /></MyPageProvider>)
    const loaded = my!.page!
    act(() => my!.updateDraft((d) => ({ ...d, bio: 'Typed in tab A' })))
    // Tab B saves while tab A's edit is still pending; tab A keeps what it typed on screen.
    await api.saveDraft({ ...loaded.draft, bio: 'Saved in tab B' })
    otherTabWrote()
    await settle()
    expect(my!.page!.draft.bio).toBe('Typed in tab A')

    expect(await act(() => my!.flush())).toBe(false)
    expect(my!.conflict).toBe(true)
    expect(my!.saveStatus).toBe('error')
    expect(my!.saveError).toBe(api.CONFLICT_MESSAGE)
    expect((await api.getMyPage())?.draft.bio).toBe('Saved in tab B')

    // Closing the tab does not sneak it in either.
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect((await api.getMyPage())?.draft.bio).toBe('Saved in tab B')
    await expect(act(() => my!.publish())).rejects.toThrow(/not saved yet/)

    act(() => my!.reload())
    await settle()
    expect(my!.conflict).toBe(false)
    expect(my!.saveStatus).toBe('saved')
    expect(my!.page!.draft.bio).toBe('Saved in tab B')
  })

  it('does not mistake its own save from a hidden tab for another tab', async () => {
    await render(<MyPageProvider><PageProbe /></MyPageProvider>)
    api.setLatency(40)
    act(() => my!.updateDraft((d) => ({ ...d, bio: 'first' })))
    let flushed!: Promise<boolean>
    act(() => {
      flushed = my!.flush()
    })
    // While "first" is in flight, a newer edit arrives and the tab is hidden: it is written at once.
    act(() => my!.updateDraft((d) => ({ ...d, bio: 'second' })))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect((await api.getMyPage())?.draft.bio).toBe('second')
    await act(async () => {
      await flushed
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(my!.conflict).toBe(false)
    expect(my!.saveStatus).toBe('saved')
    api.setLatency(0)
    expect((await api.getMyPage())?.draft.bio).toBe('second')
  })

  it('does not retry a draft the server refused, and says why', async () => {
    await render(<MyPageProvider><PageProbe /></MyPageProvider>)
    const spy = vi.spyOn(api, 'saveDraft')
    act(() => my!.updateDraft((d) => ({ ...d, links: [{ id: 'x', title: 'Bad', url: 'javascript:alert(1)', visible: true }] })))
    expect(await act(() => my!.flush())).toBe(false)
    expect(my!.saveError).toMatch(/“Bad”/)
    await settle(50)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('counts trimmed whitespace as published, not as an unpublished change', async () => {
    await render(<MyPageProvider><PageProbe /></MyPageProvider>)
    act(() => my!.updateDraft((d) => ({ ...d, name: 'Asha ' })))
    await act(() => my!.publish())
    expect(my!.page!.draft.name).toBe('Asha ')
    expect(my!.hasUnpublishedChanges).toBe(false)
  })
})

describe('AuthProvider across tabs', () => {
  it('follows a sign-out and a sign-in made in another tab', async () => {
    await render(<AuthProvider><AuthProbe /></AuthProvider>)
    await settle(50)
    expect(auth!.status).toBe('signedIn')
    await api.signOut()
    otherTabWrote(api.SESSION_KEY)
    await settle()
    expect(auth!.status).toBe('signedOut')
    expect(auth!.signedOutReason).toBe('elsewhere')
    await api.signIn({ email: 'a@b.co', password: '12345678' })
    otherTabWrote(api.SESSION_KEY)
    await settle()
    expect(auth!.status).toBe('signedIn')
    expect(auth!.account?.email).toBe('a@b.co')
  })

  it('a save that finds no session signs the tab out and keeps the draft for after sign-in', async () => {
    const root = await render(
      <AuthProvider>
        <AuthProbe>
          <MyPageProvider><PageProbe /></MyPageProvider>
        </AuthProbe>
      </AuthProvider>,
    )
    await settle(50)
    expect(my!.status).toBe('ready')
    // The session disappears without this tab hearing about it.
    localStorage.removeItem(api.SESSION_KEY)
    act(() => my!.updateDraft((d) => ({ ...d, bio: 'Typed while signed out' })))
    expect(await act(() => my!.flush())).toBe(false)
    expect(my!.saveError).toBe(SIGNED_OUT_SAVE_MESSAGE)
    await settle()
    expect(auth!.status).toBe('signedOut')
    expect(auth!.signedOutReason).toBe('expired')

    // The guard unmounts the editor; the draft is kept in memory, not lost.
    await act(async () => root.render(<AuthProvider><AuthProbe /></AuthProvider>))
    expect(hasRescuedDraft()).toBe(true)
    await act(() => auth!.signIn({ email: 'a@b.co', password: '12345678' }))
    await act(async () =>
      root.render(
        <AuthProvider>
          <AuthProbe>
            <MyPageProvider><PageProbe /></MyPageProvider>
          </AuthProbe>
        </AuthProvider>,
      ),
    )
    await settle(50)
    expect(my!.page!.draft.bio).toBe('Typed while signed out')
    expect(hasRescuedDraft()).toBe(false)
    await act(() => my!.flush())
    expect((await api.getMyPage())?.draft.bio).toBe('Typed while signed out')
  })

  it('a deliberate sign-out keeps nothing for the next person', async () => {
    const root = await render(
      <AuthProvider>
        <AuthProbe>
          <MyPageProvider><PageProbe /></MyPageProvider>
        </AuthProbe>
      </AuthProvider>,
    )
    await settle(50)
    vi.spyOn(api, 'saveDraftSync').mockImplementation(() => {
      throw new api.ApiError('storage_full', 'full')
    })
    act(() => my!.updateDraft((d) => ({ ...d, bio: 'Do not keep' })))
    await act(() => auth!.signOut())
    await act(async () => root.render(<AuthProvider><AuthProbe /></AuthProvider>))
    expect(hasRescuedDraft()).toBe(false)
  })

  it('the guard sends a signed-out tab to /signin with the reason', async () => {
    function SignIn() {
      const location = useLocation()
      return <p id="signin">{(location.state as { message?: string } | null)?.message ?? 'no message'}</p>
    }
    const el = document.createElement('div')
    document.body.append(el)
    const root = createRoot(el)
    roots.push(root)
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/app/editor']}>
          <ToastProvider>
            <AuthProvider>
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/app/editor" element={<RequireAuth><p id="editor">editor</p></RequireAuth>} />
              </Routes>
            </AuthProvider>
          </ToastProvider>
        </MemoryRouter>,
      ),
    )
    await settle(80)
    expect(el.querySelector('#editor')).not.toBeNull()
    await api.signOut()
    otherTabWrote(api.SESSION_KEY)
    await settle()
    expect(el.querySelector('#signin')?.textContent).toBe('You signed out in another tab.')
    expect(el.querySelector('.toast')?.textContent).toMatch(/signed out in another tab/)
    el.remove()
  })
})
