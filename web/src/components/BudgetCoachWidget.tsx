import { Link } from 'react-router-dom'
import { formatUsd, MONTH_SHORT } from '../lib/format'
import { coachTipCanApply } from '../lib/coachTips'
import type { BudgetCoach, CoachTip, CoachTone } from '../types/api'

const TONE_LABEL: Record<CoachTone, string> = {
  getting_started: 'Getting started',
  surplus: 'Leftover to assign',
  shortfall: 'Plan shortfall',
  balanced: 'Balanced',
  watch: 'Watch pace',
}

function leftoverCaption(tone: CoachTone): string {
  if (tone === 'getting_started') return 'Planned remainder'
  if (tone === 'surplus') return 'Unassigned in the plan'
  if (tone === 'shortfall') return 'Planned over income'
  return 'Planned remainder'
}

export function BudgetCoachWidget({
  coach,
  year,
  title,
  variant = 'full',
  dismissed,
  applyingId,
  status,
  onApply,
  onDismiss,
}: {
  coach: BudgetCoach
  year: number
  title?: string | null
  variant?: 'full' | 'compact'
  dismissed: Set<string>
  applyingId: string | null
  status: string | null
  onApply: (tip: CoachTip) => void
  onDismiss: (tip: CoachTip) => void
}) {
  const visibleAll = coach.tips.filter(
    (t) => !dismissed.has(`${t.id}:${year}`),
  )
  const visible = variant === 'compact' ? visibleAll.slice(0, 2) : visibleAll

  return (
    <div className={`widget budget-coach tone-${coach.tone}`}>
      <div className="widget-head">
        <h3>{title || 'Budget coach'}</h3>
        <span className={`coach-tone coach-tone-${coach.tone}`}>
          {TONE_LABEL[coach.tone]}
        </span>
      </div>
      <p className="coach-headline">{coach.headline}</p>
      <p className="muted compact">
        Advice from your plan, leftover, and savings goals — optional, never a lock.
      </p>

      <div className="coach-hero">
        <div>
          <p className="pace-label">{leftoverCaption(coach.tone)}</p>
          <p className="pace-net">{formatUsd(coach.leftover_planned)}</p>
        </div>
        <div>
          <p className="pace-label">Actual leftover</p>
          <p className="pace-net">{formatUsd(coach.leftover_actual)}</p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No coaching tips for this period.</p>
      ) : (
        <ul className="coach-tip-list">
          {visible.map((tip) => (
            <CoachTipRow
              key={tip.id}
              tip={tip}
              applying={applyingId === tip.id}
              onApply={onApply}
              onDismiss={onDismiss}
            />
          ))}
        </ul>
      )}

      {status && <p className="status-chip plan-coaching-status">{status}</p>}

      {variant === 'compact' && (
        <p className="coach-more">
          <Link to="/coach">Open full coach</Link>
          {' · '}
          more tips, how advice is built, and when AI might help later.
        </p>
      )}
    </div>
  )
}

function CoachTipRow({
  tip,
  applying,
  onApply,
  onDismiss,
}: {
  tip: CoachTip
  applying: boolean
  onApply: (tip: CoachTip) => void
  onDismiss: (tip: CoachTip) => void
}) {
  const canApply = coachTipCanApply(tip)
  const when =
    tip.apply_month != null && tip.apply_year != null
      ? `${MONTH_SHORT[tip.apply_month - 1]} ${tip.apply_year}`
      : null

  return (
    <li>
      <div className="plan-coaching-row">
        <div className="plan-coaching-copy">
          <div className="coach-tip-title">
            <strong>{tip.title}</strong>
          </div>
          <span className="muted">{tip.message}</span>
          {canApply && when && tip.suggested_planned != null && (
            <span className="muted compact">
              Would set {when} to {formatUsd(tip.suggested_planned)}
              {tip.current_planned != null
                ? ` (from ${formatUsd(tip.current_planned)})`
                : ''}
              .
            </span>
          )}
        </div>
        <div className="plan-coaching-actions">
          {canApply && (
            <button
              type="button"
              className="btn tiny"
              disabled={applying}
              onClick={() => onApply(tip)}
            >
              {applying ? 'Applying…' : tip.apply_label || 'Apply'}
            </button>
          )}
          {tip.cta_href && tip.cta_label && (
            <Link to={tip.cta_href} className="btn tiny">
              {tip.cta_label}
            </Link>
          )}
          {tip.kind !== 'balanced' && tip.kind !== 'get_started' && (
            <button
              type="button"
              className="btn ghost tiny"
              onClick={() => onDismiss(tip)}
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
