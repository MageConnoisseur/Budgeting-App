/**
 * Themed dashboard views. Ids must match api/app/services/dashboard_layout.py.
 */
import type { DashboardWidget, ViewMode } from '../types/api'
import { catalogForView, definitionFor } from './catalog'

export const SYSTEM_PREFIX = 'setaside-'

export type ThemeId =
  | 'setaside-this-month'
  | 'setaside-fix-the-plan'
  | 'setaside-savings'
  | 'setaside-this-year'
  | 'setaside-fix-the-plan-year'
  | 'setaside-savings-year'

export const MONTHLY_THEMES: { id: ThemeId; name: string; visible: string[] }[] = [
  {
    id: 'setaside-this-month',
    name: 'This month',
    visible: [
      'allocation-snapshot',
      'budget-coach',
      'leftover-waterfall',
      'allocation-mix',
      'spending-runway',
      'largest-movers',
      'recurring-due',
      'category-breakdown',
      'spending-pace',
    ],
  },
  {
    id: 'setaside-fix-the-plan',
    name: 'Fix the plan',
    visible: [
      'month-compare',
      'underused-plan',
      'tradeoff',
      'flexible-split',
      'category-drilldown',
      'budget-coach',
      'category-breakdown',
      'income-progress',
      'expense-progress',
      'savings-progress',
    ],
  },
  {
    id: 'setaside-savings',
    name: 'Savings',
    visible: [
      'savings-buckets',
      'savings-trajectory',
      'bucket-flow',
      'tradeoff',
      'true-leftover',
      'budget-coach',
      'savings-progress',
    ],
  },
]

export const ANNUAL_THEMES: { id: ThemeId; name: string; visible: string[] }[] = [
  {
    id: 'setaside-this-year',
    name: 'This year',
    visible: [
      'allocation-snapshot-year',
      'year-totals',
      'allocation-mix-year',
      'month-trends',
      'leftover-waterfall-year',
      'budget-coach-year',
      'largest-movers-year',
      'income-reliability',
    ],
  },
  {
    id: 'setaside-fix-the-plan-year',
    name: 'Fix the plan',
    visible: [
      'plan-heatmap',
      'underused-plan-year',
      'over-budget-patterns',
      'category-health',
      'plan-drift',
      'tradeoff-year',
      'category-drilldown-year',
      'budget-coach-year',
    ],
  },
  {
    id: 'setaside-savings-year',
    name: 'Savings',
    visible: [
      'savings-buckets-year',
      'savings-trajectory-year',
      'bucket-flow-year',
      'tradeoff-year',
      'true-leftover-year',
      'budget-coach-year',
    ],
  },
]

export function isSystemPreset(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(SYSTEM_PREFIX))
}

export function themesFor(view: ViewMode) {
  return view === 'monthly' ? MONTHLY_THEMES : ANNUAL_THEMES
}

export function widgetsForTheme(
  view: ViewMode,
  themeId?: string | null,
): DashboardWidget[] {
  const themes = themesFor(view)
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]
  const visible = new Set(theme.visible)
  return catalogForView(view).map((def, i) => ({
    id: def.id,
    type: def.type,
    title: def.title,
    order: i,
    config: { ...(def.config ?? {}), hidden: !visible.has(def.id) },
  }))
}

export function defaultThemeId(view: ViewMode): string {
  return themesFor(view)[0].id
}

export function themeLabel(id: string | null | undefined): string | null {
  if (!id) return null
  const all = [...MONTHLY_THEMES, ...ANNUAL_THEMES]
  return all.find((t) => t.id === id)?.name ?? null
}

export function catalogHas(id: string): boolean {
  return Boolean(definitionFor(id))
}
