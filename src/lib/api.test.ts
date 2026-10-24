import { beforeEach, describe, expect, it } from 'vitest'
import * as api from './api'
import { DEMO_ACCOUNT } from './defaults'
import { handleProblem } from './handle'
import { isSafeHref, isValidUrl, socialHref, toHref } from './url'

api.setLatency(0)
beforeEach(() => localStorage.clear())

describe('demo api', () => {
  it('signs up, claims a handle, saves, publishes and serves the page', async () => {
    const account = await api.signUp({ name: 'Asha', email: 'Asha@Example.com', password: 'longenough' })
    expect(account.email).toBe('asha@example.com')
    expect(await api.getMyPage()).toBeNull()
    const page = await api.claimHandle('@Asha.Rao')
    expect(page.handle).toBe('asha.rao')
    expect(await api.getPublicPage('asha.rao')).toBeNull()
    await api.saveDraft({ ...page.draft, bio: 'Hello' })
    await api.publish()
    const pub = await api.getPublicPage('ASHA.RAO')
    expect(pub?.content.bio).toBe('Hello')
    await api.saveDraft({ ...page.draft, bio: 'Changed' })
    expect((await api.getPublicPage('asha.rao'))?.content.bio).toBe('Hello')
  })

  it('rejects duplicate emails, wrong passwords and taken handles', async () => {
    await api.signUp({ name: 'A', email: 'a@b.co', password: '12345678' })
    await api.claimHandle('taken')
    await expect(api.signUp({ name: 'B', email: 'a@b.co', password: '12345678' })).rejects.toMatchObject({ code: 'email_taken' })
    await api.signOut()
    await expect(api.signIn({ email: 'a@b.co', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'bad_credentials' })
    await api.signUp({ name: 'B', email: 'b@b.co', password: '12345678' })
    expect((await api.checkHandle('taken')).available).toBe(false)
    await expect(api.claimHandle('taken')).rejects.toMatchObject({ code: 'handle_taken' })
    expect((await api.checkHandle('settings')).reason).toMatch(/LinkUp itself/)
  })

  it('requires a session for private calls', async () => {
    await expect(api.getMyPage()).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(await api.getSession()).toBeNull()
  })

  it('seeds the demo account once with a published page', async () => {
    await api.ensureDemoData()
    await api.ensureDemoData()
    const account = await api.signIn({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
    expect(account.name).toBe(DEMO_ACCOUNT.name)
    const pub = await api.getPublicPage(DEMO_ACCOUNT.handle)
    expect(pub?.content.links).toHaveLength(4)
    expect(pub?.content.photo).not.toBe('asset:demo-avatar')
  })

  it('deletes the account and frees the handle', async () => {
    await api.signUp({ name: 'A', email: 'a@b.co', password: '12345678' })
    await api.claimHandle('freeme')
    await api.publish()
    await api.deleteAccount()
    expect(await api.getPublicPage('freeme')).toBeNull()
    expect(await api.getSession()).toBeNull()
  })
})

describe('handles and urls', () => {
  it('validates handles', () => {
    expect(handleProblem('ab')).toMatch(/at least/)
    expect(handleProblem('good_name.1')).toBeNull()
    expect(handleProblem('.bad')).toMatch(/Start and end/)
    expect(handleProblem('a..b')).toMatch(/one dot/)
    expect(handleProblem('Caps')).toMatch(/lowercase/)
    expect(handleProblem('favicon.svg')).toMatch(/file name/)
    expect(handleProblem('asha.rao')).toBeNull()
  })

  it('validates and normalises urls', () => {
    expect(isValidUrl('example.com')).toBe(true)
    expect(isValidUrl('https://example.com/a?b=c')).toBe(true)
    expect(isValidUrl('mailto:me@example.com')).toBe(true)
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('localhost')).toBe(false)
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
    expect(toHref('example.com')).toBe('https://example.com')
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('example.com')).toBe(true)
  })

  it('turns social handles into links', () => {
    expect(socialHref('instagram', '@me')).toBe('https://instagram.com/me')
    expect(socialHref('youtube', '@chan')).toBe('https://youtube.com/@chan')
    expect(socialHref('linkedin', 'linkedin.com/in/me')).toBe('https://linkedin.com/in/me')
    expect(socialHref('whatsapp', '+91 98000 00000')).toBe('https://wa.me/919800000000')
    expect(socialHref('instagram', '@thedesignsquare.in')).toBe('https://instagram.com/thedesignsquare.in')
    expect(socialHref('instagram', 'instagram.com/me')).toBe('https://instagram.com/me')
    expect(socialHref('website', '')).toBeNull()
  })
})
