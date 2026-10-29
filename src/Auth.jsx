import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            // send the confirmation link back to wherever the app is running (must be in Supabase's Redirect URLs)
            options: { emailRedirectTo: window.location.origin + window.location.pathname },
          })
    setBusy(false)
    if (error) return setError(error.message)
    if (mode === 'signup' && !data.session) {
      setNotice('Check your email to confirm your account, then sign in.')
      setMode('signin')
    }
  }

  return (
    <main className="auth">
      <h1>Daily Checklist</h1>
      <p className="muted">{mode === 'signin' ? 'Sign in to see your tasks' : 'Create an account'}</p>
      <form onSubmit={submit}>
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? "No account? Sign up" : 'Have an account? Sign in'}
      </button>
    </main>
  )
}
