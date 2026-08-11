import type { CategoryKind } from '../types/api'

const LABELS: Record<CategoryKind, string> = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
}

export function KindBadge({ kind }: { kind: CategoryKind }) {
  return <span className={`kind-badge kind-${kind}`}>{LABELS[kind]}</span>
}
