import { formatUsd } from '../lib/format'
import {
  leftoverTone,
  trueLeftoverFromKinds,
  type TrueLeftoverTotals,
} from '../lib/trueLeftover'
import type { KindTotals } from '../types/api'
import { SoftWarning } from './SoftWarning'

function leftoverLabel(tone: ReturnType<typeof leftoverTone>): string {
  if (tone === 'balanced') return 'Break-even'
  if (tone === 'surplus') return 'Discretionary cash'
  return 'Overspent'
}

function leftoverHint(tone: ReturnType<typeof leftoverTone>, scope: string): string {
  if (tone === 'balanced') {
    return `Actual income covered expenses and savings contributions for ${scope}.`
  }
  if (tone === 'surplus') {
    return `Cash left after expenses and savings — more honest than “remaining in a category.”`
  }
  return `Expenses and savings outpaced actual income for ${scope}. Soft signal only.`
}

function Equation({ totals }: { totals: TrueLeftoverTotals }) {
  const tone = leftoverTone(totals.leftover)
  return (
    <div className="balance-equation" aria-label="True leftover calculation">
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
        <span>Leftover</span>
        <strong>{formatUsd(totals.leftover)}</strong>
      </div>
    </div>
  )
}

/**
 * Actual income − expenses − savings contributions = discretionary cash.
 * Distinct from per-category “remaining” (planned − actual).
 */
export function TrueLeftoverWidget({
  income,
  expense,
  savings,
  title,
  scopeLabel,
}: {
  income: KindTotals
  expense: KindTotals
  savings: KindTotals
  title?: string | null
  /** e.g. "this month" or "this year" */
  scopeLabel: string
}) {
  const actual = trueLeftoverFromKinds(income, expense, savings, 'actual')
  const planned = trueLeftoverFromKinds(income, expense, savings, 'planned')
  const tone = leftoverTone(actual.leftover)
  const planTone = leftoverTone(planned.leftover)

  return (
    <div className={`widget true-leftover tone-${tone}`}>
      <div className="widget-head">
        <h3>{title || 'True leftover'}</h3>
        {tone === 'deficit' && (
          <SoftWarning message="Discretionary cash is negative" />
        )}
      </div>
      <p className="muted compact">
        Actual income − expenses − savings contributions for {scopeLabel}.
      </p>

      <div className="true-leftover-hero">
        <div>
          <p className="pace-label">{leftoverLabel(tone)}</p>
          <p className={`pace-net ${tone === 'deficit' ? 'warn-text' : ''}`}>
            {formatUsd(actual.leftover)}
          </p>
        </div>
        <div>
          <p className="pace-label">Vs plan leftover</p>
          <p className={`pace-net ${planTone === 'deficit' ? 'warn-text' : ''}`}>
            {formatUsd(planned.leftover)}
          </p>
        </div>
      </div>

      <Equation totals={actual} />

      <p className="balance-hint">{leftoverHint(tone, scopeLabel)}</p>
    </div>
  )
}
