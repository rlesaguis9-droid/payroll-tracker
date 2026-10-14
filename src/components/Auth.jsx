import { useState } from 'react'
import { supabase } from '../lib.js'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
    setBusy(false)
    if (error) setMsg({ type: 'error', text: error.message })
    else if (mode === 'signup') setMsg({ type: 'ok', text: 'Check your email to confirm your account, then sign in.' })
  }

  return (
    <div className="center-page">
      <form className="card narrow glow-card" onSubmit={submit}>
        <div className="auth-brand">
          <h1>Tr-ACES</h1>
          <p className="tagline">The smart way to track ACES expenses.</p>
        </div>
        <p className="muted">{mode === 'signin' ? 'Sign in to your account' : 'Create an account'}</p>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button className="btn primary full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
