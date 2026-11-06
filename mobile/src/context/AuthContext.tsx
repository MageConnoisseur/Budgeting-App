import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as authApi from '../api/auth'
import { ApiError, setUnauthorizedHandler } from '../api/client'
import { getCachedUser, getToken, setCachedUser, setToken } from '../storage'
import { retryNeedsAuth, syncNativeSession } from '../upload/native'
import type { User } from '../types'

interface AuthState {
  user: User | null
  hasSession: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [loading, setLoading] = useState(true)

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

  const login = useCallback(async (username: string, password: string) => {
    const tok = await authApi.login(username, password)
    await setToken(tok.access_token)
    const me = await authApi.getMe()
    await setCachedUser(me)
    setUser(me)
    setHasSession(true)
    await retryNeedsAuth(me.id)
  }, [])

  const value = useMemo(
    () => ({
      user,
      hasSession,
      loading,
      login,
      logout,
    }),
    [user, hasSession, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
