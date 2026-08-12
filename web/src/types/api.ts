/** Types matching the FastAPI schemas (Phase 1). */

export type CategoryKind = 'income' | 'expense' | 'savings'
export type ViewMode = 'monthly' | 'annual'

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface OAuthProviderInfo {
  id: string
  name: string
  configured: boolean
}

export interface User {
  id: string
  username: string
  email: string | null
  has_password: boolean
  oauth_providers: string[]
  preferred_budget_view: ViewMode
  preferred_dashboard_view: ViewMode
  created_at: string
}

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BudgetLine {
  id: string
  category_id: string
  planned_amount: string
  category?: Category | null
}

export interface BudgetMonth {
  id: string
  year: number
  month: number
  lines: BudgetLine[]
  seeded_from?: string | null
  created_at: string
  updated_at: string
}

export interface AnnualBudget {
  year: number
  months: BudgetMonth[]
}

export interface BudgetTemplateLine {
  id: string
  category_id: string
  planned_amount: string
}

export interface BudgetTemplate {
  id: string
  name: string
  lines: BudgetTemplateLine[]
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  category_id: string
  amount: string
  date: string
  note: string | null
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

export interface KindTotals {
  planned: string
  actual: string
  remaining: string
  over_budget: boolean
}

export interface CategoryProgress {
  category_id: string
  category_name: string
  kind: CategoryKind
  planned: string
  actual: string
  remaining: string
  over_budget: boolean
}

export interface SavingsBucket {
  category_id: string
  category_name: string
  balance: string
  planned_this_period: string
  actual_this_period: string
  over_budget: boolean
}

export interface SpendingPaceDay {
  date: string
  income: string
  expense: string
  savings: string
  cumulative_income: string
  cumulative_expense: string
  cumulative_savings: string
  cumulative_outflow: string
  cumulative_net: string
  cumulative_expected_income: string
}

export interface SpendingPace {
  as_of: string
  window_start: string
  window_end: string
  window_days: number
  income: string
  expense: string
  savings: string
  outflow: string
  net: string
  average_daily_income: string
  expected_income: string
  income_lookback_start: string | null
  income_lookback_end: string | null
  income_lookback_days: number
  tracking_started_on: string | null
  overspending: boolean
  has_data: boolean
  days: SpendingPaceDay[]
}

export interface MonthlyDashboard {
  year: number
  month: number
  income: KindTotals
  expense: KindTotals
  savings: KindTotals
  categories: CategoryProgress[]
  savings_buckets: SavingsBucket[]
  spending_pace: SpendingPace
}

export interface MonthlyTrendPoint {
  year: number
  month: number
  income_planned: string
  income_actual: string
  expense_planned: string
  expense_actual: string
  savings_planned: string
  savings_actual: string
}

export interface CategoryTrend {
  category_id: string
  category_name: string
  kind: CategoryKind
  months_over_budget: number
  months_under_budget: number
  total_planned: string
  total_actual: string
}

export interface AnnualDashboard {
  year: number
  months: MonthlyTrendPoint[]
  category_trends: CategoryTrend[]
  income: KindTotals
  expense: KindTotals
  savings: KindTotals
  savings_buckets: SavingsBucket[]
  spending_pace: SpendingPace
}

export interface DashboardWidget {
  id: string
  type: string
  title?: string | null
  config: Record<string, unknown>
  order: number
}

export interface DashboardLayout {
  view_mode: ViewMode
  widgets: DashboardWidget[]
}

export type TransactionSortBy = 'date' | 'amount' | 'category' | 'kind' | 'created_at'
export type SortDir = 'asc' | 'desc'
