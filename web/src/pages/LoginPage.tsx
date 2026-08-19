import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { listOAuthProviders, startOAuth } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { OAuthProviderInfo } from '../types/api'
import { OAuthButtons } from '../components/OAuthButtons'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([])

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    const detail = searchParams.get('detail')
    if (oauthError) {
      setError(detail || `Social sign-in failed (${oauthError})`)
    }
  }, [searchParams])

  useEffect(() => {
    void listOAuthProviders()
      .then((list) => setProviders(list.filter((p) => p.configured)))
      .catch(() => setProviders([]))
  }, [])

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate('/')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Sign in failed',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Setaside</p>
        <h1>Sign in</h1>
        <p className="muted">Plan months, log spending, and spot trends.</p>
        <OAuthButtons
          providers={providers}
          intent="login"
          onStart={(id) => startOAuth(id, 'login')}
        />
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Username or email
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="muted">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
