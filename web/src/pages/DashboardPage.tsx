import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import * as dashboardApi from '../api/dashboard'
import { PeriodNavigator } from '../components/PeriodNavigator'
import { SoftWarning } from '../components/SoftWarning'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { useAuth } from '../context/AuthContext'
import {
  MONTH_SHORT,
  currentYearMonth,
  formatUsd,
} from '../lib/format'
import type {
  AnnualDashboard,
  DashboardWidget,
  KindTotals,
  MonthlyDashboard,
  ViewMode,
} from '../types/api'

function KindCard({
  title,
  totals,
}: {
  title: string
  totals: KindTotals
}) {
  const pct =
    Number(totals.planned) > 0
      ? Math.min(100, (Number(totals.actual) / Number(totals.planned)) * 100)
      : 0

  return (
    <div className="widget">
      <div className="widget-head">
        <h3>{title}</h3>
        {totals.over_budget && <SoftWarning />}
      </div>
      <dl className="stat-grid">
        <div>
          <dt>Planned</dt>
          <dd>{formatUsd(totals.planned)}</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{formatUsd(totals.actual)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd className={totals.over_budget ? 'warn-text' : undefined}>
            {formatUsd(totals.remaining)}
          </dd>
        </div>
      </dl>
      <div className="progress-track" aria-hidden>
        <div
          className={`progress-fill ${totals.over_budget ? 'over' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user, setPreferredView } = useAuth()
  const initial = currentYearMonth()
  const [view, setView] = useState<ViewMode>(
    user?.preferred_dashboard_view ?? 'monthly',
  )
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [monthly, setMonthly] = useState<MonthlyDashboard | null>(null)
  const [annual, setAnnual] = useState<AnnualDashboard | null>(null)
  const [widgets, setWidgets] = useState<DashboardWidget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null)

  useEffect(() => {
    if (user?.preferred_dashboard_view) {
      setView(user.preferred_dashboard_view)
    }
  }, [user?.preferred_dashboard_view])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const layout = await dashboardApi.getDashboardLayout(view)
      setWidgets([...layout.widgets].sort((a, b) => a.order - b.order))

      if (view === 'monthly') {
        setMonthly(await dashboardApi.getMonthlyDashboard(year, month))
        setAnnual(null)
      } else {
        setAnnual(await dashboardApi.getAnnualDashboard(year))
        setMonthly(null)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load dashboard')
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

  async function moveWidget(id: string, dir: -1 | 1) {
    const sorted = [...widgets].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((w) => w.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= sorted.length) return
    const next = [...sorted]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const reordered = next.map((w, i) => ({ ...w, order: i }))
    setWidgets(reordered)
    try {
      await dashboardApi.putDashboardLayout(view, reordered)
      setLayoutStatus('Layout saved')
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not save layout')
      await load()
    }
  }

  function renderWidget(w: DashboardWidget) {
    if (view === 'monthly' && monthly) {
      if (w.type === 'kind_progress') {
        const kind = (w.config.kind as string) || 'expense'
        const totals =
          kind === 'income'
            ? monthly.income
            : kind === 'savings'
              ? monthly.savings
              : monthly.expense
        return <KindCard title={w.title || kind} totals={totals} />
      }
      if (w.type === 'savings_buckets') {
        return (
          <div className="widget">
            <h3>{w.title || 'Savings buckets'}</h3>
            {monthly.savings_buckets.length === 0 ? (
              <p className="muted">No savings buckets yet.</p>
            ) : (
              <ul className="bucket-list">
                {monthly.savings_buckets.map((b) => (
                  <li key={b.category_id}>
                    <div className="bucket-row">
                      <span>{b.category_name}</span>
                      <strong>{formatUsd(b.balance)}</strong>
                    </div>
                    <p className="muted compact">
                      This month {formatUsd(b.actual_this_period)} /{' '}
                      {formatUsd(b.planned_this_period)} planned
                      {b.over_budget ? ' · ' : ''}
                      {b.over_budget && <SoftWarning message="Over contribution plan" />}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
      if (w.type === 'category_breakdown') {
        return (
          <div className="widget">
            <h3>{w.title || 'Categories'}</h3>
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Planned</th>
                    <th>Actual</th>
                    <th>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.categories.map((c) => (
                    <tr key={c.category_id}>
                      <td>
                        {c.category_name}
                        {c.over_budget && (
                          <>
                            {' '}
                            <SoftWarning />
                          </>
                        )}
                      </td>
                      <td className="num">{formatUsd(c.planned)}</td>
                      <td className="num">{formatUsd(c.actual)}</td>
                      <td className="num">{formatUsd(c.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    }

    if (view === 'annual' && annual) {
      if (w.type === 'year_totals') {
        return (
          <div className="widget-grid three">
            <KindCard title="Income" totals={annual.income} />
            <KindCard title="Expenses" totals={annual.expense} />
            <KindCard title="Savings" totals={annual.savings} />
          </div>
        )
      }
      if (w.type === 'month_trends') {
        return (
          <div className="widget">
            <h3>{w.title || 'Month-to-month trends'}</h3>
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Expense</th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {annual.months.map((m) => (
                    <tr key={`${m.year}-${m.month}`}>
                      <td>{MONTH_SHORT[m.month - 1]}</td>
                      <td className="num">
                        {formatUsd(m.income_actual)}
                        <span className="muted"> / {formatUsd(m.income_planned)}</span>
                      </td>
                      <td className="num">
                        {formatUsd(m.expense_actual)}
                        <span className="muted"> / {formatUsd(m.expense_planned)}</span>
                      </td>
                      <td className="num">
                        {formatUsd(m.savings_actual)}
                        <span className="muted"> / {formatUsd(m.savings_planned)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      if (w.type === 'category_trends') {
        const overruns = annual.category_trends.filter(
          (c) => c.months_over_budget > 0,
        )
        return (
          <div className="widget">
            <h3>{w.title || 'Repeated overruns'}</h3>
            {overruns.length === 0 ? (
              <p className="muted">No repeated over-budget patterns this year.</p>
            ) : (
              <ul className="bucket-list">
                {overruns.map((c) => (
                  <li key={c.category_id}>
                    <div className="bucket-row">
                      <span>
                        {c.category_name}{' '}
                        <SoftWarning
                          message={`${c.months_over_budget} months over`}
                        />
                      </span>
                      <span className="muted">
                        {formatUsd(c.total_actual)} vs{' '}
                        {formatUsd(c.total_planned)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
      if (w.type === 'savings_buckets') {
        return (
          <div className="widget">
            <h3>{w.title || 'Savings buckets'}</h3>
            {annual.savings_buckets.length === 0 ? (
              <p className="muted">No savings buckets yet.</p>
            ) : (
              <ul className="bucket-list">
                {annual.savings_buckets.map((b) => (
                  <li key={b.category_id}>
                    <div className="bucket-row">
                      <span>{b.category_name}</span>
                      <strong>{formatUsd(b.balance)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    }

    return (
      <div className="widget">
        <h3>{w.title || w.type}</h3>
        <p className="muted">Widget type “{w.type}” has no renderer yet.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Plan vs actual. Soft warnings only — overspending is never blocked.
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
        {layoutStatus && <p className="status-chip">{layoutStatus}</p>}
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="dashboard-layout">
          {widgets.map((w) => (
            <div key={w.id} className="widget-shell">
              <div className="widget-controls">
                <button
                  type="button"
                  className="btn ghost tiny"
                  aria-label="Move up"
                  onClick={() => void moveWidget(w.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn ghost tiny"
                  aria-label="Move down"
                  onClick={() => void moveWidget(w.id, 1)}
                >
                  ↓
                </button>
              </div>
              {renderWidget(w)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
