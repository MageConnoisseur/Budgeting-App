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
import { getToken, setToken } from '../storage'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(async () => {
    await setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.getMe()
      setUser(me)
    } catch (err) {
      setUser(null)
      await setToken(null)
      if (!(err instanceof ApiError && err.status === 401)) {
        // Keep going; login screen will show a connection error on submit.
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const tok = await authApi.login(username, password)
    await setToken(tok.access_token)
    const me = await authApi.getMe()
    setUser(me)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
