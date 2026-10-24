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
import { onOtherTabChange, readJSON, readRaw, removeKey, removeMemoryCopy, writeJSON } from './storage'
import { DEFAULT_LOOK, EMPTY_SOCIALS } from './defaults'
import { LIMITS, type Account, type AccountSettings, type Page, type PageContent, type PublicPage } from './types'
import { contentProblem, normaliseContent, normaliseText } from './validate'

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
  /** The draft changed elsewhere (another tab) since the version this save was based on. */
  | 'conflict'

export class ApiError extends Error {
  code: ApiErrorCode
  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

type StoredAccount = Account & { salt: string; hash: string }

/**
 * The stored database. Version history:
 * 1. accounts, pages, sessions.
 * 2. every page carries `draftUpdatedAt` (for conflict checks) and complete content
 *    (missing socials, look fields and link flags filled in); sessions of deleted accounts dropped.
 */
type Db = {
  version: typeof DB_VERSION
  accounts: StoredAccount[]
  pages: StoredPage[]
  /** session token -> account id */
  sessions: Record<string, string>
}

type StoredPage = Page & { draftUpdatedAt: number }

export const DB_VERSION = 2
/**
 * Version 2 lives under its own key. A tab still running an older build reads and writes only
 * LEGACY_DB_KEY, so it can never overwrite migrated data (an old build treats any version it
 * does not know as empty and would save an empty database over it).
 */
export const DB_KEY = 'linkup:db:v2'
/** Where version 1 lived. Read once to migrate, never written. */
export const LEGACY_DB_KEY = 'linkup:db'
export const SESSION_KEY = 'linkup:session'
/** Where a database this build cannot read is kept, untouched, before starting a fresh one. */
export const DB_BACKUP_KEY = 'linkup:db:backup'
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
  return { version: DB_VERSION, accounts: [], pages: [], sessions: {} }
}

type Loose = Record<string, unknown>
const isObject = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v)

/** Fills what an older build may have left out of a page's content. Keeps every value it finds. */
function repairContent(content: unknown): PageContent {
  const c = isObject(content) ? content : {}
  const links = Array.isArray(c.links) ? c.links.filter(isObject) : []
  return {
    photo: typeof c.photo === 'string' ? c.photo : null,
    name: typeof c.name === 'string' ? c.name : '',
    tagline: typeof c.tagline === 'string' ? c.tagline : '',
    bio: typeof c.bio === 'string' ? c.bio : '',
    location: typeof c.location === 'string' ? c.location : '',
    links: links.map((l) => ({
      id: typeof l.id === 'string' && l.id ? l.id : newId(),
      title: typeof l.title === 'string' ? l.title : '',
      url: typeof l.url === 'string' ? l.url : '',
      visible: l.visible !== false,
    })),
    socials: { ...EMPTY_SOCIALS, ...(isObject(c.socials) ? (c.socials as Partial<PageContent['socials']>) : {}) },
    look: { ...DEFAULT_LOOK, ...(isObject(c.look) ? (c.look as Partial<PageContent['look']>) : {}) },
  }
}

/**
 * Brings a stored database up to DB_VERSION. Returns null when it is not a LinkUp database
 * this build understands (corrupt, or written by a newer build), so the caller can keep it aside.
 */
export function migrateDb(raw: unknown): Db | null {
  if (!isObject(raw) || !Array.isArray(raw.accounts) || !Array.isArray(raw.pages)) return null
  const version = raw.version
  if (version === DB_VERSION) return raw as unknown as Db
  if (version !== 1) return null
  const accounts = (raw.accounts as unknown[]).filter(isObject).map((a) => ({
    ...(a as unknown as StoredAccount),
    settings: { countOwnVisits: false, ...(isObject(a.settings) ? a.settings : {}) },
  }))
  const ids = new Set(accounts.map((a) => a.id))
  const pages = (raw.pages as unknown[]).filter(isObject).map((p): StoredPage => {
    const updatedAt = typeof p.updatedAt === 'number' ? p.updatedAt : Date.now()
    return {
      ...(p as unknown as Page),
      draft: repairContent(p.draft),
      published: p.published == null ? null : repairContent(p.published),
      publishedAt: typeof p.publishedAt === 'number' ? p.publishedAt : null,
      updatedAt,
      draftUpdatedAt: updatedAt,
    }
  })
  const sessions: Record<string, string> = {}
  for (const [token, id] of Object.entries(isObject(raw.sessions) ? raw.sessions : {})) if (typeof id === 'string' && ids.has(id)) sessions[token] = id
  return { version: DB_VERSION, accounts, pages, sessions }
}

