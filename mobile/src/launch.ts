import type { CategoryKind } from './types'

const KINDS = new Set<CategoryKind>(['income', 'expense', 'savings'])

export function kindFromLaunchUrl(
  url: string | null | undefined,
): CategoryKind | null {
  if (!url) return null
  const match = /^setaside:\/\/log\/(income|expense|savings)(?:[/?#]|$)/.exec(url)
  if (!match) return null
  const kind = match[1]
  return KINDS.has(kind as CategoryKind) ? (kind as CategoryKind) : null
}

export interface AuthLaunch {
  token: string | null
  error: string | null
}

/** Session handoff after Continue with Google. Other setaside links are ignored. */
export function authFromLaunchUrl(
  url: string | null | undefined,
): AuthLaunch | null {
  if (!url || !url.startsWith('setaside://auth')) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'setaside:' || parsed.hostname !== 'auth') return null
  const token = parsed.searchParams.get('token')
  const detail = parsed.searchParams.get('detail')
  const code = parsed.searchParams.get('oauth_error')
  const error =
    detail || (code ? `Google sign-in failed (${code}).` : null)
  if (!token && !error) return null
  return { token: token || null, error }
}
