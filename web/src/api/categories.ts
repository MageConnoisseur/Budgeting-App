import { apiFetch } from './client'
import type { Category, CategoryKind } from '../types/api'

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

export function createCategory(body: {
  kind: CategoryKind
  name: string
  sort_order?: number
  target_amount?: string | null
}) {
  return apiFetch<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateCategory(
  id: string,
  body: {
    name?: string
    archived?: boolean
    sort_order?: number
    target_amount?: string | null
  },
) {
  return apiFetch<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function archiveCategory(id: string) {
  return apiFetch<void>(`/categories/${id}`, { method: 'DELETE' })
}
