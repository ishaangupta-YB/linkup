/**
 * The demo backend. It runs in the browser on localStorage so the whole platform works
 * without a server. Every call is async and can fail with an ApiError, the same contract
 * a real API (AWS API Gateway + Lambda + Cognito, later) will keep. Swap this module, not
 * the screens.
 */
import avatar from '../assets/avatar.jpg'
import { blankContent, DEMO_ACCOUNT, demoContent } from './defaults'
import { handleProblem, normaliseHandle } from './handle'
import { newId } from './ids'
import { readJSON, removeKey, removeMemoryCopy, writeJSON } from './storage'
import { LIMITS, type Account, type AccountSettings, type Page, type PageContent, type PublicPage } from './types'

export type ApiErrorCode =
  | 'invalid_input'
  | 'email_taken'
  | 'bad_credentials'
  | 'unauthenticated'
  | 'handle_taken'
  | 'handle_invalid'
  | 'no_page'
  | 'not_found'
  | 'storage_full'

export class ApiError extends Error {
  code: ApiErrorCode
  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

type StoredAccount = Account & { salt: string; hash: string }

type Db = {
  version: 1
  accounts: StoredAccount[]
  pages: Page[]
  /** session token -> account id */
  sessions: Record<string, string>
}

const DB_KEY = 'linkup:db'
const SESSION_KEY = 'linkup:session'
/** Bundled asset URLs change between builds, so the demo photo is stored as this token. */
const DEMO_PHOTO = 'asset:demo-avatar'

let latency = 180
/** Tests set this to 0. */
export function setLatency(ms: number) {
  latency = ms
}

function wait() {
  return latency > 0 ? new Promise((r) => setTimeout(r, latency * (0.6 + Math.random() * 0.8))) : Promise.resolve()
}

function emptyDb(): Db {
  return { version: 1, accounts: [], pages: [], sessions: {} }
}

function load(): Db {
  const db = readJSON<Db>(DB_KEY, emptyDb())
  return db && db.version === 1 ? db : emptyDb()
}

function save(db: Db) {
  if (!writeJSON(DB_KEY, db)) {
    // Keep reads in line with what is really stored, so a failed save looks failed everywhere.
    removeMemoryCopy(DB_KEY)
    throw new ApiError('storage_full', 'This browser is out of storage space. Try a smaller photo.')
  }
}

function hydrate(content: PageContent): PageContent {
  return content.photo === DEMO_PHOTO ? { ...content, photo: avatar } : content
}

function dehydrate(content: PageContent): PageContent {
  return content.photo === avatar ? { ...content, photo: DEMO_PHOTO } : content
}

function hydratePage(page: Page): Page {
  return { ...page, draft: hydrate(page.draft), published: page.published && hydrate(page.published) }
}

function publicAccount({ salt: _salt, hash: _hash, ...account }: StoredAccount): Account {
  return account
}

async function hashPassword(password: string, salt: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')
}

function normaliseEmail(email: string) {
  return email.trim().toLowerCase()
}

export function emailProblem(email: string): string | null {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? null : 'Enter an email address like name@example.com.'
}

function currentAccountId(db: Db): string | null {
  const token = readJSON<string | null>(SESSION_KEY, null)
  return token ? (db.sessions[token] ?? null) : null
}

function requireAccount(db: Db): StoredAccount {
  const id = currentAccountId(db)
  const account = id ? db.accounts.find((a) => a.id === id) : undefined
  if (!account) throw new ApiError('unauthenticated', 'Sign in to continue.')
  return account
}

function requirePage(db: Db, accountId: string): Page {
  const page = db.pages.find((p) => p.ownerId === accountId)
  if (!page) throw new ApiError('no_page', 'Claim your page address first.')
  return page
}

function startSession(db: Db, accountId: string) {
  const token = newId(32)
  db.sessions[token] = accountId
  writeJSON(SESSION_KEY, token)
}

/** Creates the demo account and its published page once per browser. */
export async function ensureDemoData() {
  const db = load()
  if (db.accounts.some((a) => a.email === DEMO_ACCOUNT.email)) return
  const salt = newId(16)
  const id = 'acct-demo'
  db.accounts.push({
    id,
    email: DEMO_ACCOUNT.email,
    name: DEMO_ACCOUNT.name,
    createdAt: Date.now() - 200 * 86_400_000,
    settings: { countOwnVisits: false },
    salt,
    hash: await hashPassword(DEMO_ACCOUNT.password, salt),
  })
  const content = dehydrate(demoContent())
  const now = Date.now()
  db.pages.push({ id: 'page-demo', ownerId: id, handle: DEMO_ACCOUNT.handle, draft: content, published: content, publishedAt: now, updatedAt: now })
  save(db)
}

/* ---------- accounts ---------- */

export async function signUp(input: { name: string; email: string; password: string }): Promise<Account> {
  await wait()
  const db = load()
  const email = normaliseEmail(input.email)
  const name = input.name.trim()
  if (!name) throw new ApiError('invalid_input', 'Enter your name.')
  const emailIssue = emailProblem(email)
  if (emailIssue) throw new ApiError('invalid_input', emailIssue)
  if (input.password.length < LIMITS.passwordMin) throw new ApiError('invalid_input', `Use at least ${LIMITS.passwordMin} characters for the password.`)
  if (db.accounts.some((a) => a.email === email)) throw new ApiError('email_taken', 'An account with that email already exists. Sign in instead.')
  const salt = newId(16)
  const account: StoredAccount = {
    id: newId(),
    email,
    name: name.slice(0, LIMITS.name),
    createdAt: Date.now(),
    settings: { countOwnVisits: false },
    salt,
    hash: await hashPassword(input.password, salt),
  }
  db.accounts.push(account)
  startSession(db, account.id)
  save(db)
  return publicAccount(account)
}

export async function signIn(input: { email: string; password: string }): Promise<Account> {
  await wait()
  const db = load()
  const account = db.accounts.find((a) => a.email === normaliseEmail(input.email))
  if (!account || (await hashPassword(input.password, account.salt)) !== account.hash) {
    throw new ApiError('bad_credentials', 'That email and password do not match.')
  }
  startSession(db, account.id)
  save(db)
  return publicAccount(account)
}

export async function signOut(): Promise<void> {
  await wait()
  const db = load()
  const token = readJSON<string | null>(SESSION_KEY, null)
  if (token) delete db.sessions[token]
  removeKey(SESSION_KEY)
  save(db)
}

/** The signed-in account, or null. Never throws for a signed-out visitor. */
export async function getSession(): Promise<Account | null> {
  await wait()
  const db = load()
  const id = currentAccountId(db)
  const account = id ? db.accounts.find((a) => a.id === id) : undefined
  return account ? publicAccount(account) : null
}

/** Synchronous read of who is signed in, for analytics owner checks. */
export function sessionAccountIdSync(): string | null {
  return currentAccountId(load())
}

export async function updateAccount(patch: { name?: string; email?: string; settings?: Partial<AccountSettings> }): Promise<Account> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new ApiError('invalid_input', 'Enter your name.')
    account.name = patch.name.trim().slice(0, LIMITS.name)
  }
  if (patch.email !== undefined) {
    const email = normaliseEmail(patch.email)
    const issue = emailProblem(email)
    if (issue) throw new ApiError('invalid_input', issue)
    if (db.accounts.some((a) => a.email === email && a.id !== account.id)) throw new ApiError('email_taken', 'Another account uses that email.')
    account.email = email
  }
  if (patch.settings) account.settings = { ...account.settings, ...patch.settings }
  save(db)
  return publicAccount(account)
}

