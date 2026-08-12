import { formatUsd, MONTH_SHORT } from '../lib/format'
import {
  computeBudgetPlanDiff,
  summarizePlanDiff,
  type PlanDiffItem,
} from '../lib/budgetPlanDiff'
import type { Category } from '../types/api'

const DEFAULT_VISIBLE = 6

function formatSignedDelta(delta: number): string {
  const abs = formatUsd(Math.abs(delta))
  return delta > 0 ? `+${abs}` : `−${abs}`
}

function DiffChip({ item }: { item: PlanDiffItem }) {
  const raised = item.direction === 'raised'
  return (
    <li
      className={`budget-plan-diff-chip ${raised ? 'is-raised' : 'is-lowered'}`}
      title={`${item.name}: ${formatUsd(item.prior)} → ${formatUsd(item.current)}`}
    >
      <span className="budget-plan-diff-arrow" aria-hidden="true">
        {raised ? '↑' : '↓'}
      </span>
      <span className="budget-plan-diff-name">{item.name}</span>
      <span className="budget-plan-diff-delta">{formatSignedDelta(item.delta)}</span>
    </li>
  )
}

export function BudgetPlanDiffStrip({
  categories,
  currentAmounts,
  priorAmounts,
  priorYear,
  priorMonth,
  hasPriorPlan,
  maxVisible = DEFAULT_VISIBLE,
}: {
  categories: Category[]
  currentAmounts: Record<string, string>
  priorAmounts: Record<string, string> | null
  priorYear: number
  priorMonth: number
  hasPriorPlan: boolean
  maxVisible?: number
}) {
  if (!hasPriorPlan) {
    return (
      <aside className="budget-plan-diff panel" aria-live="polite">
        <div className="budget-plan-diff-head">
          <h2 className="section-title">What changed</h2>
          <p className="muted compact">
            No {MONTH_SHORT[priorMonth - 1]} {priorYear} plan to compare yet.
          </p>
        </div>
      </aside>
    )
  }

  const diffs = computeBudgetPlanDiff(categories, currentAmounts, priorAmounts)
  const summary = summarizePlanDiff(diffs)
  const visible = diffs.slice(0, maxVisible)
  const hidden = Math.max(0, diffs.length - visible.length)
  const priorLabel = `${MONTH_SHORT[priorMonth - 1]} ${priorYear}`

  return (
    <aside className="budget-plan-diff panel" aria-live="polite">
      <div className="budget-plan-diff-head">
        <div>
          <h2 className="section-title">What changed</h2>
          <p className="muted compact">
            This plan vs {priorLabel}
            {diffs.length === 0
              ? ' — same planned amounts'
              : ` · ${summary.raised} raised · ${summary.lowered} lowered`}
          </p>
        </div>
      </div>

      {diffs.length === 0 ? (
        <p className="budget-plan-diff-empty muted">
          No category changes from last month. Edit an amount to see the diff.
        </p>
      ) : (
        <>
          <ul className="budget-plan-diff-list">
            {visible.map((item) => (
              <DiffChip key={item.categoryId} item={item} />
            ))}
          </ul>
          {hidden > 0 && (
            <p className="budget-plan-diff-more muted compact">
              +{hidden} more categor{hidden === 1 ? 'y' : 'ies'} changed
            </p>
          )}
        </>
      )}
    </aside>
  )
}
