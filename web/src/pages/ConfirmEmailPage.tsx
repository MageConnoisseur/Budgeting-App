import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmEmail, getConfirmEmailStatus } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

export function ConfirmEmailPage() {
  const { user, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>(
    'checking',
  )
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setDetail('This confirmation link is missing a token.')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const check = await getConfirmEmailStatus(token)
        if (!check.valid) {
          throw new ApiError(
            400,
            'This confirmation link is invalid or has expired.',
          )
        }
        const result = await confirmEmail(token)
        if (cancelled) return
        setStatus('success')
        setDetail(result.message)
        await refreshUser()
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setDetail(
          err instanceof ApiError
            ? err.detail
            : 'Could not confirm this email.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUser, token])

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Hearth Budgeting</p>
        <h1>Confirm recovery email</h1>
        {status === 'checking' && (
          <p className="muted">Confirming this address…</p>
        )}
        {status === 'success' && (
          <>
            <p className="form-success">{detail}</p>
            <p className="muted">
              {user ? (
                <Link to="/account">Back to Account</Link>
              ) : (
                <Link to="/login">Sign in</Link>
              )}
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="form-error">{detail}</p>
            <p className="muted">
              {user ? (
                <Link to="/account">Request a new confirmation from Account</Link>
              ) : (
                <Link to="/login">Back to sign in</Link>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
