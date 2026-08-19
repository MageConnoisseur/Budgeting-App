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
