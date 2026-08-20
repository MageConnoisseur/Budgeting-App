/** Types matching the FastAPI schemas (Phase 1). */

export type CategoryKind = 'income' | 'expense' | 'savings'
export type ViewMode = 'monthly' | 'annual'

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface MessageResponse {
  message: string
}

export interface RecoveryTokenStatus {
  valid: boolean
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
  email_verified: boolean
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
  /** Optional savings goal amount; null when unset or non-savings. */
  target_amount: string | null
  created_at: string
  updated_at: string
}

export interface BudgetLine {
  id: string
  category_id: string
  planned_amount: string
  funded_by_category_id?: string | null
  funded_by_category?: Category | null
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

export interface MonthActuals {
  month: number
  /** category_id → actual amount logged that month */
  actuals: Record<string, string>
}

export interface YearActuals {
  year: number
  months: MonthActuals[]
}

export interface BudgetTemplateLine {
  id: string
  category_id: string
  planned_amount: string
  funded_by_category_id?: string | null
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
  funded_by_category_id?: string | null
  funded_by_category_name?: string | null
  committed?: boolean
}

export interface SavingsBucket {
  category_id: string
  category_name: string
  balance: string
  planned_this_period: string
  actual_this_period: string
  over_budget: boolean
  target_amount: string | null
  target_reached: boolean
  projected_hit_year: number | null
  projected_hit_month: number | null
  monthly_contribution: string
  planned_use_this_period?: string
  actual_use_this_period?: string
  use_over_balance?: boolean
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

export type CoachTipKind =
  | 'get_started'
  | 'allocate_surplus'
  | 'close_shortfall'
  | 'fund_savings'
  | 'raise_plan'
  | 'seasonal'
  | 'pace_warning'
  | 'balanced'
  | 'income_short'

export type CoachTone =
  | 'getting_started'
  | 'surplus'
  | 'shortfall'
  | 'balanced'
  | 'watch'

export interface CoachTip {
  id: string
  kind: CoachTipKind
  title: string
  message: string
  priority: number
  category_id: string | null
  category_name: string | null
  apply_year: number | null
  apply_month: number | null
  current_planned: string | null
  suggested_planned: string | null
  amount: string | null
  apply_label: string | null
  cta_href: string | null
  cta_label: string | null
}

export interface BudgetCoach {
  headline: string
  tone: CoachTone
  leftover_planned: string
  leftover_actual: string
  apply_year: number
  apply_month: number
  tips: CoachTip[]
}

export interface PaycheckLeftover {
  income: string
  expense_from_income: string
  expense_from_savings: string
  savings_contributions: string
  leftover: string
}

export interface ExpenseFunding {
  category_id: string
  funded_by_category_id: string | null
  funded_by_category_name: string | null
}

export interface DashboardTransaction {
  id: string
  category_id: string
  category_name: string
  kind: CategoryKind
  amount: string
  date: string
  note: string | null
}

export interface RecurringLoadItem {
  schedule_id: string
  category_id: string
  category_name: string
  kind: CategoryKind
  amount: string
  note: string | null
  next_occurrence: string
  occurrences_this_period: number
  remaining_in_category: string
  logged_this_period: string
}

export interface SpendingRunway {
  as_of: string
  days_in_month: number
  days_elapsed: number
  days_left: number
  expense_planned: string
  expense_actual: string
  expense_remaining: string
  daily_spent: string
  daily_remaining: string
  ahead: boolean
  has_data: boolean
}

export interface FlexibleSplit {
  committed_planned: string
  committed_actual: string
  flexible_planned: string
  flexible_actual: string
  funded_planned: string
  funded_actual: string
  leftover_planned: string
  leftover_actual: string
  savings_planned: string
  savings_actual: string
}

export interface TradeoffSuggestion {
  source_category_id: string
  source_category_name: string
  unused_planned: string
  dest_category_id: string
  dest_category_name: string
  dest_target_amount: string | null
  current_source_planned: string
  current_dest_planned: string
  suggested_source_planned: string
  suggested_dest_planned: string
  apply_year: number
  apply_month: number
  hit_before: string | null
  hit_after: string | null
  message: string
}

export interface CategoryMonthCell {
  category_id: string
  category_name: string
  kind: CategoryKind
  month: number
  planned: string
  actual: string
}

export interface SavingsHistoryPoint {
  month: number
  balance: string
  contribution: string
  withdrawal: string
}

export interface SavingsHistorySeries {
  category_id: string
  category_name: string
  target_amount: string | null
  points: SavingsHistoryPoint[]
}

export interface MonthlyDashboard {
  year: number
  month: number
  income: KindTotals
  expense: KindTotals
  savings: KindTotals
  leftover_planned: PaycheckLeftover
  leftover_actual: PaycheckLeftover
  categories: CategoryProgress[]
  savings_buckets: SavingsBucket[]
  spending_pace: SpendingPace
  coach: BudgetCoach
  top_transactions?: DashboardTransaction[]
  recurring_load?: RecurringLoadItem[]
  runway?: SpendingRunway | null
  flexible_split?: FlexibleSplit | null
  tradeoffs?: TradeoffSuggestion[]
  last_month?: MonthlyTrendPoint | null
  same_month_last_year?: MonthlyTrendPoint | null
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

export type PlanSuggestionKind = 'median_raise' | 'seasonal'

export interface PlanSuggestion {
  category_id: string
  category_name: string
  kind: CategoryKind
  suggestion_kind: PlanSuggestionKind
  months_over: number
  median_overrun: string | null
  apply_year: number | null
  apply_month: number | null
  current_planned: string | null
  suggested_planned: string | null
  message: string
}

export type CategoryHealthStatus = 'stable' | 'volatile' | 'under_planned'

export interface CategoryHealthScore {
  category_id: string
  category_name: string
  kind: CategoryKind
  status: CategoryHealthStatus
  months_scored: number
  months_over_budget: number
  mean_ratio: string
  volatility: number
  lookback_months: number
  message: string
}

export interface AnnualDashboard {
  year: number
  months: MonthlyTrendPoint[]
  category_trends: CategoryTrend[]
  plan_suggestions: PlanSuggestion[]
  category_health: CategoryHealthScore[]
  income: KindTotals
  expense: KindTotals
  savings: KindTotals
  leftover_planned: PaycheckLeftover
  leftover_actual: PaycheckLeftover
  savings_buckets: SavingsBucket[]
  spending_pace: SpendingPace
  coach: BudgetCoach
  top_transactions?: DashboardTransaction[]
  flexible_split?: FlexibleSplit | null
  tradeoffs?: TradeoffSuggestion[]
  category_month_cells?: CategoryMonthCell[]
  savings_history?: SavingsHistorySeries[]
  prior_year?: MonthlyTrendPoint | null
}

export interface DashboardWidget {
  id: string
  type: string
  title?: string | null
  /**
   * Widget-specific options plus layout:
   * `x`, `y`, `w`, `h` (12-col grid), `hidden` (kept in the list so new
   * defaults can still merge without re-showing a removed widget).
   */
  config: Record<string, unknown>
  order: number
}

export interface DashboardLayoutPreset {
  id: string
  name: string
  widgets: DashboardWidget[]
}

export interface DashboardLayout {
  view_mode: ViewMode
  widgets: DashboardWidget[]
  presets?: DashboardLayoutPreset[]
  active_preset_id?: string | null
}

export type TransactionSortBy = 'date' | 'amount' | 'category' | 'kind' | 'created_at'
export type SortDir = 'asc' | 'desc'

export type RecurrenceFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'

export interface RecurringSchedule {
  id: string
  category_id: string
  amount: string
  note: string | null
  frequency: RecurrenceFrequency
  anchor_day: number
  start_date: string
  end_date: string | null
  next_occurrence: string
  active: boolean
  created_at: string
  updated_at: string
  category?: Category | null
  is_due?: boolean
}

export interface RecurringScheduleList {
  items: RecurringSchedule[]
}

export interface RecurringLogResult {
  transaction: Transaction
  schedule: RecurringSchedule
}

export interface RecurringPatternSuggestion {
  category_id: string
  category_name: string
  kind: CategoryKind
  suggested_amount: string
  suggested_frequency: RecurrenceFrequency
  suggested_anchor_day: number
  sample_count: number
  average_interval_days: string
  last_date: string
  sample_note: string | null
  confidence: 'low' | 'medium' | 'high'
  message: string
}

export interface RecurringPatternSuggestionList {
  items: RecurringPatternSuggestion[]
}

export type IncomeEstimateMethod =
  | 'schedule'
  | 'history_median'
  | 'history_mean'
  | 'mixed'

export interface IncomeEstimateCategory {
  category_id: string
  category_name: string
  estimated_amount: string
  method: IncomeEstimateMethod
  occurrence_count: number
  sample_months: number
  message: string
}

export interface IncomeEstimate {
  year: number
  month: number
  estimated_total: string
  planned_total: string
  actual_to_date: string
  categories: IncomeEstimateCategory[]
  based_on_schedules: number
  based_on_history: number
  message: string
}
