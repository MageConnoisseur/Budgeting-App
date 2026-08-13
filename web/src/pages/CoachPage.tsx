import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as budgetsApi from '../api/budgets'
import * as dashboardApi from '../api/dashboard'
import { ApiError } from '../api/client'
import { BudgetCoachWidget } from '../components/BudgetCoachWidget'
import { PeriodNavigator } from '../components/PeriodNavigator'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { useAuth } from '../context/AuthContext'
import {
  dismissCoachTip,
  loadDismissedCoachTips,
} from '../lib/coachTips'
import {
  MONTH_SHORT,
  currentYearMonth,
  formatUsd,
} from '../lib/format'
import type { AnnualDashboard, CoachTip, MonthlyDashboard, ViewMode } from '../types/api'

export function CoachPage() {
  const { user, setPreferredView } = useAuth()
  const initial = currentYearMonth()
  const [view, setView] = useState<ViewMode>(
    user?.preferred_dashboard_view ?? 'monthly',
  )
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [monthly, setMonthly] = useState<MonthlyDashboard | null>(null)
  const [annual, setAnnual] = useState<AnnualDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(() => loadDismissedCoachTips())
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (user?.preferred_dashboard_view) {
      setView(user.preferred_dashboard_view)
    }
  }, [user?.preferred_dashboard_view])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (view === 'monthly') {
        setMonthly(await dashboardApi.getMonthlyDashboard(year, month))
        setAnnual(null)
      } else {
        setAnnual(await dashboardApi.getAnnualDashboard(year))
        setMonthly(null)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load coach')
    } finally {
      setLoading(false)
    }
  }, [view, year, month])

  useEffect(() => {
    void load()
  }, [load])

  async function onViewChange(mode: ViewMode) {
    setView(mode)
    try {
      await setPreferredView('dashboard', mode)
    } catch {
      /* best-effort */
    }
  }

  async function onApply(tip: CoachTip) {
    if (
      tip.suggested_planned == null ||
      tip.apply_year == null ||
      tip.apply_month == null ||
      tip.category_id == null
    ) {
      return
    }
    setApplyingId(tip.id)
    setStatus(null)
    try {
      await budgetsApi.upsertAnnualCell({
        year: tip.apply_year,
        month: tip.apply_month,
        category_id: tip.category_id,
        planned_amount: tip.suggested_planned,
      })
      const when = `${MONTH_SHORT[tip.apply_month - 1]} ${tip.apply_year}`
      const name = tip.category_name || 'category'
      setStatus(
        `Updated ${name} for ${when} to ${formatUsd(tip.suggested_planned)}.`,
      )
      setDismissed(dismissCoachTip(tip.id, year))
      await load()
    } catch (e) {
      setStatus(e instanceof ApiError ? e.detail : 'Could not apply that change')
    } finally {
      setApplyingId(null)
    }
  }

  const coach = view === 'monthly' ? monthly?.coach : annual?.coach

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Coach</h1>
          <p className="muted">
            A financial planning coach for Hearth — it recommends how to give
            leftover dollars a job, close a plan shortfall, and fund savings
            targets. Suggestions stay optional.
          </p>
        </div>
        <ViewModeToggle value={view} onChange={(m) => void onViewChange(m)} />
      </header>

      <div className="toolbar">
        <PeriodNavigator
          year={year}
          month={month}
          yearOnly={view === 'annual'}
          onChange={(y, m) => {
            setYear(y)
            setMonth(m)
          }}
        />
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading || !coach ? (
        <p className="muted">{loading ? 'Loading…' : 'No coach data yet.'}</p>
      ) : (
        <BudgetCoachWidget
          coach={coach}
          year={year}
          variant="full"
          dismissed={dismissed}
          applyingId={applyingId}
          status={status}
          onApply={(t) => void onApply(t)}
          onDismiss={(t) => setDismissed(dismissCoachTip(t.id, year))}
        />
      )}

      <section className="panel coach-explainer">
        <h2 className="section-title">How this coach works</h2>
        <p>
          It reads the same numbers you already plan and track: income minus
          expenses minus savings, bucket targets, spending pace, and repeated
          overruns. Dollar amounts are yours — not a generic 50/30/20 split, and
          not a language model guessing a budget.
        </p>
        <ul className="coach-explainer-list">
          <li>
            <strong>Leftover in the plan</strong> should go somewhere, usually a
            savings bucket with a target.
          </li>
          <li>
            <strong>Shortfall</strong> means the plan spends more than income.
            The coach may suggest trimming the largest expense that is not
            chronically under-planned.
          </li>
          <li>
            <strong>Repeated overruns</strong> still surface as optional plan
            raises (same rules as Dashboard).
          </li>
          <li>
            Nothing is applied until you click. Over-budget logging is never
            blocked.
          </li>
        </ul>
        <p className="muted compact">
          A conversational AI coach is a later layer on top of these same rules
          — useful for explaining “why” in plain language, not for inventing
          amounts. See Budget to edit the plan directly, or{' '}
          <Link to="/">Dashboard</Link> for the compact coach widget.
        </p>
      </section>
    </div>
  )
}
