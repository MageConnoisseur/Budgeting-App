import { formatUsd } from './format'
import type { CategoryKind } from '../types/api'

export interface BudgetFill {
  /** Visual fill 0–100. Over-plan is capped at 100 with `over: true`. */
  pct: number
  over: boolean
  /** actual / planned; Infinity when unplanned actuals exist. */
  ratio: number
}

export function parseDraftAmount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0
  const n = Number(raw.replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

export function budgetFillRatio(actual: number, planned: number): BudgetFill {
  const a = Math.max(0, actual)
  const p = Math.max(0, planned)
  if (p <= 0) {
    if (a > 0) return { pct: 100, over: true, ratio: Number.POSITIVE_INFINITY }
    return { pct: 0, over: false, ratio: 0 }
  }
  const ratio = a / p
  return {
    pct: Math.min(100, ratio * 100),
    over: a > p,
    ratio,
  }
}

export function budgetFillHint(
  kind: CategoryKind,
  actual: number,
  planned: number,
  fill: BudgetFill,
): string {
  if (actual <= 0 && planned <= 0) return 'No actuals logged'
  const a = formatUsd(actual)
  const p = formatUsd(planned)
  const verb =
    kind === 'income' ? 'Logged' : kind === 'savings' ? 'Contributed' : 'Spent'
  if (fill.over) return `${verb} ${a} vs ${p} planned (over plan)`
  return `${verb} ${a} of ${p} planned`
}

export function indexYearActuals(
  data: { months: { month: number; actuals: Record<string, string> }[] } | null,
): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {}
  if (!data) return out
  for (const m of data.months) {
    const map: Record<string, number> = {}
    for (const [id, amt] of Object.entries(m.actuals)) {
      const n = Number(amt)
      if (!Number.isNaN(n) && n !== 0) map[id] = n
    }
    out[m.month] = map
  }
  return out
}
