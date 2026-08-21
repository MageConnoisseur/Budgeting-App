/**
 * Dashboard widget catalog.
 *
 * Adding a widget later:
 * 1. Append a definition here (stable `id`, `type`, title, views, defaultSize).
 * 2. Append the same id to DEFAULT_*_WIDGETS in api/app/routers/dashboard.py
 *    so existing saved layouts receive it on next load.
 * 3. Render `type` in DashboardPage (or a dedicated component).
 *
 * Layout (x/y/w/h) and hide/show live in widget.config so the API schema
 * stays a generic list — no per-widget backend change.
 */
import type { DashboardWidget, ViewMode } from '../types/api'

/** CSS grid columns. Width `w` is 1–12. */
export const GRID_COLS = 12
/** Must match `--dash-row` in index.css */
export const GRID_ROW_PX = 56
/** Must match `--dash-gap` in index.css */
export const GRID_GAP_PX = 12

export type GridRect = {
  x: number
  y: number
  w: number
  h: number
}

export type WidgetDefinition = {
  /** Stable layout id (unique per monthly/annual catalog). */
  id: string
  type: string
  title: string
  description: string
  views: ViewMode[]
  defaultSize: Pick<GridRect, 'w' | 'h'>
  minSize: Pick<GridRect, 'w' | 'h'>
  config?: Record<string, unknown>
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    id: 'budget-coach',
    type: 'budget_coach',
    title: 'Budget coach',
    description: 'Leftover, shortfall, and savings-target tips',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'true-leftover',
    type: 'true_leftover',
    title: 'True leftover',
    description: 'Income minus unfunded expenses and savings',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'spending-pace',
    type: 'spending_pace',
    title: 'Spending pace',
    description: 'Rolling 30-day actuals vs average income',
    views: ['monthly'],
    defaultSize: { w: 12, h: 8 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'income-progress',
    type: 'kind_progress',
    title: 'Income',
    description: 'Income plan vs actual',
    views: ['monthly'],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    config: { kind: 'income' },
  },
  {
    id: 'expense-progress',
    type: 'kind_progress',
    title: 'Expenses',
    description: 'Expense plan vs actual',
    views: ['monthly'],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    config: { kind: 'expense' },
  },
  {
    id: 'savings-progress',
    type: 'kind_progress',
    title: 'Savings',
    description: 'Savings contribution plan vs actual',
    views: ['monthly'],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    config: { kind: 'savings' },
  },
  {
    id: 'cashflow-trend',
    type: 'cashflow_trend',
    title: 'Year cash-flow trend',
    description: 'Month-to-month actuals for this year',
    views: ['monthly'],
    defaultSize: { w: 12, h: 7 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'savings-buckets',
    type: 'savings_buckets',
    title: 'Savings buckets',
    description: 'Balances, contributions, and targets',
    views: ['monthly'],
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'category-breakdown',
    type: 'category_breakdown',
    title: 'Categories',
    description: 'Plan vs actual by category',
    views: ['monthly'],
    defaultSize: { w: 6, h: 10 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'allocation-snapshot',
    type: 'allocation_snapshot',
    title: 'This month at a glance',
    description: 'Income, leftover, savings rate, and plan used',
    views: ['monthly'],
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
  },
  {
    id: 'allocation-mix',
    type: 'allocation_mix',
    title: 'Planned vs actual mix',
    description: 'Share of spending as planned vs as spent',
    views: ['monthly'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'leftover-waterfall',
    type: 'leftover_waterfall',
    title: 'Leftover waterfall',
    description: 'Income to leftover after unfunded spend and savings',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'spending-runway',
    type: 'spending_runway',
    title: 'Month runway',
    description: 'Remaining expense plan vs days left in the month',
    views: ['monthly'],
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'largest-movers',
    type: 'largest_movers',
    title: 'Largest movers',
    description: 'Biggest transactions this period',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'recurring-due',
    type: 'recurring_due',
    title: 'Recurring vs remaining',
    description: 'Known bills this month vs remaining plan',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'month-compare',
    type: 'month_compare',
    title: 'This month vs last',
    description: 'Compare this month with last month and last year',
    views: ['monthly'],
    defaultSize: { w: 12, h: 6 },
    minSize: { w: 6, h: 4 },
  },
  {
    id: 'category-drilldown',
    type: 'category_drilldown',
    title: 'Category drill-down',
    description: 'One category’s plan, actuals, and largest notes',
    views: ['monthly'],
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'underused-plan',
    type: 'underused_plan',
    title: 'Unused plan',
    description: 'Categories finishing under plan — dollars to reallocate',
    views: ['monthly'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'flexible-split',
    type: 'flexible_split',
    title: 'Flexible vs committed',
    description: 'Where leftover can actually come from',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'savings-trajectory',
    type: 'savings_trajectory',
    title: 'Savings trajectory',
    description: 'Bucket balances over the year toward a target',
    views: ['monthly'],
    defaultSize: { w: 12, h: 7 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'bucket-flow',
    type: 'bucket_flow',
    title: 'Bucket fill vs use',
    description: 'Contributions in vs planned use out',
    views: ['monthly'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'tradeoff',
    type: 'tradeoff',
    title: 'Reallocate leftover',
    description: 'Move unused plan into a savings target',
    views: ['monthly'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'budget-coach-year',
    type: 'budget_coach',
    title: 'Budget coach',
    description: 'Year-scoped leftover and plan tips',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'true-leftover-year',
    type: 'true_leftover',
    title: 'True leftover',
    description: 'Year leftover after unfunded spend',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'spending-pace-year',
    type: 'spending_pace',
    title: 'Spending pace',
    description: 'Rolling 30-day actuals vs average income',
    views: ['annual'],
    defaultSize: { w: 12, h: 8 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'year-totals',
    type: 'year_totals',
    title: 'Year totals',
    description: 'Income, expenses, and savings for the year',
    views: ['annual'],
    defaultSize: { w: 12, h: 5 },
    minSize: { w: 6, h: 3 },
  },
  {
    id: 'month-trends',
    type: 'month_trends',
    title: 'Month-to-month trends',
    description: 'Actuals and remainder across the year',
    views: ['annual'],
    defaultSize: { w: 12, h: 12 },
    minSize: { w: 6, h: 6 },
  },
  {
    id: 'over-budget-patterns',
    type: 'category_trends',
    title: 'Repeated overruns',
    description: 'Categories that run over across months',
    views: ['annual'],
    defaultSize: { w: 6, h: 10 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'category-health',
    type: 'category_health',
    title: 'Category health',
    description: 'Stable, volatile, or under-planned',
    views: ['annual'],
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'savings-buckets-year',
    type: 'savings_buckets',
    title: 'Savings buckets',
    description: 'Balances and yearly planned use',
    views: ['annual'],
    defaultSize: { w: 12, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'allocation-snapshot-year',
    type: 'allocation_snapshot',
    title: 'This year at a glance',
    description: 'Income, leftover, and savings rate for the year',
    views: ['annual'],
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
  },
  {
    id: 'allocation-mix-year',
    type: 'allocation_mix',
    title: 'Planned vs actual mix',
    description: 'Year share of spending as planned vs as spent',
    views: ['annual'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'leftover-waterfall-year',
    type: 'leftover_waterfall',
    title: 'Leftover waterfall',
    description: 'Year income to leftover after unfunded spend',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'largest-movers-year',
    type: 'largest_movers',
    title: 'Largest movers',
    description: 'Biggest transactions this year',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'category-drilldown-year',
    type: 'category_drilldown',
    title: 'Category drill-down',
    description: 'One category across the year',
    views: ['annual'],
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'underused-plan-year',
    type: 'underused_plan',
    title: 'Unused plan',
    description: 'Categories that finish under plan most months',
    views: ['annual'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'flexible-split-year',
    type: 'flexible_split',
    title: 'Flexible vs committed',
    description: 'Year split of committed vs flexible spend',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'savings-trajectory-year',
    type: 'savings_trajectory',
    title: 'Savings trajectory',
    description: 'Bucket balances over the year toward a target',
    views: ['annual'],
    defaultSize: { w: 12, h: 7 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'bucket-flow-year',
    type: 'bucket_flow',
    title: 'Bucket fill vs use',
    description: 'Year contributions vs planned use',
    views: ['annual'],
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
  },
  {
    id: 'tradeoff-year',
    type: 'tradeoff',
    title: 'Reallocate leftover',
    description: 'Move unused plan into a savings target',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
  {
    id: 'plan-heatmap',
    type: 'plan_heatmap',
    title: 'Plan vs actual heatmap',
    description: 'Categories × months colored by actual ÷ plan',
    views: ['annual'],
    defaultSize: { w: 12, h: 9 },
    minSize: { w: 6, h: 6 },
  },
  {
    id: 'plan-drift',
    type: 'plan_drift',
    title: 'Plan drift',
    description: 'How planned amounts changed over the year',
    views: ['annual'],
    defaultSize: { w: 12, h: 7 },
    minSize: { w: 6, h: 5 },
  },
  {
    id: 'income-reliability',
    type: 'income_reliability',
    title: 'Income reliability',
    description: 'Months income landed vs plan',
    views: ['annual'],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
  },
]

export function catalogForView(view: ViewMode): WidgetDefinition[] {
  return WIDGET_CATALOG.filter((d) => d.views.includes(view))
}

export function definitionFor(id: string): WidgetDefinition | undefined {
  return WIDGET_CATALOG.find((d) => d.id === id)
}

export function widgetLabel(w: DashboardWidget): string {
  return w.title || definitionFor(w.id)?.title || w.type
}
