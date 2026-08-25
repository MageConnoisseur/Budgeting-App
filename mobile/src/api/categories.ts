import { apiFetch } from './client'
import type { Category, CategoryKind } from '../types'

export function listCategories(params?: {
  kind?: CategoryKind
  include_archived?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.kind) q.set('kind', params.kind)
  if (params?.include_archived) q.set('include_archived', 'true')
  const qs = q.toString()
  return apiFetch<Category[]>(`/categories${qs ? `?${qs}` : ''}`)
}
