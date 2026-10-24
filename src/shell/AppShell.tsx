import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { useAuth } from '../lib/auth'
import { MyPageProvider, useMyPage } from '../lib/page'
import { pageAddress, pagePath } from '../lib/url'
import { track } from '../analytics'
import { Button, IconButton, Wordmark } from '../ui/controls'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { Menu, MenuAnchor, MenuButton, MenuLink } from './Menu'
import './shell.css'

const TABS = [
  { to: '/app/editor', label: 'Editor', icon: 'layout' },
  { to: '/app/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
] as const

/** Everything under /app: signed in, with a claimed page. */
export function AppShell() {
  const auth = useAuth()
  // A different account signing in (in another tab) gets its own page state, never the last one's.
  return (
    <MyPageProvider key={auth.account?.id ?? 'none'}>
      <ShellFrame />
    </MyPageProvider>
  )
}

/** Publishing from either bar: the top bar on wide screens, the tab bar on phones. */
function usePublish() {
  const my = useMyPage()
  const toast = useToast()
  const [publishing, setPublishing] = useState(false)
  const page = my.page
  const live = !!page?.published
  const label = !live ? 'Publish' : my.hasUnpublishedChanges ? 'Publish changes' : 'Published'

  async function run() {
    if (!page) return
    setPublishing(true)
    try {
      await my.publish()
      toast({ message: `Published. Your page is live at ${pageAddress(page.handle)}.` })
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Publishing failed. Try again.', tone: 'error' })
    } finally {
      setPublishing(false)
    }
  }

  return { label, publishing, disabled: live && !my.hasUnpublishedChanges, run, ready: !!page }
}

function ShellFrame() {
  const my = useMyPage()
  const publish = usePublish()
  if (my.status === 'none') return <Navigate to="/onboarding" replace />
  return (
    <div className="app-scope shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar publish={publish} />
      <main id="main" className="shell__main" tabIndex={-1}>
        {my.conflict && (
          <div className="shell__notice" role="alert">
            <Icon name="alert" size={18} />
            <p>{my.saveError}</p>
            <Button size="sm" icon="refresh" onClick={my.reload}>
              Reload
            </Button>
          </div>
        )}
        {my.status === 'error' ? (
          <div className="shell__error surface" role="alert">
            <h1>Your page did not load</h1>
            <p>{my.error}</p>
            <Button variant="primary" icon="refresh" onClick={my.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <div className="shell__tabbar">
        <nav className="tabbar__nav" aria-label="App">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className="tabbar__item">
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        {publish.ready && (
          <Button variant="primary" className="tabbar__publish" loading={publish.publishing} disabled={publish.disabled} onClick={() => void publish.run()}>
            {publish.label}
          </Button>
        )}
      </div>
    </div>
  )
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map((w) => Array.from(w)[0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

/** Saved, Saving or Not saved, always in view. Not saved is a button that says why and offers the fix. */
function SaveState() {
  const my = useMyPage()
  const toast = useToast()
  const label = my.saveStatus === 'saving' ? 'Saving' : my.saveStatus === 'error' ? 'Not saved' : 'Saved'
  const reason = my.saveError ?? undefined
  return (
    <span className="save-state" aria-live="polite">
      {my.saveStatus === 'error' ? (
        <button
          type="button"
          className="save-state__btn save-state--error"
          title={reason}
          aria-label={reason ? `Not saved. ${reason}` : 'Not saved'}
          onClick={() =>
            toast({
              message: reason ?? 'Your latest changes are not saved yet.',
              tone: 'error',
              action: my.conflict ? { label: 'Reload', run: my.reload } : { label: 'Try again', run: () => void my.flush() },
            })
          }
        >
          <Icon name="alert" size={16} />
          <span>{label}</span>
        </button>
      ) : (
        <span className={`save-state__text save-state--${my.saveStatus}`} title={my.saveStatus === 'saved' ? 'Every change is saved' : 'Saving your changes'}>
          {my.saveStatus === 'saved' && <Icon name="check" size={16} />}
          <span>{label}</span>
        </span>
      )}
    </span>
  )
}

function TopBar({ publish }: { publish: ReturnType<typeof usePublish> }) {
  const auth = useAuth()
  const my = useMyPage()
  const toast = useToast()
  const page = my.page
  const handle = page?.handle ?? ''
  const live = !!page?.published

  // Say why a save failed once, the first time it happens, rather than only in the status label.
  // A conflict has its own notice below the bar.
  const shownError = useRef<string | null>(null)
  useEffect(() => {
    if (my.saveError && my.saveError !== shownError.current && !my.conflict) toast({ message: `Not saved: ${my.saveError}`, tone: 'error' })
    shownError.current = my.saveError
  }, [my.saveError, my.conflict, toast])

  async function signOut() {
    if (!(await my.flush())) {
      toast({ message: 'Your latest changes are not saved yet.', tone: 'error', action: { label: 'Sign out anyway', run: () => void auth.signOut() } })
      return
    }
    await auth.signOut()
  }

  async function copyAddress(where: 'topbar' | 'address_menu') {
    try {
      await navigator.clipboard.writeText(`https://${pageAddress(handle)}`)
      toast({ message: 'Page address copied.' })
      track('address_copied', { where }, { pageId: page?.id, handle })
    } catch {
      toast({ message: `Copy failed. Your address is ${pageAddress(handle)}.`, tone: 'error' })
    }
  }

  const account = auth.account
  const pageState = !live ? 'Not published yet' : my.hasUnpublishedChanges ? 'Live, with changes not published yet' : 'Live'

  return (
    <header className="topbar">
      <div className="topbar__bar">
        <div className="topbar__left">
          <Wordmark to="/app/editor" small />
          <nav className="topbar__tabs" aria-label="App">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} className="topbar__tab">
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {page && (
          <div className="topbar__page">
            <Menu
              label={`Page address ${pageAddress(handle)}`}
              buttonClassName="addr-chip mono"
              panelClassName="menu__panel--address"
              button={
                <>
                  <span className="addr-chip__text">{pageAddress(handle)}</span>
                  <Icon name="chevronDown" size={16} />
                </>
              }
              head={
                <>
                  <p className="menu__title mono">{pageAddress(handle)}</p>
                  <p className="menu__sub">{pageState}</p>
                </>
              }
            >
              <MenuAnchor icon="external" href={pagePath(handle)}>
                {live ? 'Open your page' : 'Open your page (not live yet)'}
              </MenuAnchor>
              <MenuButton icon="copy" onSelect={() => void copyAddress('address_menu')}>
                Copy address
              </MenuButton>
            </Menu>
          </div>
        )}
        <div className="topbar__right">
          {page && (
            <>
              <SaveState />
              <div className="topbar__address">
                <a className="topbar__addr-link mono" href={pagePath(handle)} target="_blank" rel="noreferrer" title={live ? 'Open your live page' : 'Your page is not published yet'}>
                  {pageAddress(handle)}
                </a>
                <IconButton icon="copy" label="Copy page address" size="sm" onClick={() => void copyAddress('topbar')} />
              </div>
              <Button variant="primary" size="sm" className="topbar__publish" loading={publish.publishing} disabled={publish.disabled} onClick={() => void publish.run()}>
                {publish.label}
              </Button>
            </>
          )}
          <Menu
            label="Account menu"
            buttonClassName="account-btn"
            panelClassName="menu__panel--account"
            button={
              <span className="account-btn__avatar" aria-hidden="true">
                {initials(account?.name ?? '')}
              </span>
            }
            head={
              account && (
                <>
                  <p className="menu__title">{account.name}</p>
                  <p className="menu__sub">{account.email}</p>
                </>
              )
            }
          >
            <MenuLink icon="settings" to="/app/settings">
              Settings
            </MenuLink>
            <MenuButton icon="logout" onSelect={() => void signOut()}>
              Sign out
            </MenuButton>
          </Menu>
        </div>
      </div>
    </header>
  )
}
