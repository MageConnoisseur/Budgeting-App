import { apiBaseUrl } from './config'
import { ApiError, apiRequest } from './http'
import { getToken, setToken } from '../storage'

export { ApiError }

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<T> {
  const token = await getToken()
  try {
    return await apiRequest<T>(path, {
      baseUrl: apiBaseUrl(),
      token,
      method: options.method,
      body: options.body,
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await setToken(null)
      onUnauthorized?.()
    }
    throw err
  }
}