export async function changePassword(current: string, next: string): Promise<void> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  if ((await hashPassword(current, account.salt)) !== account.hash) throw new ApiError('bad_credentials', 'Your current password is not right.')
  if (next.length < LIMITS.passwordMin) throw new ApiError('invalid_input', `Use at least ${LIMITS.passwordMin} characters for the password.`)
  account.salt = newId(16)
  account.hash = await hashPassword(next, account.salt)
  save(db)
}

/** Deletes the account, its page and every session. The page address becomes free. */
export async function deleteAccount(): Promise<void> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  db.accounts = db.accounts.filter((a) => a.id !== account.id)
  db.pages = db.pages.filter((p) => p.ownerId !== account.id)
  for (const [token, id] of Object.entries(db.sessions)) if (id === account.id) delete db.sessions[token]
  removeKey(SESSION_KEY)
  save(db)
}

/* ---------- pages ---------- */

export async function checkHandle(input: string): Promise<{ handle: string; available: boolean; reason: string | null }> {
  await wait()
  const handle = normaliseHandle(input)
  const problem = handleProblem(handle)
  if (problem) return { handle, available: false, reason: problem }
  const db = load()
  const me = currentAccountId(db)
  const taken = db.pages.some((p) => p.handle === handle && p.ownerId !== me)
  return { handle, available: !taken, reason: taken ? 'Someone already has that address.' : null }
}

