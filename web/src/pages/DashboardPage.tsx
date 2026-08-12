import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import * as dashboardApi from '../api/dashboard'
import {
  GroupedBarChart,
  HorizontalBarChart,
  LineTrendChart,
} from '../components/charts/TrendCharts'
import { PeriodNavigator } from '../components/PeriodNavigator'
import { KindBadge } from '../components/KindBadge'
import { SoftWarning } from '../components/SoftWarning'
import { SavingsBucketsGuide } from '../components/SavingsBucketsGuide'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { useAuth } from '../context/AuthContext'
import {
  MONTH_SHORT,
  currentYearMonth,
  formatUsd,
} from '../lib/format'
import type {
  AnnualDashboard,
  CategoryKind,
  CategoryProgress,
  DashboardWidget,
  KindTotals,
  MonthlyDashboard,
  SpendingPace,
  ViewMode,
} from '../types/api'

const KIND_ORDER: CategoryKind[] = ['income', 'expense', 'savings']
const KIND_SECTION_LABEL: Record<CategoryKind, string> = {
  income: 'Income',
  expense: 'Expenses',
  savings: 'Savings',
}

/** Actual exceeds planned — soft visual cue only (never blocks logging). */
function exceedsPlan(c: CategoryProgress): boolean {
  const planned = Number(c.planned)
  const actual = Number(c.actual)
  return actual > planned && (planned > 0 || actual > 0)
}

function groupCategoriesByKind(categories: CategoryProgress[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    rows: categories.filter((c) => c.kind === kind),
  })).filter((g) => g.rows.length > 0)
}

const COLOR = {
  income: '#1f5c4a',
  expense: '#7a3b2e',
  savings: '#2f5f7a',
  planned: '#8aa396',
  actual: '#1f4b3a',
  balance: '#3d7a5f',
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${MONTH_SHORT[m - 1]} ${d}`
}

function SpendingPaceWidget({
  pace,
  title,
}: {
  pace: SpendingPace
  title?: string | null
}) {
  if (!pace.has_data) {
    return (
      <div className="widget">
        <h3>{title || 'Spending pace'}</h3>
        <p className="muted">
          Log income and expenses to see a rolling pace check. This uses actuals
          over the last 30 days against your average income — not your monthly
          plan — so mid-month paydays do not falsely look like overspending.
        </p>
      </div>
    )
  }

  const outflow = Number(pace.outflow)
  const expected = Number(pace.expected_income)
  const pct =
    expected > 0 ? Math.min(140, (outflow / expected) * 100) : outflow > 0 ? 100 : 0
  const headroom = expected - outflow

  const chartLabels = pace.days.map((d, i) => {
    const show =
      i === 0 || i === pace.days.length - 1 || (i + 1) % 5 === 0
    return show ? String(Number(d.date.slice(8))) : ''
  })

  return (
    <div className="widget">
      <div className="widget-head">
        <h3>{title || 'Spending pace'}</h3>
        {pace.overspending && (
          <SoftWarning message="Outflow above average income" />
        )}
      </div>
      <p className="muted compact">
        Actuals for {formatShortDate(pace.window_start)} –{' '}
        {formatShortDate(pace.window_end)} ({pace.window_days} days). Capacity
        uses average daily income over{' '}
        {pace.income_lookback_days} day
        {pace.income_lookback_days === 1 ? '' : 's'} of tracking
        {pace.income_lookback_days < 183 ? ' (since you started)' : ' (last ~6 months)'}.
      </p>

      <div className="pace-hero">
        <div>
          <p className="pace-label">Net (income − expenses − savings)</p>
          <p className={`pace-net ${Number(pace.net) < 0 ? 'warn-text' : ''}`}>
            {formatUsd(pace.net)}
          </p>
        </div>
        <div>
          <p className="pace-label">Headroom vs avg income</p>
          <p className={`pace-net ${headroom < 0 ? 'warn-text' : ''}`}>
            {formatUsd(headroom)}
          </p>
        </div>
      </div>

      <dl className="stat-grid four">
        <div>
          <dt>Income</dt>
          <dd>{formatUsd(pace.income)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd>{formatUsd(pace.expense)}</dd>
        </div>
        <div>
          <dt>Savings</dt>
          <dd>{formatUsd(pace.savings)}</dd>
        </div>
        <div>
          <dt>Avg income capacity</dt>
          <dd>{formatUsd(pace.expected_income)}</dd>
        </div>
      </dl>

      <div className="pace-meter">
        <div className="pace-meter-labels">
          <span>Outflow {formatUsd(pace.outflow)}</span>
          <span>Capacity {formatUsd(pace.expected_income)}</span>
        </div>
        <div className="progress-track" aria-hidden>
          <div
            className={`progress-fill ${pace.overspending ? 'over' : ''}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {pace.days.length > 1 && (
        <>
          <h4 className="chart-subtitle">
            Cumulative outflow vs average income capacity
          </h4>
          <LineTrendChart
            labels={chartLabels}
            series={[
              {
                key: 'outflow',
                label: 'Outflow (expenses + savings)',
                color: COLOR.expense,
                values: pace.days.map((d) => Number(d.cumulative_outflow)),
              },
              {
                key: 'capacity',
                label: 'Avg income capacity',
                color: COLOR.income,
                values: pace.days.map((d) =>
                  Number(d.cumulative_expected_income),
                ),
              },
            ]}
            height={200}
          />
        </>
      )}
    </div>
  )
}

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