function load(): Db {
  const raw = readRaw(DB_KEY)
  if (raw == null) return loadLegacy()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const db = migrateDb(parsed)
  if (!db) {
    // Never throw away what we cannot read: keep it beside the fresh database.
    if (readRaw(DB_BACKUP_KEY) == null) writeJSON(DB_BACKUP_KEY, raw)
    return emptyDb()
  }
  if (isObject(parsed) && parsed.version !== DB_VERSION) writeJSON(DB_KEY, db)
  return db
}

/** First run of this build: migrate version 1 into DB_KEY, leaving the old key as it was. */
function loadLegacy(): Db {
  const raw = readRaw(LEGACY_DB_KEY)
  if (raw == null) return emptyDb()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const db = migrateDb(parsed)
  if (!db) {
    if (readRaw(DB_BACKUP_KEY) == null) writeJSON(DB_BACKUP_KEY, raw)
    return emptyDb()
  }
  writeJSON(DB_KEY, db)
  return db
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

function hydratePage(page: StoredPage): Page {
  return { ...page, draft: hydrate(page.draft), published: page.published && hydrate(page.published) }
}

/** The next draft stamp: now, but always later than the last one, even within one millisecond. */
function nextStamp(previous: number) {
  return Math.max(Date.now(), previous + 1)
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
  return String(email ?? '').trim().toLowerCase()
}

export function emailProblem(email: string): string | null {
  const trimmed = String(email ?? '').trim()
  if (trimmed.length > LIMITS.email) return `Use an email address of ${LIMITS.email} characters or fewer.`
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? null : 'Enter an email address like name@example.com.'
}

function passwordCheck(password: string) {
  if (typeof password !== 'string' || password.length < LIMITS.passwordMin) throw new ApiError('invalid_input', `Use at least ${LIMITS.passwordMin} characters for the password.`)
  if (password.length > LIMITS.passwordMax) throw new ApiError('invalid_input', `Use ${LIMITS.passwordMax} characters or fewer for the password.`)
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

function requirePage(db: Db, accountId: string): StoredPage {
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
  db.pages.push({ id: 'page-demo', ownerId: id, handle: DEMO_ACCOUNT.handle, draft: content, published: content, publishedAt: now, updatedAt: now, draftUpdatedAt: now })
  save(db)
}

/* ---------- accounts ---------- */

export async function signUp(input: { name: string; email: string; password: string }): Promise<Account> {
  await wait()
  const db = load()
  const email = normaliseEmail(input.email)
  const name = normaliseText(input.name, LIMITS.name)
  if (!name) throw new ApiError('invalid_input', 'Enter your name.')
  const emailIssue = emailProblem(email)
  if (emailIssue) throw new ApiError('invalid_input', emailIssue)
  passwordCheck(input.password)
  if (db.accounts.some((a) => a.email === email)) throw new ApiError('email_taken', 'An account with that email already exists. Sign in instead.')
  const salt = newId(16)
  const account: StoredAccount = {
    id: newId(),
    email,
    name,
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
    const name = normaliseText(patch.name, LIMITS.name)
    if (!name) throw new ApiError('invalid_input', 'Enter your name.')
    account.name = name
  }
  if (patch.email !== undefined) {
    const email = normaliseEmail(patch.email)
    const issue = emailProblem(email)
    if (issue) throw new ApiError('invalid_input', issue)
    if (db.accounts.some((a) => a.email === email && a.id !== account.id)) throw new ApiError('email_taken', 'Another account uses that email.')
    account.email = email
  }
  if (patch.settings) {
    // Only known settings, only booleans.
    if (patch.settings.countOwnVisits !== undefined) account.settings = { ...account.settings, countOwnVisits: patch.settings.countOwnVisits === true }
  }
  save(db)
  return publicAccount(account)
}

export async function changePassword(current: string, next: string): Promise<void> {
  await wait()
  const db = load()
  const account = requireAccount(db)
  if ((await hashPassword(current, account.salt)) !== account.hash) throw new ApiError('bad_credentials', 'Your current password is not right.')
  passwordCheck(next)
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
  const page: StoredPage = { id: newId(), ownerId: account.id, handle, draft: blankContent(account.name), published: null, publishedAt: null, updatedAt: now, draftUpdatedAt: now }
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

export type SaveDraftOptions = {
  /**
   * The page's `draftUpdatedAt` this draft was edited from. When the stored draft is newer
   * (saved from another tab), the save is refused with a `conflict` error instead of
   * overwriting it. Leave it out to save unconditionally.
   */
  basedOn?: number
  /** The page this draft belongs to; refused as a `conflict` when the session now owns another. */
  pageId?: string
}

/** The message a conflict carries; the shell shows it with a reload action. */
export const CONFLICT_MESSAGE = 'Edited in another tab. Reload to see it.'

export async function saveDraft(content: PageContent, options?: SaveDraftOptions): Promise<Page> {
  await wait()
  return saveDraftSync(content, options)
}

/**
 * The same save without the simulated network delay, for when the tab is closing and cannot wait.
 * Validates like a server: unsafe link addresses, an oversized photo or too many links are
 * refused; text is trimmed, cleaned of control characters and clamped to LIMITS.
 */
export function saveDraftSync(content: PageContent, options: SaveDraftOptions = {}): Page {
  const db = load()
  const page = requirePage(db, requireAccount(db).id)
  if (options.pageId !== undefined && options.pageId !== page.id) throw new ApiError('conflict', 'You are signed in to another page in another tab. Reload to see it.')
  if (options.basedOn !== undefined && page.draftUpdatedAt > options.basedOn) throw new ApiError('conflict', CONFLICT_MESSAGE)
  const problem = contentProblem(content)
  if (problem) throw new ApiError('invalid_input', problem)
  page.draft = dehydrate(normaliseContent(content))
  page.draftUpdatedAt = nextStamp(page.draftUpdatedAt)
  page.updatedAt = Math.max(page.updatedAt, page.draftUpdatedAt)
  save(db)
  return hydratePage(page)
}

export async function publish(): Promise<Page> {
  await wait()
  const db = load()
  const page = requirePage(db, requireAccount(db).id)
  // A draft stored by an older build was never checked; check it before it goes public.
  const problem = contentProblem(page.draft)
  if (problem) throw new ApiError('invalid_input', problem)
  page.published = normaliseContent(structuredClone(page.draft))
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

/**
 * Calls `listener` when another tab changes the stored database or who is signed in
 * (`session` is true for a sign-in or sign-out there). Returns the unsubscribe function.
 */
export function onExternalChange(listener: (change: { db: boolean; session: boolean }) => void): () => void {
  return onOtherTabChange([DB_KEY, SESSION_KEY], (key) => listener({ db: key !== SESSION_KEY, session: key !== DB_KEY }))
}

/** Sync lookup of who owns a page, so a public page can skip counting its owner's visits. */
export function pageOwnerSync(pageId: string): { ownerId: string; countOwnVisits: boolean } | null {
  const db = load()
  const page = db.pages.find((p) => p.id === pageId)
  if (!page) return null
  const owner = db.accounts.find((a) => a.id === page.ownerId)
  return { ownerId: page.ownerId, countOwnVisits: owner?.settings.countOwnVisits ?? false }
}
