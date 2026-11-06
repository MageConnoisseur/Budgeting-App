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
