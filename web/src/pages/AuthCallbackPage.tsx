import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Receives JWT after OAuth redirect and finishes client-side session setup. */
export function AuthCallbackPage() {
  const { completeOAuthLogin } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    const linked = searchParams.get('linked')
    if (!token) {
      setError('Missing sign-in token from the provider callback.')
      return
    }
    void (async () => {
      try {
        await completeOAuthLogin(token)
        navigate(linked ? '/account?linked=' + encodeURIComponent(linked) : '/', {
          replace: true,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Social sign-in failed')
      }
    })()
  }, [completeOAuthLogin, navigate, searchParams])

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-name auth-brand">Setaside</p>
        <h1>Finishing sign-in…</h1>
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <p className="muted">Connecting your account. Hang tight.</p>
        )}
      </div>
    </div>
  )
}
