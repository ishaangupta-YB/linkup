import { beforeEach, describe, expect, it } from 'vitest'
import * as api from './api'
import { blankContent } from './defaults'
import type { PageContent } from './types'

api.setLatency(0)
beforeEach(() => localStorage.clear())

async function newPage() {
  await api.signUp({ name: 'Asha', email: 'a@b.co', password: '12345678' })
  return api.claimHandle('asha')
}

/** A database as version 1 of the app wrote it, with a page missing fields later builds add. */
function v1Db() {
  const draft = { photo: null, name: 'Old Name', tagline: 'Old tagline', bio: 'Old bio', location: '', links: [{ id: 'l1', title: 'Old link', url: 'example.com' }], socials: { instagram: '@old' }, look: { ground: 'night' } }
  return {
    version: 1,
    accounts: [{ id: 'acct-1', email: 'old@b.co', name: 'Old', createdAt: 1, salt: 's', hash: 'h' }],
    pages: [{ id: 'page-1', ownerId: 'acct-1', handle: 'oldpage', draft, published: draft, publishedAt: 5, updatedAt: 7 }],
    sessions: { tok: 'acct-1', stale: 'acct-gone' },
  }
}

describe('database versions', () => {
  it('migrates a version 1 database without losing anything', async () => {
    localStorage.setItem(api.LEGACY_DB_KEY, JSON.stringify(v1Db()))
    const pub = await api.getPublicPage('oldpage')
    expect(pub?.content.name).toBe('Old Name')
    expect(pub?.content.links[0]).toEqual({ id: 'l1', title: 'Old link', url: 'example.com', visible: true })
    expect(pub?.content.socials).toMatchObject({ instagram: '@old', youtube: '' })
    expect(pub?.content.look).toEqual({ ground: 'night', tint: 'thu', buttonStyle: 'moulded', buttonShape: 'soft' })

    const stored = JSON.parse(localStorage.getItem(api.DB_KEY)!)
    expect(stored.version).toBe(api.DB_VERSION)
    expect(stored.pages[0].draftUpdatedAt).toBe(7)
    expect(stored.pages[0].publishedAt).toBe(5)
    expect(stored.accounts[0]).toMatchObject({ email: 'old@b.co', salt: 's', hash: 'h', settings: { countOwnVisits: false } })
    expect(stored.sessions).toEqual({ tok: 'acct-1' })
  })

  it('keeps a signed-in version 1 user signed in with their draft', async () => {
    localStorage.setItem(api.LEGACY_DB_KEY, JSON.stringify(v1Db()))
    localStorage.setItem(api.SESSION_KEY, JSON.stringify('tok'))
    const page = await api.getMyPage()
    expect(page?.draft.bio).toBe('Old bio')
    expect(page?.draftUpdatedAt).toBe(7)
  })

  it('never writes the version 1 key, so a tab on an older build cannot wipe migrated data', async () => {
    const legacy = JSON.stringify(v1Db())
    localStorage.setItem(api.LEGACY_DB_KEY, legacy)
    expect((await api.getPublicPage('oldpage'))?.content.name).toBe('Old Name')
    expect(localStorage.getItem(api.LEGACY_DB_KEY)).toBe(legacy)
    // The older build signs out and saves an empty version 1 database over its own key.
    localStorage.setItem(api.LEGACY_DB_KEY, JSON.stringify({ version: 1, accounts: [], pages: [], sessions: {} }))
    expect((await api.getPublicPage('oldpage'))?.content.name).toBe('Old Name')
  })

  it('migrateDb leaves a current database as it is and refuses what it cannot read', () => {
    const current = { version: api.DB_VERSION, accounts: [], pages: [], sessions: {} }
    expect(api.migrateDb(current)).toBe(current)
    expect(api.migrateDb({ version: 99, accounts: [], pages: [] })).toBeNull()
    expect(api.migrateDb('nope')).toBeNull()
    expect(api.migrateDb(null)).toBeNull()
  })

  it('keeps an unreadable database aside instead of overwriting it', async () => {
    localStorage.setItem(api.DB_KEY, '{"version": 99, "accounts": [], "pages": [], "future": true}')
    await newPage()
    expect(JSON.parse(JSON.parse(localStorage.getItem(api.DB_BACKUP_KEY)!))).toMatchObject({ version: 99, future: true })
    expect(JSON.parse(localStorage.getItem(api.DB_KEY)!).version).toBe(api.DB_VERSION)
  })

  it('keeps corrupt text aside too', async () => {
    localStorage.setItem(api.DB_KEY, '{not json')
    expect(await api.getSession()).toBeNull()
    expect(JSON.parse(localStorage.getItem(api.DB_BACKUP_KEY)!)).toBe('{not json')
  })
})

