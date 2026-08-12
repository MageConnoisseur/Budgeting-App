import { KindBadge } from './KindBadge'
import type { CategoryHealthScore, CategoryHealthStatus } from '../types/api'

const STATUS_LABEL: Record<CategoryHealthStatus, string> = {
  under_planned: 'Under-planned',
  volatile: 'Volatile',
  stable: 'Stable',
}

const STATUS_HINT: Record<CategoryHealthStatus, string> = {
  under_planned: 'Plan often too low vs actuals',
  volatile: 'Actuals swing vs plan month to month',
  stable: 'Actuals track the plan closely',
}

function statusCounts(scores: CategoryHealthScore[]) {
  return {
    under_planned: scores.filter((s) => s.status === 'under_planned').length,
    volatile: scores.filter((s) => s.status === 'volatile').length,
    stable: scores.filter((s) => s.status === 'stable').length,
  }
}

function formatRatio(ratio: string): string {
  const n = Number(ratio)
  if (!Number.isFinite(n)) return ratio
  return `${Math.round(n * 100)}% of plan`
}

type Props = {
  scores: CategoryHealthScore[] | undefined
  title?: string | null
}

/** Annual widget: ~6-month plan-vs-actual consistency labels. */
export function CategoryHealthWidget({ scores, title }: Props) {
  const list = scores ?? []
  const counts = statusCounts(list)
  const lookback = list[0]?.lookback_months ?? 6

  return (
    <div className="widget">
      <h3>{title || 'Category health'}</h3>
      <p className="muted compact">
        Consistency of plan vs actual over ~{lookback} months — makes overrun
        counts actionable (stable, volatile, or chronically under-planned).
      </p>

      {list.length === 0 ? (
        <p className="muted">
          Need at least three months with a plan in the lookback window to score
          categories.
        </p>
      ) : (
        <>
          <div className="health-summary" aria-label="Health summary">
            <span className="health-pill health-pill-under">
              {counts.under_planned} under-planned
            </span>
            <span className="health-pill health-pill-volatile">
              {counts.volatile} volatile
            </span>
            <span className="health-pill health-pill-stable">
              {counts.stable} stable
            </span>
          </div>

          <ul className="health-list">
            {list.map((s) => (
              <li key={s.category_id} className={`health-item health-${s.status}`}>
                <div className="health-item-head">
                  <div className="health-item-title">
                    <strong>{s.category_name}</strong>
                    <KindBadge kind={s.kind} />
                  </div>
                  <span
                    className={`health-status health-status-${s.status}`}
                    title={STATUS_HINT[s.status]}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <p className="muted compact health-message">{s.message}</p>
                <div className="health-meta muted">
                  <span>
                    {s.months_over_budget}/{s.months_scored} months over
                  </span>
                  <span>{formatRatio(s.mean_ratio)} avg</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
