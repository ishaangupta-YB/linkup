import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, RequireAuth } from './lib/auth'
import { AppShell } from './shell/AppShell'
import { ToastProvider } from './ui/Toast'

const LandingPage = lazy(() => import('./routes/landing/LandingPage'))
const SignInPage = lazy(() => import('./routes/auth/SignInPage'))
const SignUpPage = lazy(() => import('./routes/auth/SignUpPage'))
const OnboardingPage = lazy(() => import('./routes/auth/OnboardingPage'))
const EditorPage = lazy(() => import('./routes/editor/EditorPage'))
const AnalyticsPage = lazy(() => import('./routes/analytics/AnalyticsPage'))
const SettingsPage = lazy(() => import('./routes/settings/SettingsPage'))
const PublicPage = lazy(() => import('./routes/public/PublicPage'))
const NotFoundPage = lazy(() => import('./routes/public/NotFoundPage'))

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="route-loading" role="status" aria-label="Loading" />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Lazy>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth>
                    <OnboardingPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="editor" replace />} />
                <Route path="editor" element={<Lazy><EditorPage /></Lazy>} />
                <Route path="analytics" element={<Lazy><AnalyticsPage /></Lazy>} />
                <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
                <Route path="*" element={<Navigate to="editor" replace />} />
              </Route>
              <Route path="/:handle" element={<PublicPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Lazy>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
