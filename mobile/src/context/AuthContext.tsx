import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Linking } from 'react-native'
import * as authApi from '../api/auth'
import { ApiError, setUnauthorizedHandler } from '../api/client'
import { authFromLaunchUrl } from '../launch'
import { getCachedUser, getToken, setCachedUser, setToken } from '../storage'
import { retryNeedsAuth, syncNativeSession } from '../upload/native'
import type { User } from '../types'

interface AuthState {
  user: User | null
  hasSession: boolean
  loading: boolean
  oauthError: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearOauthError: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [loading, setLoading] = useState(true)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const logout = useCallback(async () => {
    await setToken(null)
    await setCachedUser(null)
    setUser(null)
    setHasSession(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = await getToken()
      if (!token) {
        if (!cancelled) setLoading(false)
        return
      }
      await syncNativeSession(token)
      const cached = await getCachedUser()
      if (!cancelled) {
        if (cached) setUser(cached)
        setHasSession(true)
        setLoading(false)
      }
      try {
        const me = await authApi.getMe()
        if (cancelled) return
        setUser(me)
        await setCachedUser(me)
        await retryNeedsAuth(me.id)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await setToken(null)
          await setCachedUser(null)
          if (!cancelled) {
            setUser(null)
            setHasSession(false)
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setHasSession(false)
      void setCachedUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const adoptToken = useCallback(async (token: string) => {
    await setToken(token)
    const me = await authApi.getMe()
    await setCachedUser(me)
    setUser(me)
    setHasSession(true)
    setOauthError(null)
    await retryNeedsAuth(me.id)
  }, [])

  useEffect(() => {
    let cancelled = false
    let handled: string | null = null

    const handle = (url: string | null) => {
      if (!url || url === handled || cancelled) return
      const auth = authFromLaunchUrl(url)
      if (!auth) return
      handled = url
      if (auth.token) {
        void adoptToken(auth.token).catch((err: unknown) => {
          if (cancelled) return
          setOauthError(
            err instanceof ApiError ? err.detail : 'Google sign-in failed.',
          )
        })
        return
      }
      if (auth.error) setOauthError(auth.error)
    }

    void Linking.getInitialURL().then((url) => {
      if (!cancelled) handle(url)
    })
    const subscription = Linking.addEventListener('url', (event) => {
      handle(event.url)
    })
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [adoptToken])

  const login = useCallback(
    async (username: string, password: string) => {
      setOauthError(null)
      const tok = await authApi.login(username, password)
      await adoptToken(tok.access_token)
    },
    [adoptToken],
  )

  const clearOauthError = useCallback(() => setOauthError(null), [])

  const value = useMemo(
    () => ({
      user,
      hasSession,
      loading,
      oauthError,
      login,
      logout,
      clearOauthError,
    }),
    [user, hasSession, loading, oauthError, login, logout, clearOauthError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
