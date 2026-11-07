import { useEffect, useState } from 'react'
import type { OAuthProviderInfo } from '../types/api'

interface Props {
  providers: OAuthProviderInfo[]
  intent: 'login' | 'link'
  onStart: (providerId: string) => void
  showDivider?: boolean
}

export function OAuthButtons({
  providers,
  intent,
  onStart,
  showDivider = true,
}: Props) {
  if (providers.length === 0) return null

  const label = intent === 'link' ? 'Link' : 'Continue with'

  return (
    <div className="oauth-block">
      <div className="oauth-buttons">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn oauth oauth-${p.id}`}
            onClick={() => onStart(p.id)}
          >
            {label} {p.name}
          </button>
        ))}
      </div>
      {showDivider && (
        <div className="oauth-divider" role="separator">
          <span>or</span>
        </div>
      )}
    </div>
  )
}

/** Shown while Google is still loading, or when that request failed. */
export function OAuthStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (!loading) {
      setShowLoading(false)
      return
    }
    const timer = window.setTimeout(() => setShowLoading(true), 700)
    return () => window.clearTimeout(timer)
  }, [loading])

  if (error) {
    return (
      <p className="form-error" role="status">
        {error}{' '}
        <button type="button" className="btn linkish" onClick={onRetry}>
          Retry
        </button>
      </p>
    )
  }
  if (!showLoading) return null
  return (
    <p className="muted tiny" role="status">
      Loading Google sign-in…
    </p>
  )
}
