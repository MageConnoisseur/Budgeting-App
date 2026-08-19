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
  const { user, updateEmail, unlinkProvider, refreshUser, changePassword } =
    useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(user?.email ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
      setMessage(
        'Email saved. Password reset mail will go here — double-check it is an inbox you can open.',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not update email')
    } finally {
      setSaving(false)
    }
  }

  async function onSavePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setSavingPassword(true)
    setError(null)
    setMessage(null)
    try {
      await changePassword(
        newPassword,
        user?.has_password ? currentPassword : undefined,
      )
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage(
        user?.has_password
          ? 'Password updated.'
          : 'Password set. You can sign in with username or email and this password.',
      )
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Could not update password',
      )
    } finally {
      setSavingPassword(false)
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
  const hasEmail = Boolean(user?.email)
  const canSetPassword = hasEmail || Boolean(user?.has_password)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Account</h1>
          <p className="muted">
            Keep a recovery email and a password (or linked Google / Facebook)
            so you never lose access to this budget.
          </p>
        </div>
      </header>

      <section className="panel stack">
        <h2>Account recovery</h2>
        {!hasEmail && (
          <div className="callout warn" role="status">
            <strong>No recovery email</strong>
            <p>
              Password reset cannot reach you until you add an address you can
              access. Social sign-in still works if it is linked below.
            </p>
          </div>
        )}
        {hasEmail && (
          <div className="callout ok" role="status">
            <strong>Recovery email on file</strong>
            <p>
              Forgot-password mail goes to <code>{user?.email}</code>. Keep this
              accurate — we do not send a separate confirmation email.
            </p>
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2>Profile</h2>
        <p>
          <span className="muted">Username</span>
          <br />
          <strong>{user?.username}</strong>
        </p>
        <form className="stack" onSubmit={onSaveEmail}>
          <label>
            Recovery email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <p className="muted tiny">
            This is the inbox used for password reset. There is no verification
            step — a typo means a forgotten password cannot be recovered.
          </p>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save email'}
          </button>
        </form>
      </section>

      <section className="panel stack">
        <h2>{user?.has_password ? 'Change password' : 'Set a password'}</h2>
        {user?.has_password ? (
          <p className="muted">
            Use a new password for username / email sign-in. This does not
            unlink Google or Facebook.
          </p>
        ) : (
          <p className="muted">
            This account is social-only. Set a password if you want a backup
            sign-in method. You will need a recovery email first.
          </p>
        )}
        {!canSetPassword && (
          <p className="callout warn">
            Add a recovery email above before setting a password so a forgotten
            password can be reset.
          </p>
        )}
        <form className="stack" onSubmit={onSavePassword}>
          {user?.has_password && (
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
          )}
          <label>
            {user?.has_password ? 'New password' : 'Password'}
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={!canSetPassword}
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={!canSetPassword}
            />
          </label>
          <button
            className="btn primary"
            type="submit"
            disabled={savingPassword || !canSetPassword}
          >
            {savingPassword
              ? 'Saving…'
              : user?.has_password
                ? 'Update password'
                : 'Set password'}
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
