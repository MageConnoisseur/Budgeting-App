import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'
import { ApiError } from '../api/client'

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await forgotPassword(identifier.trim())
      setMessage(result.message)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : 'Could not send reset instructions',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Setaside</p>
        <h1>Reset password</h1>
        <p className="muted">
          Enter the username or email on your account. If we have a recovery
          address, we will send a one-hour reset link.
        </p>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Username or email
            <input
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-success">{message}</p>}
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="muted tiny">
          No email on the account, or an address you cannot access, means we
          cannot reset a forgotten password. Sign in with Google or Facebook if
          you linked those, then add a recovery email from Account.
        </p>
        <p className="muted">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
