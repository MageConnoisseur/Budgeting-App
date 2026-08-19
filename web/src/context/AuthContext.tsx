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
import { ApiError, getToken, setToken } from '../api/client'
import type { User, ViewMode } from '../types/api'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  completeOAuthLogin: (accessToken: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  setPreferredView: (
    which: 'budget' | 'dashboard',
    mode: ViewMode,
  ) => Promise<void>
  updateEmail: (email: string) => Promise<void>
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>
  unlinkProvider: (provider: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.getMe()
      setUser(me)
      setError(null)
    } catch (e) {
      setUser(null)
      setToken(null)
      if (e instanceof ApiError && e.status !== 401) {
        setError(e.detail)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    const tok = await authApi.login(username, password)
    setToken(tok.access_token)
    const me = await authApi.getMe()
    setUser(me)
  }, [])

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      setError(null)
      const tok = await authApi.register(username, email, password)
      setToken(tok.access_token)
      const me = await authApi.getMe()
      setUser(me)
    },
    [],
  )

  const completeOAuthLogin = useCallback(async (accessToken: string) => {
    setError(null)
    setToken(accessToken)
    const me = await authApi.getMe()
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const setPreferredView = useCallback(
    async (which: 'budget' | 'dashboard', mode: ViewMode) => {
      const body =
        which === 'budget'
          ? { preferred_budget_view: mode }
          : { preferred_dashboard_view: mode }
      const updated = await authApi.updatePreferences(body)
      setUser(updated)
    },
    [],
  )

  const updateEmail = useCallback(async (email: string) => {
    const updated = await authApi.updateProfile(email)
    setUser(updated)
  }, [])

  const changePassword = useCallback(
    async (newPassword: string, currentPassword?: string) => {
      const updated = await authApi.changePassword(newPassword, currentPassword)
      setUser(updated)
    },
    [],
  )

  const unlinkProvider = useCallback(async (provider: string) => {
    const updated = await authApi.unlinkOAuthProvider(provider)
    setUser(updated)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      register,
      completeOAuthLogin,
      logout,
      refreshUser,
      setPreferredView,
      updateEmail,
      changePassword,
      unlinkProvider,
    }),
    [
      user,
      loading,
      error,
      login,
      register,
      completeOAuthLogin,
      logout,
      refreshUser,
      setPreferredView,
      updateEmail,
      changePassword,
      unlinkProvider,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
