import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { MyPageProvider, useMyPage } from './page'

api.setLatency(0)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let ctx: ReturnType<typeof useMyPage> | null = null
function Probe() {
  ctx = useMyPage()
  return null
}

async function mount() {
  const el = document.createElement('div')
  const root = createRoot(el)
  await act(async () => root.render(<MyPageProvider><Probe /></MyPageProvider>))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return root
}

beforeEach(async () => {
  localStorage.clear()
  await api.signUp({ name: 'Asha', email: 'a@b.co', password: '12345678' })
  await api.claimHandle('asha')
  await api.publish()
})
afterEach(() => vi.restoreAllMocks())

describe('MyPageProvider', () => {
  it('refuses to publish when the latest draft could not be saved', async () => {
    const root = await mount()
    vi.spyOn(api, 'saveDraft').mockRejectedValue(new api.ApiError('storage_full', 'This browser is out of storage space.'))
    act(() => ctx!.updateDraft((d) => ({ ...d, name: 'New name' })))
    await expect(act(() => ctx!.publish())).rejects.toThrow(/not saved yet, so nothing was published\. This browser is out of storage space/)
    await act(async () => {})
    expect((await api.getPublicPage('asha'))?.content.name).toBe('Asha')
    expect(ctx!.saveError).toMatch(/out of storage/)
    act(() => root.unmount())
  })

  it('writes the newest draft synchronously when the tab is hidden', async () => {
    const root = await mount()
    act(() => ctx!.updateDraft((d) => ({ ...d, bio: 'Typed just now' })))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect((await api.getMyPage())?.draft.bio).toBe('Typed just now')
    act(() => root.unmount())
  })

  it('publishes the latest edit after saving it', async () => {
    const root = await mount()
    act(() => ctx!.updateDraft((d) => ({ ...d, name: 'Asha Rao' })))
    await act(() => ctx!.publish())
    expect((await api.getPublicPage('asha'))?.content.name).toBe('Asha Rao')
    act(() => root.unmount())
  })
})
