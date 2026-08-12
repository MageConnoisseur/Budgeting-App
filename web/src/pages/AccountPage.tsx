import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listOAuthProviders, startOAuth } from '../api/auth'
import { ApiError } from '../api/client'
import { OAuthButtons } from '../components/OAuthButtons'
import { useAuth } from '../context/AuthContext'
import type { OAuthProviderInfo } from '../types/api'

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  dev: 'Dev (local)',
}

export function AccountPage() {
  const { user, updateEmail, unlinkProvider, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(user?.email ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([])

  useEffect(() => {
    setEmail(user?.email ?? '')
  }, [user?.email])

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    const detail = searchParams.get('detail')
    const linked = searchParams.get('linked')
    if (oauthError) {
      setError(detail || `Could not link account (${oauthError})`)
    } else if (linked) {
      setMessage(
        `${PROVIDER_LABELS[linked] ?? linked} is now linked to your account.`,
      )
      void refreshUser()
    }
  }, [refreshUser, searchParams])

  useEffect(() => {
    void listOAuthProviders()
      .then((list) => setProviders(list.filter((p) => p.configured)))
      .catch(() => setProviders([]))
  }, [])

  async function onSaveEmail(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateEmail(email.trim())
      setMessage('Email saved. Use a real address you can access for recovery.')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not update email')
    } finally {
      setSaving(false)
    }
  }

  async function onUnlink(provider: string) {
    setError(null)
    setMessage(null)
    try {
      await unlinkProvider(provider)
      setMessage(`${PROVIDER_LABELS[provider] ?? provider} unlinked.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not unlink provider')
    }
  }

  const linked = new Set(user?.oauth_providers ?? [])
  const linkable = providers.filter((p) => !linked.has(p.id))

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Account</h1>
          <p className="muted">
            Attach an email and link Google or Facebook so you never lose budget
            data when switching sign-in methods.
          </p>
        </div>
      </header>

      <section className="panel stack">
        <h2>Profile</h2>
        <p>
          <span className="muted">Username</span>
          <br />
          <strong>{user?.username}</strong>
        </p>
        <form className="stack" onSubmit={onSaveEmail}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <p className="muted tiny">
            Email verification is not required yet — double-check the address so
            you can recover this account later.
          </p>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save email'}
          </button>
        </form>
      </section>

      <section className="panel stack">
        <h2>Sign-in methods</h2>
        <p className="muted">
          Password: {user?.has_password ? 'enabled' : 'not set (social-only)'}
        </p>
        <ul className="link-list">
          {(user?.oauth_providers ?? []).map((provider) => (
            <li key={provider}>
              <span>{PROVIDER_LABELS[provider] ?? provider}</span>
              <button
                type="button"
                className="btn tiny ghost"
                onClick={() => void onUnlink(provider)}
              >
                Unlink
              </button>
            </li>
          ))}
          {(user?.oauth_providers ?? []).length === 0 && (
            <li className="muted">No social accounts linked yet.</li>
          )}
        </ul>
        {linkable.length > 0 && (
          <>
            <h3>Link another account</h3>
            <OAuthButtons
              providers={linkable}
              intent="link"
              showDivider={false}
              onStart={(id) => startOAuth(id, 'link')}
            />
          </>
        )}
      </section>

      {message && <p className="form-success">{message}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