/** Creates the signed-in account's page at the given address. */
export async function claimHandle(input: string): Promise<Page> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  const handle = normaliseHandle(input)
  const problem = handleProblem(handle)
  if (problem) throw new ApiError('handle_invalid', problem)
  if (db.pages.some((p) => p.handle === handle && p.ownerId !== account.id)) throw new ApiError('handle_taken', 'Someone already has that address.')
  const existing = db.pages.find((p) => p.ownerId === account.id)
  if (existing) {
    existing.handle = handle
    existing.updatedAt = Date.now()
    save(db)
    return hydratePage(existing)
  }
  const now = Date.now()
  const page: Page = { id: newId(), ownerId: account.id, handle, draft: blankContent(account.name), published: null, publishedAt: null, updatedAt: now }
  db.pages.push(page)
  save(db)
  return hydratePage(page)
}

/** The signed-in account's page, or null before they claim an address. */
export async function getMyPage(): Promise<Page | null> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  const page = db.pages.find((p) => p.ownerId === account.id)
  return page ? hydratePage(page) : null
}

export async function saveDraft(content: PageContent): Promise<Page> {
  await wait()
  return saveDraftSync(content)
}

/** The same save without the simulated network delay, for when the tab is closing and cannot wait. */
export function saveDraftSync(content: PageContent): Page {
  if (content.links.length > LIMITS.links) throw new ApiError('invalid_input', `A page holds ${LIMITS.links} links at most.`)
  const db = load()
  const page = requirePage(db, requireAccount(db).id)
  page.draft = dehydrate(content)
  page.updatedAt = Date.now()
  save(db)
  return hydratePage(page)
}

export async function publish(): Promise<Page> {
  await wait()
  const db = load()
  const page = requirePage(db, requireAccount(db).id)
  page.published = structuredClone(page.draft)
  page.publishedAt = Date.now()
  save(db)
  return hydratePage(page)
}

export async function unpublish(): Promise<Page> {
  await wait()
  const db = load()
  const page = requirePage(db, requireAccount(db).id)
  page.published = null
  page.publishedAt = null
  save(db)
  return hydratePage(page)
}

/** What /:handle serves. Null when no page has that address or it is unpublished. */
export async function getPublicPage(input: string): Promise<PublicPage | null> {
  await wait()
  const handle = normaliseHandle(input)
  const page = load().pages.find((p) => p.handle === handle)
  if (!page || !page.published || page.publishedAt == null) return null
  return { pageId: page.id, handle: page.handle, content: hydrate(page.published), publishedAt: page.publishedAt }
}

/** Sync lookup of who owns a page, so a public page can skip counting its owner's visits. */
export function pageOwnerSync(pageId: string): { ownerId: string; countOwnVisits: boolean } | null {
  const db = load()
  const page = db.pages.find((p) => p.id === pageId)
  if (!page) return null
  const owner = db.accounts.find((a) => a.id === page.ownerId)
  return { ownerId: page.ownerId, countOwnVisits: owner?.settings.countOwnVisits ?? false }
}
