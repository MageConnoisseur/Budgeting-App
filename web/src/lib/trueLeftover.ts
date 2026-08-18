import type { KindTotals, PaycheckLeftover } from '../types/api'

/** Actual (or planned) discretionary cash: income − unfunded expenses − savings. */
export interface TrueLeftoverTotals {
  income: number
  expense: number
  savings: number
  leftover: number
  expenseFromSavings: number
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
    expenseFromSavings: 0,
  }
}

export function leftoverFromPaycheck(row: PaycheckLeftover): TrueLeftoverTotals {
  return {
    income: Number(row.income),
    expense: Number(row.expense_from_income),
    savings: Number(row.savings_contributions),
    leftover: Number(row.leftover),
    expenseFromSavings: Number(row.expense_from_savings),
  }
}

export function leftoverTone(
  leftover: number,
): 'balanced' | 'surplus' | 'deficit' {
  if (Math.abs(leftover) < 0.005) return 'balanced'
  return leftover > 0 ? 'surplus' : 'deficit'
}
