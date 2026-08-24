import { apiFetch } from './client'
import type { ExpenseFunding } from '../types'

export function getExpenseFunding(
  year: number,
  month: number,
  categoryId: string,
) {
  return apiFetch<ExpenseFunding>(
    `/budgets/months/${year}/${month}/expense-funding/${categoryId}`,
  )
}