describe('saving a draft', () => {
  it('normalises text and clamps it to the limits', async () => {
    const page = await newPage()
    const saved = await api.saveDraft({ ...page.draft, name: '  Asha\u0000   Rao  ', bio: 'b'.repeat(400) })
    expect(saved.draft.name).toBe('Asha Rao')
    expect(saved.draft.bio).toHaveLength(160)
    expect((await api.getMyPage())?.draft.name).toBe('Asha Rao')
  })

  it('refuses unsafe link addresses, oversized photos and too many links', async () => {
    const page = await newPage()
    const bad = (patch: Partial<PageContent>) => api.saveDraft({ ...page.draft, ...patch })
    await expect(bad({ links: [{ id: 'a', title: 'x', url: 'javascript:alert(1)', visible: true }] })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(bad({ links: [{ id: 'a', title: 'x', url: 'data:text/html,<b>', visible: true }] })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(bad({ photo: `data:image/png;base64,${'A'.repeat(600_000)}` })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/too large/) })
    await expect(bad({ links: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, title: 't', url: '', visible: true })) })).rejects.toMatchObject({ code: 'invalid_input' })
    expect((await api.getMyPage())?.draft).toEqual(page.draft)
  })

  it('stamps every save later than the one before', async () => {
    const page = await newPage()
    const a = await api.saveDraft({ ...page.draft, bio: '1' })
    const b = await api.saveDraft({ ...page.draft, bio: '2' })
    expect(b.draftUpdatedAt!).toBeGreaterThan(a.draftUpdatedAt!)
  })

  it('refuses a save based on an older draft instead of overwriting it', async () => {
    const page = await newPage()
    // Tab A and tab B both loaded `page`. B saves first.
    const fromB = await api.saveDraft({ ...page.draft, bio: 'From tab B' }, { basedOn: page.draftUpdatedAt })
    await expect(api.saveDraft({ ...page.draft, bio: 'From tab A' }, { basedOn: page.draftUpdatedAt })).rejects.toMatchObject({ code: 'conflict', message: api.CONFLICT_MESSAGE })
    expect((await api.getMyPage())?.draft.bio).toBe('From tab B')
    // Based on what B stored, A may save.
    await api.saveDraft({ ...page.draft, bio: 'A again' }, { basedOn: fromB.draftUpdatedAt })
    expect((await api.getMyPage())?.draft.bio).toBe('A again')
    // Without basedOn the save is unconditional, as before.
    await api.saveDraft({ ...page.draft, bio: 'anyway' })
    expect((await api.getMyPage())?.draft.bio).toBe('anyway')
  })

  it('refuses a draft meant for another page', async () => {
    const page = await newPage()
    expect(() => api.saveDraftSync(page.draft, { pageId: 'someone-else' })).toThrow(expect.objectContaining({ code: 'conflict' }))
  })

  it('does not count a publish or an address change as a draft edit', async () => {
    const page = await newPage()
    await api.publish()
    await api.claimHandle('asha2')
    await expect(api.saveDraft({ ...page.draft, bio: 'ok' }, { basedOn: page.draftUpdatedAt })).resolves.toMatchObject({ handle: 'asha2' })
  })

  it('checks an old unchecked draft again before publishing it', async () => {
    const page = await newPage()
    const db = JSON.parse(localStorage.getItem(api.DB_KEY)!)
    db.pages[0].draft = { ...blankContent('A'), links: [{ id: 'x', title: 'x', url: 'javascript:alert(1)', visible: true }] }
    localStorage.setItem(api.DB_KEY, JSON.stringify(db))
    await expect(api.publish()).rejects.toMatchObject({ code: 'invalid_input' })
    expect(page.published).toBeNull()
    expect(await api.getPublicPage('asha')).toBeNull()
  })
})

describe('account writes', () => {
  it('cleans names and bounds emails and passwords', async () => {
    const account = await api.signUp({ name: '  Asha\u0007  Rao ', email: 'a@b.co', password: '12345678' })
    expect(account.name).toBe('Asha Rao')
    await expect(api.updateAccount({ name: ' \u0000 ' })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(api.updateAccount({ email: `${'a'.repeat(250)}@b.co` })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(api.changePassword('12345678', 'x'.repeat(300))).rejects.toMatchObject({ code: 'invalid_input' })
    const updated = await api.updateAccount({ settings: { countOwnVisits: true, sneaky: 1 } as never })
    expect(updated.settings).toEqual({ countOwnVisits: true })
  })
})

describe('other tabs', () => {
  it('reports database and session changes made by another tab', () => {
    const seen: { db: boolean; session: boolean }[] = []
    const off = api.onExternalChange((c) => seen.push(c))
    window.dispatchEvent(new StorageEvent('storage', { key: api.DB_KEY }))
    window.dispatchEvent(new StorageEvent('storage', { key: api.SESSION_KEY }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'linkup:events' }))
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    off()
    window.dispatchEvent(new StorageEvent('storage', { key: api.DB_KEY }))
    expect(seen).toEqual([
      { db: true, session: false },
      { db: false, session: true },
      { db: true, session: true },
    ])
  })
})
