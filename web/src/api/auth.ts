import { apiFetch } from './client'
import type { TokenResponse, User, ViewMode } from '../types/api'

export function register(username: string, password: string) {
  return apiFetch<TokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function login(username: string, password: string) {
  return apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
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
