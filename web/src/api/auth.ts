import { apiBaseUrl, apiFetch, getToken } from './client'
import type {
  MessageResponse,
  OAuthProviderInfo,
  RecoveryTokenStatus,
  TokenResponse,
  User,
  ViewMode,
} from '../types/api'

export function register(username: string, email: string, password: string) {
  return apiFetch<TokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
}

export function login(username: string, password: string) {
  return apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function forgotPassword(identifier: string) {
  return apiFetch<MessageResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  })
}

export function getResetPasswordStatus(token: string) {
  return apiFetch<RecoveryTokenStatus>(
    `/auth/reset-password?token=${encodeURIComponent(token)}`,
  )
}

export function resetPassword(token: string, password: string) {
  return apiFetch<MessageResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export function changePassword(newPassword: string, currentPassword?: string) {
  return apiFetch<User>('/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({
      new_password: newPassword,
      current_password: currentPassword || undefined,
    }),
  })
}

export function getMe() {
  return apiFetch<User>('/auth/me')
}

export function updatePreferences(prefs: {
  preferred_budget_view?: ViewMode
  preferred_dashboard_view?: ViewMode
}) {
  return apiFetch<User>('/auth/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  })
}

export function updateProfile(email: string) {
  return apiFetch<User>('/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify({ email }),
  })
}

export function listOAuthProviders() {
  return apiFetch<OAuthProviderInfo[]>('/auth/oauth/providers')
}

export function unlinkOAuthProvider(provider: string) {
  return apiFetch<User>(`/auth/oauth/${provider}`, { method: 'DELETE' })
}

/** Full-page navigation into the API OAuth start endpoint. */
export function startOAuth(provider: string, intent: 'login' | 'link' = 'login') {
  const url = new URL(`${apiBaseUrl()}/api/auth/oauth/${provider}/start`)
  url.searchParams.set('intent', intent)
  if (intent === 'link') {
    const token = getToken()
    if (!token) throw new Error('Sign in before linking a social account')
    url.searchParams.set('access_token', token)
  }
  window.location.assign(url.toString())
}
