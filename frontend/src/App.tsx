import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api, clearToken, readToken, saveToken } from './api/client'
import { AppLayout } from './components/AppLayout'
import { EmptyState, LoadingState, PageHeader } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { CatalogPages } from './pages/CatalogPages'
import { IQCPage, InternalLotsPage, ReceiptsPage } from './pages/WorkflowPages'
import { LoginPage } from './pages/LoginPage'
import type { UserProfile } from './types'

function App() { return <BrowserRouter><AppShell /></BrowserRouter> }

function AppShell() {
  const [token, setToken] = useState<string | null>(() => readToken())
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(readToken()))
  const expireSession = useCallback(() => { clearToken(); setToken(null); setProfile(null); setCheckingSession(false) }, [])

  useEffect(() => {
    const onUnauthorized = () => expireSession()
    window.addEventListener('smtms:unauthorized', onUnauthorized)
    return () => window.removeEventListener('smtms:unauthorized', onUnauthorized)
  }, [expireSession])

  useEffect(() => {
    if (!token || profile) return
    let active = true
    api.getProfile().then((me) => { if (active) setProfile(me) }).catch(() => { if (active) expireSession() }).finally(() => { if (active) setCheckingSession(false) })
    return () => { active = false }
  }, [token, profile, expireSession])

  const handleLogin = async (username: string, password: string) => {
    const auth = await api.login(username, password)
    saveToken(auth.access_token)
    try {
      const me = await api.getProfile()
      setProfile(me); setToken(auth.access_token)
    } catch (error) { clearToken(); setProfile(null); setToken(null); throw error }
  }

  const handleLogout = async () => {
    try { if (readToken()) await api.logout() } catch { /* Always clear the local session. */ }
    expireSession()
  }

  return <Routes>
    <Route path="/login" element={token && profile ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} loading={checkingSession} />} />
    <Route path="/" element={token ? (checkingSession || !profile ? <div className="grid min-h-screen place-items-center bg-slate-50"><LoadingState label="Verifying session…" /></div> : <AppLayout profile={profile} onLogout={handleLogout} />) : <Navigate to="/login" replace />}>
      <Route index element={<DashboardPage profile={profile} />} />
      <Route path="suppliers" element={<PermissionPage profile={profile} permission="suppliers:read"><CatalogPages kind="suppliers" profile={profile} /></PermissionPage>} />
      <Route path="materials" element={<PermissionPage profile={profile} permission="materials:read"><CatalogPages kind="materials" profile={profile} /></PermissionPage>} />
      <Route path="receipts" element={<PermissionPage profile={profile} permission="receipts:read"><ReceiptsPage profile={profile} /></PermissionPage>} />
      <Route path="internal-lots" element={<PermissionPage profile={profile} permission="materials:read"><InternalLotsPage /></PermissionPage>} />
      <Route path="iqc" element={<PermissionPage profile={profile} permission="iqc:read"><IQCPage profile={profile} /></PermissionPage>} />
    </Route>
    <Route path="*" element={<Navigate to={token ? '/' : '/login'} replace />} />
  </Routes>
}

function PermissionPage({ profile, permission, children }: { profile: UserProfile | null; permission: string; children: ReactNode }) {
  if (!profile?.permissions.includes(permission)) return <section><PageHeader eyebrow="Access control" title="Permission required" description="Your account does not have permission to view this operational area." /><EmptyState title="Access unavailable" description={`Required permission: ${permission}. Ask an administrator to review your role assignment.`} /></section>
  return children
}

export default App
