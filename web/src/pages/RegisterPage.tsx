import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { listOAuthProviders, startOAuth } from '../api/auth'
import { ApiError } from '../api/client'
import { OAuthButtons } from '../components/OAuthButtons'
import { useAuth } from '../context/AuthContext'
import type { OAuthProviderInfo } from '../types/api'

export function RegisterPage() {
  const { user, loading, register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [emailConfirm, setEmailConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([])

  useEffect(() => {
    void listOAuthProviders()
      .then((list) => setProviders(list.filter((p) => p.configured)))
      .catch(() => setProviders([]))
  }, [])

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      setError('Email addresses do not match. Check both fields.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await register(username.trim(), email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Registration failed',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Setaside</p>
        <h1>Create account</h1>
        <p className="muted">
          Use Google or Facebook, or sign up with a username, email, and
          password. Type the email carefully — it is how we send a password
          reset if you get locked out. We do not send a confirmation email.
        </p>
        <OAuthButtons
          providers={providers}
          intent="login"
          onStart={(id) => startOAuth(id, 'login')}
        />
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={64}
              pattern="^[a-zA-Z0-9_\-\.]+$"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <p className="muted tiny">
            Use an inbox you can open. A mistyped address cannot receive a
            password reset.
          </p>
          <label>
            Confirm email
            <input
              type="email"
              autoComplete="email"
              value={emailConfirm}
              onChange={(e) => setEmailConfirm(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
