import { useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { useAuth } from '../lib/auth'
import { MyPageProvider, useMyPage } from '../lib/page'
import { pageAddress, pagePath } from '../lib/url'
import { track } from '../analytics'
import { Button, IconButton, Wordmark } from '../ui/controls'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import './shell.css'

const TABS = [
  { to: '/app/editor', label: 'Editor', icon: 'layout' },
  { to: '/app/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
] as const

/** Everything under /app: signed in, with a claimed page. */
export function AppShell() {
  return (
    <MyPageProvider>
      <ShellFrame />
    </MyPageProvider>
  )
}

function ShellFrame() {
  const my = useMyPage()
  if (my.status === 'none') return <Navigate to="/onboarding" replace />
  return (
    <div className="app-scope shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="shell__main" tabIndex={-1}>
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
      <nav className="shell__tabbar" aria-label="App">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className="tabbar__item">
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function TopBar() {
  const auth = useAuth()
  const my = useMyPage()
  const toast = useToast()
  const [publishing, setPublishing] = useState(false)
  const page = my.page
  const handle = page?.handle ?? ''
  const live = !!page?.published

  async function onPublish() {
    setPublishing(true)
    try {
      await my.publish()
      toast({ message: `Published. Your page is live at ${pageAddress(handle)}.` })
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Publishing failed. Try again.' })
    } finally {
      setPublishing(false)
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`https://${pageAddress(handle)}`)
      toast({ message: 'Page address copied.' })
      track('address_copied', { where: 'topbar' }, { pageId: page?.id, handle })
    } catch {
      toast({ message: `Copy failed. Your address is ${pageAddress(handle)}.` })
    }
  }

  return (
    <header className="topbar">
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
      <div className="topbar__right">
        {page && (
          <>
            <span className="topbar__save" aria-live="polite">
              {my.saveStatus === 'saving' ? 'Saving' : my.saveStatus === 'error' ? 'Not saved, retrying' : 'Saved'}
            </span>
            <div className="topbar__address">
              <a className="topbar__addr-link mono" href={pagePath(handle)} target="_blank" rel="noreferrer" title={live ? 'Open your live page' : 'Your page is not published yet'}>
                {pageAddress(handle)}
              </a>
              <IconButton icon="copy" label="Copy page address" size="sm" onClick={copyAddress} />
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={publishing}
              disabled={live && !my.hasUnpublishedChanges}
              onClick={onPublish}
            >
              {!live ? 'Publish' : my.hasUnpublishedChanges ? 'Publish changes' : 'Published'}
            </Button>
          </>
        )}
        <IconButton icon="logout" label="Sign out" onClick={() => void auth.signOut()} />
      </div>
    </header>
  )
}