function MonthTrendsWidget({
  annual,
  title,
}: {
  annual: AnnualDashboard
  title?: string | null
}) {
  const labels = annual.months.map((m) => MONTH_SHORT[m.month - 1])
  const cashflow = annual.months.map(
    (m) =>
      Number(m.income_actual) -
      Number(m.expense_actual) -
      Number(m.savings_actual),
  )

  return (
    <div className="widget">
      <h3>{title || 'Month-to-month trends'}</h3>
      <p className="muted compact">
        Actual income, expenses, and savings across the year.
      </p>
      <LineTrendChart
        labels={labels}
        series={[
          {
            key: 'income',
            label: 'Income',
            color: COLOR.income,
            values: annual.months.map((m) => Number(m.income_actual)),
          },
          {
            key: 'expense',
            label: 'Expenses',
            color: COLOR.expense,
            values: annual.months.map((m) => Number(m.expense_actual)),
          },
          {
            key: 'savings',
            label: 'Savings',
            color: COLOR.savings,
            values: annual.months.map((m) => Number(m.savings_actual)),
          },
        ]}
      />

      <h4 className="chart-subtitle">Plan vs actual expenses</h4>
      <GroupedBarChart
        labels={labels}
        series={[
          {
            key: 'planned',
            label: 'Planned',
            color: COLOR.planned,
            values: annual.months.map((m) => Number(m.expense_planned)),
          },
          {
            key: 'actual',
            label: 'Actual',
            color: COLOR.expense,
            values: annual.months.map((m) => Number(m.expense_actual)),
          },
        ]}
      />

      <h4 className="chart-subtitle">Monthly remainder (income − expenses − savings)</h4>
      <LineTrendChart
        labels={labels}
        series={[
          {
            key: 'balance',
            label: 'Remainder',
            color: COLOR.balance,
            values: cashflow,
          },
        ]}
        height={180}
      />

      <div className="table-wrap chart-table">
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
  const [trendYear, setTrendYear] = useState<AnnualDashboard | null>(null)
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
        const [md, yd] = await Promise.all([
          dashboardApi.getMonthlyDashboard(year, month),
          dashboardApi.getAnnualDashboard(year),
        ])
        setMonthly(md)
        setTrendYear(yd)
        setAnnual(null)
      } else {
        setAnnual(await dashboardApi.getAnnualDashboard(year))
        setMonthly(null)
        setTrendYear(null)
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

  const monthlyExpenseBars = useMemo(() => {
    if (!monthly) return []
    return monthly.categories
      .filter((c) => c.kind === 'expense')
      .map((c) => ({
        label: c.category_name,
        value: Number(c.actual),
        color: c.over_budget ? '#9a4b1f' : COLOR.expense,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [monthly])

  const monthlyPlanVsActual = useMemo(() => {
    if (!monthly) return null
    const cats = monthly.categories.filter((c) => c.kind === 'expense').slice(0, 8)
    return {
      labels: cats.map((c) =>
        c.category_name.length > 10
          ? `${c.category_name.slice(0, 9)}…`
          : c.category_name,
      ),
      planned: cats.map((c) => Number(c.planned)),
      actual: cats.map((c) => Number(c.actual)),
    }
  }, [monthly])

  function renderWidget(w: DashboardWidget) {
    const pace =
      view === 'monthly' ? monthly?.spending_pace : annual?.spending_pace
    if (w.type === 'spending_pace' && pace) {
      return <SpendingPaceWidget pace={pace} title={w.title} />
    }

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
            <SavingsBucketsGuide variant="dashboard" className="compact" />
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
        const grouped = groupCategoriesByKind(monthly.categories)
        return (
          <div className="widget">
            <h3>{w.title || 'Categories'}</h3>
            {monthlyPlanVsActual && monthlyPlanVsActual.labels.length > 0 && (
              <>
                <p className="muted compact">Expense plan vs actual this month</p>
                <GroupedBarChart
                  labels={monthlyPlanVsActual.labels}
                  series={[
                    {
                      key: 'planned',
                      label: 'Planned',
                      color: COLOR.planned,
                      values: monthlyPlanVsActual.planned,
                    },
                    {
                      key: 'actual',
                      label: 'Actual',
                      color: COLOR.expense,
                      values: monthlyPlanVsActual.actual,
                    },
                  ]}
                  height={200}
                />
              </>
            )}
            <p className="muted compact plan-table-legend">
              Planned vs actual by category. Over plan:{' '}
              <span className="plan-legend plan-legend-expense">expense</span>,{' '}
              <span className="plan-legend plan-legend-income">income</span>,{' '}
              <span className="plan-legend plan-legend-savings">savings</span>.
            </p>
            <div className="table-wrap chart-table plan-vs-actual-wrap">
              <table className="data-table compact plan-vs-actual-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Planned</th>
                    <th className="num">Actual</th>
                    <th className="num">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(({ kind, rows }) => (
                    <Fragment key={kind}>
                      <tr className="plan-section-row">
                        <td colSpan={4}>
                          <span className={`plan-section-label kind-${kind}`}>
                            {KIND_SECTION_LABEL[kind]}
                          </span>
                        </td>
                      </tr>
                      {rows.map((c) => {
                        const over = exceedsPlan(c)
                        return (
                          <tr
                            key={c.category_id}
                            className={
                              over ? `plan-row-over plan-row-over-${kind}` : undefined
                            }
                          >
                            <td className="plan-cat-cell">
                              <span className="plan-cat-name">{c.category_name}</span>
                              <KindBadge kind={c.kind} />
                              {over && (
                                <SoftWarning
                                  className={`soft-warning-${kind}`}
                                  message={
                                    kind === 'income'
                                      ? 'Over income plan'
                                      : kind === 'savings'
                                        ? 'Over savings plan'
                                        : 'Over expense plan'
                                  }
                                />
                              )}
                            </td>
                            <td className="num plan-num-planned">
                              {formatUsd(c.planned)}
                            </td>
                            <td
                              className={`num plan-num-actual${over ? ` plan-over-${kind}` : ''}`}
                            >
                              {formatUsd(c.actual)}
                            </td>
                            <td
                              className={`num plan-num-left${over ? ` plan-over-${kind}` : ''}`}
                            >
                              {formatUsd(c.remaining)}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      if (w.type === 'cashflow_trend' && trendYear) {
        const labels = trendYear.months.map((m) => MONTH_SHORT[m.month - 1])
        return (
          <div className="widget">
            <h3>{w.title || 'Year cash-flow trend'}</h3>
            <p className="muted compact">
              How this year’s actuals are moving month to month.
            </p>
            <LineTrendChart
              labels={labels}
              series={[
                {
                  key: 'income',
                  label: 'Income',
                  color: COLOR.income,
                  values: trendYear.months.map((m) => Number(m.income_actual)),
                },
                {
                  key: 'expense',
                  label: 'Expenses',
                  color: COLOR.expense,
                  values: trendYear.months.map((m) => Number(m.expense_actual)),
                },
                {
                  key: 'savings',
                  label: 'Savings',
                  color: COLOR.savings,
                  values: trendYear.months.map((m) => Number(m.savings_actual)),
                },
              ]}
            />
            {monthlyExpenseBars.length > 0 && (
              <>
                <h4 className="chart-subtitle">Top expenses this month</h4>
                <HorizontalBarChart items={monthlyExpenseBars} />
              </>
            )}
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
        return <MonthTrendsWidget annual={annual} title={w.title} />
      }
      if (w.type === 'category_trends') {
        const overruns = annual.category_trends.filter(
          (c) => c.months_over_budget > 0,
        )
        const overrunBars = overruns.slice(0, 10).map((c) => ({
          label: c.category_name,
          value: c.months_over_budget,
          color: '#9a4b1f',
        }))
        return (
          <div className="widget">
            <h3>{w.title || 'Repeated overruns'}</h3>
            {overruns.length === 0 ? (
              <p className="muted">No repeated over-budget patterns this year.</p>
            ) : (
              <>
                <p className="muted compact">
                  Months over budget by category — soft warning patterns only.
                </p>
                <HorizontalBarChart
                  items={overrunBars}
                  formatValue={(n) => `${n} mo`}
                />
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
              </>
            )}
          </div>
        )
      }
      if (w.type === 'savings_buckets') {
        return (
          <div className="widget">
            <h3>{w.title || 'Savings buckets'}</h3>
            <SavingsBucketsGuide variant="dashboard" className="compact" />
            {annual.savings_buckets.length === 0 ? (
              <p className="muted">No savings buckets yet.</p>
            ) : (
              <>
                <HorizontalBarChart
                  items={annual.savings_buckets.map((b) => ({
                    label: b.category_name,
                    value: Number(b.balance),
                    color: COLOR.savings,
                  }))}
                />
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
              </>
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
            Plan vs actual, plus a rolling spending-pace check against average
            income. Soft warnings only — overspending is never blocked.
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
