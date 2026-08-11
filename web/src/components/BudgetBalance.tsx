import { formatUsd } from '../lib/format'
import type { Category, CategoryKind } from '../types/api'

export interface BudgetKindTotals {
  income: number
  expense: number
  savings: number
  balance: number
}

export function sumByKind(
  categories: Category[],
  amountFor: (categoryId: string, kind: CategoryKind) => number,
): BudgetKindTotals {
  let income = 0
  let expense = 0
  let savings = 0
  for (const c of categories) {
    const n = amountFor(c.id, c.kind)
    if (c.kind === 'income') income += n
    else if (c.kind === 'expense') expense += n
    else savings += n
  }
  return {
    income,
    expense,
    savings,
    balance: income - expense - savings,
  }
}

function balanceTone(balance: number): 'balanced' | 'surplus' | 'deficit' {
  if (Math.abs(balance) < 0.005) return 'balanced'
  return balance > 0 ? 'surplus' : 'deficit'
}

function balanceMessage(balance: number): string {
  const tone = balanceTone(balance)
  if (tone === 'balanced') {
    return 'Balanced — income covers expenses and savings.'
  }
  if (tone === 'surplus') {
    return 'Surplus left to allocate — raise savings or spending plans.'
  }
  return 'Shortfall — reduce expenses/savings or raise income.'
}

export function BudgetBalancePanel({
  totals,
  title = 'Plan balance',
  subtitle = 'Income − expenses − savings',
}: {
  totals: BudgetKindTotals
  title?: string
  subtitle?: string
}) {
  const tone = balanceTone(totals.balance)

  return (
    <aside className={`budget-balance panel tone-${tone}`} aria-live="polite">
      <div className="budget-balance-head">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="muted compact">{subtitle}</p>
        </div>
        <div className={`balance-result tone-${tone}`}>
          <span className="balance-label">
            {tone === 'balanced'
              ? 'Balanced'
              : tone === 'surplus'
                ? 'Surplus'
                : 'Shortfall'}
          </span>
          <strong className="balance-value">{formatUsd(totals.balance)}</strong>
        </div>
      </div>

      <div className="balance-equation" aria-label="Balance calculation">
        <div className="eq-term income">
          <span>Income</span>
          <strong>{formatUsd(totals.income)}</strong>
        </div>
        <span className="eq-op" aria-hidden>
          −
        </span>
        <div className="eq-term expense">
          <span>Expenses</span>
          <strong>{formatUsd(totals.expense)}</strong>
        </div>
        <span className="eq-op" aria-hidden>
          −
        </span>
        <div className="eq-term savings">
          <span>Savings</span>
          <strong>{formatUsd(totals.savings)}</strong>
        </div>
        <span className="eq-op" aria-hidden>
          =
        </span>
        <div className={`eq-term result tone-${tone}`}>
          <span>Remainder</span>
          <strong>{formatUsd(totals.balance)}</strong>
        </div>
      </div>

      <p className="balance-hint">{balanceMessage(totals.balance)}</p>
    </aside>
  )
}
