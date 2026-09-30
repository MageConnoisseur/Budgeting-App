import type { Category } from '../types/api'

/** Spendable savings pile (Emergency, Vacation). Extra loan payments are not. */
export function isSavingsBucket(category: Pick<Category, 'kind' | 'is_bucket'>): boolean {
  return category.kind === 'savings' && category.is_bucket !== false
}
