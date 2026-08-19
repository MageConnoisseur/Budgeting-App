import { type FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getResetPasswordStatus, resetPassword } from '../api/auth'
import { ApiError } from '../api/client'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [checking, setChecking] = useState(Boolean(token))
  const [valid, setValid] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setChecking(false)
      setValid(false)
      return
    }
    let cancelled = false
    setChecking(true)
    void getResetPasswordStatus(token)
      .then((status) => {
        if (!cancelled) setValid(status.valid)
      })
      .catch(() => {
        if (!cancelled) setValid(false)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await resetPassword(token, password)
      setMessage(result.message)
      setValid(false)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Could not update password',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Setaside</p>
        <h1>Choose a new password</h1>
        {checking ? (
          <p className="muted">Checking this reset link…</p>
        ) : message ? (
          <>
            <p className="form-success">{message}</p>
            <p className="muted">
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : !token || !valid ? (
          <>
            <p className="form-error">
              This reset link is invalid or has expired. Request a new one.
            </p>
            <p className="muted">
              <Link to="/forgot-password">Send a new reset link</Link>
            </p>
          </>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <label>
              New password
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
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                maxLength={128}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
