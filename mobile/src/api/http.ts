/** Pure HTTP helper — no React Native imports, so Node tests can use it. */

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

export function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api${path}`
}

export function parseErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          d && typeof d === 'object' && 'msg' in d
            ? String((d as { msg?: string }).msg ?? JSON.stringify(d))
            : JSON.stringify(d),
        )
        .join('; ')
    }
  }
  return fallback
}

export async function apiRequest<T>(
  path: string,
  options: {
    baseUrl: string
    token?: string | null
    method?: string
    body?: string
    headers?: Record<string, string>
  },
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const url = apiUrl(options.baseUrl, path)
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body,
    })
  } catch {
    throw new ApiError(
      0,
      `Cannot reach API at ${options.baseUrl.replace(/\/$/, '')}. Check EXPO_PUBLIC_API_URL.`,
    )
  }

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    let detail = res.statusText || 'Request failed'
    try {
      detail = parseErrorDetail(await res.json(), detail)
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await res.json()) as T
  }
  return undefined as T
}
