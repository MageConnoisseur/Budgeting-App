import type { Category, CategoryKind } from '../types/api'

export type PlanDiffDirection = 'raised' | 'lowered'

export interface PlanDiffItem {
  categoryId: string
  name: string
  kind: CategoryKind
  prior: number
  current: number
  delta: number
  direction: PlanDiffDirection
}

const KIND_ORDER: CategoryKind[] = ['income', 'expense', 'savings']

/** Ignore floating noise under half a cent. */
const EPS = 0.005

export function parseAmountMapValue(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return Number.isNaN(raw) ? 0 : raw
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

/**
 * Compare this month's planned amounts to a prior month's plan.
 * Categories with no meaningful change are omitted.
 */
export function computeBudgetPlanDiff(
  categories: Category[],
  currentByCategory: Record<string, string | number | undefined>,
  priorByCategory: Record<string, string | number | undefined> | null,
): PlanDiffItem[] {
  if (!priorByCategory) return []

  const items: PlanDiffItem[] = []
  for (const c of categories) {
    if (c.archived) continue
    const current = parseAmountMapValue(currentByCategory[c.id])
    const prior = parseAmountMapValue(priorByCategory[c.id])
    const delta = current - prior
    if (Math.abs(delta) < EPS) continue
    items.push({
      categoryId: c.id,
      name: c.name,
      kind: c.kind,
      prior,
      current,
      delta,
      direction: delta > 0 ? 'raised' : 'lowered',
    })
  }

  items.sort((a, b) => {
    const byAbs = Math.abs(b.delta) - Math.abs(a.delta)
    if (byAbs !== 0) return byAbs
    const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (kind !== 0) return kind
    return a.name.localeCompare(b.name)
  })

  return items
}

export function summarizePlanDiff(items: PlanDiffItem[]): {
  raised: number
  lowered: number
  netDelta: number
} {
  let raised = 0
  let lowered = 0
  let netDelta = 0
  for (const item of items) {
    netDelta += item.delta
    if (item.direction === 'raised') raised += 1
    else lowered += 1
  }
  return { raised, lowered, netDelta }
}
