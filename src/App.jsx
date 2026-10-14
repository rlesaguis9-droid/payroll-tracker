import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib.js'
import Auth from './components/Auth.jsx'
import Dashboard from './components/Dashboard.jsx'
import Employees from './components/Employees.jsx'
import Payroll from './components/Payroll.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'employees', label: 'Employees' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isConfigured)
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h1>Setup needed</h1>
          <p className="muted">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>{' '}
            (or as Vercel environment variables), then restart. See README.md.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="center-page muted">Loading…</div>
  if (!session) return <Auth />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Payroll Tracker</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user">
          <span className="muted small hide-sm">{session.user.email}</span>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main className="content">
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'payroll' && <Payroll />}
        {tab === 'employees' && <Employees />}
      </main>
    </div>
  )
}
