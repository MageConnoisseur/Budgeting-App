const TOKEN_KEY = 'budget_desk_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function apiBaseUrl(): string {
  const base = import.meta.env.VITE_API_URL as string | undefined
  return (base ?? 'http://localhost:8000').replace(/\/$/, '')
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText || 'Request failed'
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
    else if (Array.isArray(body?.detail)) {
      detail = body.detail
        .map((d: { msg?: string }) => d.msg ?? JSON.stringify(d))
        .join('; ')
    }
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, detail)
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const url = `${apiBaseUrl()}/api${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(
      0,
      `Cannot reach API at ${apiBaseUrl()}. Check VITE_API_URL and that the API is running (CORS must allow this site).`,
    )
  }

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null)
    }
    throw await parseError(res)
  }

  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json() as Promise<T>
  }
  return undefined as T
}
