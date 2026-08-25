import { apiFetch } from './client'
import type {
  NoteSuggestionList,
  Transaction,
  TransactionList,
} from '../types'

export function listTransactions(params: {
  q?: string
  kind?: string
  category_id?: string
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_dir?: string
  limit?: number
  offset?: number
} = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') q.set(key, String(value))
  })
  const qs = q.toString()
  return apiFetch<TransactionList>(`/transactions${qs ? `?${qs}` : ''}`)
}

export function createTransaction(body: {
  category_id: string
  amount: string
  date: string
  note?: string | null
  withdraw_from_category_id?: string | null
}) {
  return apiFetch<Transaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateTransaction(
  id: string,
  body: {
    category_id?: string
    amount?: string
    date?: string
    note?: string | null
  },
) {
  return apiFetch<Transaction>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteTransaction(id: string) {
  return apiFetch<{ detail: string }>(`/transactions/${id}`, {
    method: 'DELETE',
  })
}

export function suggestNotes(params: {
  q?: string
  category_id?: string
  limit?: number
} = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') q.set(key, String(value))
  })
  const qs = q.toString()
  return apiFetch<NoteSuggestionList>(
    `/transactions/note-suggestions${qs ? `?${qs}` : ''}`,
  )
}
