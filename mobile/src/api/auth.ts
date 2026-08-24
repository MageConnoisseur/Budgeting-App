import { apiFetch } from './client'
import type { TokenResponse, User } from '../types'

export function login(username: string, password: string) {
  return apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function getMe() {
  return apiFetch<User>('/auth/me')
}
