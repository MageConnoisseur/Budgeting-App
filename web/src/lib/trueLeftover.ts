import type { KindTotals } from '../types/api'

/** Actual (or planned) discretionary cash: income − expenses − savings. */
export interface TrueLeftoverTotals {
  income: number
  expense: number
  savings: number
  leftover: number
}

export function trueLeftoverFromKinds(
  income: KindTotals,
  expense: KindTotals,
  savings: KindTotals,
  basis: 'actual' | 'planned' = 'actual',
): TrueLeftoverTotals {
  const pick = (t: KindTotals) => Number(basis === 'actual' ? t.actual : t.planned)
  const incomeN = pick(income)
  const expenseN = pick(expense)
  const savingsN = pick(savings)
  return {
    income: incomeN,
    expense: expenseN,
    savings: savingsN,
    leftover: incomeN - expenseN - savingsN,
  }
}

export function leftoverTone(
  leftover: number,
): 'balanced' | 'surplus' | 'deficit' {
  if (Math.abs(leftover) < 0.005) return 'balanced'
  return leftover > 0 ? 'surplus' : 'deficit'
}
