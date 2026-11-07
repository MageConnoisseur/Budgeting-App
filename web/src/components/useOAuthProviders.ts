import { useCallback, useEffect, useState } from 'react'
import { listConfiguredOAuthProviders } from '../api/auth'
import type { OAuthProviderInfo } from '../types/api'

const LOAD_ERROR =
  "Google sign-in didn't load. The server may still be waking up."

export function useOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void listConfiguredOAuthProviders()
      .then((list) => {
        if (!cancelled) setProviders(list)
      })
      .catch(() => {
        if (!cancelled) {
          setProviders([])
          setError(LOAD_ERROR)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return { providers, error, loading, retry }
}
