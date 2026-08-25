/** Subset of the FastAPI schemas used by the expense-logging client. */

export type CategoryKind = 'income' | 'expense' | 'savings'

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface User {
  id: string
  username: string
  email: string | null
}

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  archived: boolean
  sort_order: number
}

export interface Transaction {
  id: string
  category_id: string
  amount: string
  date: string
  note: string | null
  pair_id?: string | null
  created_at: string
  updated_at: string
  category?: Category | null
}

export interface TransactionList {
  items: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface NoteSuggestion {
  note: string
  use_count: number
  last_date: string
  last_amount: string
  last_category_id: string
  last_category_name: string
  last_kind: CategoryKind
}

export interface NoteSuggestionList {
  items: NoteSuggestion[]
}

export interface ExpenseFunding {
  category_id: string
  funded_by_category_id: string | null
  funded_by_category_name: string | null
}
