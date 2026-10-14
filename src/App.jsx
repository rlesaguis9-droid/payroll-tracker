import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib.js'
import Auth from './components/Auth.jsx'
import QuickEntry from './components/QuickEntry.jsx'
import Commissions from './components/Commissions.jsx'
import RecordBook from './components/RecordBook.jsx'
import Settings from './components/Settings.jsx'
import Payroll from './components/Payroll.jsx'

const TABS = [
  { id: 'quick', label: 'Quick Entry' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'records', label: 'Record Book' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isConfigured)
  const [tab, setTab] = useState('quick')

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
        <div className="brand">Tr-ACES</div>
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
        {tab === 'quick' && <QuickEntry />}
        {tab === 'payroll' && <Payroll />}
        {tab === 'commissions' && <Commissions />}
        {tab === 'records' && <RecordBook />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  )
}
