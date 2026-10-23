import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Logo from '../components/Logo.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    // On success App.jsx notices the new login and shows the app.
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'El email o la contraseña no son correctos. Probá de nuevo.'
          : 'No se pudo entrar. Revisá el internet y probá de nuevo.',
      )
    }
  }

  return (
    <main className="screen login">
      <div className="login-logo">
        <Logo />
      </div>
      <h1>¡Hola de nuevo!</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
