import { useMemo, useState } from 'react'
import {
  GroupedBarChart,
  HeatmapChart,
  HorizontalBarChart,
  LineTrendChart,
  ShareBarChart,
  WaterfallChart,
} from '../charts/TrendCharts'
import { KindBadge } from '../KindBadge'
import { SoftWarning } from '../SoftWarning'
import { leftoverFromPaycheck } from '../../lib/trueLeftover'
import { MONTH_SHORT, formatUsd } from '../../lib/format'
import type {
  AnnualDashboard,
  CategoryKind,
  CategoryMonthCell,
  CategoryProgress,
  CategoryTrend,
  DashboardTransaction,
  FlexibleSplit,
  MonthlyDashboard,
  MonthlyTrendPoint,
  PaycheckLeftover,
  RecurringLoadItem,
  SavingsBucket,
  SavingsHistorySeries,
  SpendingRunway,
  TradeoffSuggestion,
} from '../../types/api'

const COLOR = {
  income: '#1f5c4a',
  expense: '#7a3b2e',
  savings: '#2f5f7a',
  planned: '#8aa396',
  actual: '#1f4b3a',
  leftover: '#3d7a5f',
  committed: '#5c4a3a',
  flexible: '#9a4b1f',
  funded: '#2f5f7a',
}

const MIX_PALETTE = [
  '#7a3b2e',
  '#9a4b1f',
  '#5c4a3a',
  '#2f5f7a',
  '#3d7a5f',
  '#8a5a3a',
  '#4a6b58',
  '#b56a3a',
]

type Dash = MonthlyDashboard | AnnualDashboard

function n(v: string | number | null | undefined): number {
  return Number(v ?? 0)
}

function mixSlices(categories: CategoryProgress[], kind: CategoryKind, basis: 'planned' | 'actual') {
  return categories
    .filter((c) => c.kind === kind)
    .map((c, i) => ({
      id: c.category_id,
      label: c.category_name,
      value: n(basis === 'planned' ? c.planned : c.actual),
      color: MIX_PALETTE[i % MIX_PALETTE.length],
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function AllocationSnapshotWidget({
  data,
  title,
  scopeLabel,
}: {
  data: Dash
  title?: string | null
  scopeLabel: string
}) {
  const leftover = leftoverFromPaycheck(data.leftover_actual)
  const income = n(data.income.actual)
  const savings = n(data.savings.actual)
  const expense = n(data.expense.actual)
  const plannedExpense = n(data.expense.planned)
  const rate = income > 0 ? Math.round((savings / income) * 100) : 0
  const used =
    plannedExpense > 0 ? Math.min(140, Math.round((expense / plannedExpense) * 100)) : 0
  return (
    <div className="widget">
      <h3>{title || 'At a glance'}</h3>
      <p className="muted compact">Orientation for {scopeLabel} — leftover ignores bills paid from a bucket.</p>
      <dl className="stat-grid four">
        <div>
          <dt>Income</dt>
          <dd>{formatUsd(data.income.actual)}</dd>
        </div>
        <div>
          <dt>Leftover</dt>
          <dd className={leftover.leftover < 0 ? 'warn-text' : undefined}>
            {formatUsd(leftover.leftover)}
          </dd>
        </div>
        <div>
          <dt>Savings rate</dt>
          <dd>{rate}%</dd>
        </div>
        <div>
          <dt>Expense plan used</dt>
          <dd className={used > 100 ? 'warn-text' : undefined}>{used}%</dd>
        </div>
      </dl>
    </div>
  )
}

export function AllocationMixWidget({
  categories,
  title,
}: {
  categories: CategoryProgress[]
  title?: string | null
}) {
  const planned = mixSlices(categories, 'expense', 'planned')
  const actual = mixSlices(categories, 'expense', 'actual')
  return (
    <div className="widget">
      <h3>{title || 'Planned vs actual mix'}</h3>
      <p className="muted compact">
        Share of expense dollars. Use this to change next month’s allocation, not just this month’s remaining.
      </p>
      {planned.length === 0 && actual.length === 0 ? (
        <p className="muted">Log expenses to see mix.</p>
      ) : (
        <>
          <ShareBarChart slices={planned} label="Planned mix" />
          <ShareBarChart slices={actual} label="Actual mix" />
        </>
      )}
    </div>
  )
}

export function LeftoverWaterfallWidget({
  leftover,
  title,
}: {
  leftover: PaycheckLeftover
  title?: string | null
}) {
  const income = n(leftover.income)
  const fromIncome = n(leftover.expense_from_income)
  const savings = n(leftover.savings_contributions)
  const result = n(leftover.leftover)
  return (
    <div className="widget">
      <h3>{title || 'Leftover waterfall'}</h3>
      <p className="muted compact">
        Income − expenses paid from income − savings. Bucket-funded bills are set aside.
      </p>
      <WaterfallChart
        steps={[
          { key: 'income', label: 'Income', value: income, color: COLOR.income },
          { key: 'exp', label: 'From income', value: -fromIncome, color: COLOR.expense },
          { key: 'sav', label: 'Savings', value: -savings, color: COLOR.savings },
          { key: 'left', label: 'Leftover', value: result, color: COLOR.leftover, isTotal: true },
        ]}
      />
    </div>
  )
}

export function SpendingRunwayWidget({
  runway,
  title,
}: {
  runway?: SpendingRunway | null
  title?: string | null
}) {
  if (!runway || !runway.has_data) {
    return (
      <div className="widget">
        <h3>{title || 'Month runway'}</h3>
        <p className="muted">Plan expenses to see how this month’s remaining budget maps to days left.</p>
      </div>
    )
  }
  return (
    <div className="widget">
      <div className="widget-head">
        <h3>{title || 'Month runway'}</h3>
        {runway.ahead && <SoftWarning message="Spending faster than the remaining days allow" />}
      </div>
      <p className="muted compact">
        {runway.days_left} day{runway.days_left === 1 ? '' : 's'} left · {runway.days_elapsed} elapsed.
        Soft signal only — logging is never blocked.
      </p>
      <dl className="stat-grid">
        <div>
          <dt>Remaining plan</dt>
          <dd className={n(runway.expense_remaining) < 0 ? 'warn-text' : undefined}>
            {formatUsd(runway.expense_remaining)}
          </dd>
        </div>
        <div>
          <dt>Spent / day so far</dt>
          <dd>{formatUsd(runway.daily_spent)}</dd>
        </div>
        <div>
          <dt>Left / day</dt>
          <dd>{formatUsd(runway.daily_remaining)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function LargestMoversWidget({
  items,
  title,
}: {
  items?: DashboardTransaction[]
  title?: string | null
}) {
  const rows = items ?? []
  return (
    <div className="widget">
      <h3>{title || 'Largest movers'}</h3>
      <p className="muted compact">Biggest logged amounts this period.</p>
      {rows.length === 0 ? (
        <p className="muted">No transactions in this period.</p>
      ) : (
        <ul className="mover-list">
          {rows.map((tx) => (
            <li key={tx.id}>
              <div className="bucket-row">
                <span>
                  {tx.category_name} <KindBadge kind={tx.kind} />
                </span>
                <strong>{formatUsd(tx.amount)}</strong>
              </div>
              <p className="muted compact">
                {tx.date}
                {tx.note ? ` · ${tx.note}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RecurringDueWidget({
  items,
  title,
}: {
  items?: RecurringLoadItem[]
  title?: string | null
}) {
  const rows = items ?? []
  return (
    <div className="widget">
      <h3>{title || 'Recurring vs remaining'}</h3>
      <p className="muted compact">
        Known repeating amounts this month versus remaining plan in that category.
      </p>
      {rows.length === 0 ? (
        <p className="muted">No recurring schedules land in this month.</p>
      ) : (
        <ul className="bucket-list">
          {rows.map((row) => (
            <li key={row.schedule_id}>
              <div className="bucket-row">
                <span>
                  {row.category_name} <KindBadge kind={row.kind} />
                </span>
                <strong>
                  {formatUsd(row.amount)} × {row.occurrences_this_period}
                </strong>
              </div>
              <p className="muted compact">
                Remaining in category {formatUsd(row.remaining_in_category)} · logged{' '}
                {formatUsd(row.logged_this_period)}
                {n(row.remaining_in_category) < n(row.amount) ? ' · ' : ''}
                {n(row.remaining_in_category) < n(row.amount) && (
                  <SoftWarning message="Remaining is less than the next occurrence" />
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function pointBars(label: string, point: MonthlyTrendPoint | null | undefined) {
  if (!point) return null
  return {
    label,
    income: n(point.income_actual),
    expense: n(point.expense_actual),
    savings: n(point.savings_actual),
  }
}

export function MonthCompareWidget({
  current,
  lastMonth,
  lastYear,
  title,
}: {
  current: { income: number; expense: number; savings: number }
  lastMonth?: MonthlyTrendPoint | null
  lastYear?: MonthlyTrendPoint | null
  title?: string | null
}) {
  const series = [
    { label: 'This month', ...current },
    pointBars('Last month', lastMonth),
    pointBars('Last year', lastYear),
  ].filter((x): x is NonNullable<typeof x> => x != null)
  const labels = series.map((s) => s.label)
  return (
    <div className="widget">
      <h3>{title || 'This month vs last'}</h3>
      <p className="muted compact">Actuals — did the habit change, or only the feeling?</p>
      {series.length < 2 ? (
        <p className="muted">Need a prior month of tracking to compare.</p>
      ) : (
        <GroupedBarChart
          labels={labels}
          series={[
            { key: 'income', label: 'Income', color: COLOR.income, values: series.map((s) => s.income) },
            { key: 'expense', label: 'Expenses', color: COLOR.expense, values: series.map((s) => s.expense) },
            { key: 'savings', label: 'Savings', color: COLOR.savings, values: series.map((s) => s.savings) },
          ]}
        />
      )}
    </div>
  )
}

export function CategoryDrilldownWidget({
  categories,
  cells,
  movers,
  title,
}: {
  categories: CategoryProgress[]
  cells?: CategoryMonthCell[]
  movers?: DashboardTransaction[]
  title?: string | null
}) {
  const options = categories.filter((c) => n(c.planned) > 0 || n(c.actual) > 0)
  const [selected, setSelected] = useState(options[0]?.category_id ?? '')
  const row = categories.find((c) => c.category_id === selected) ?? options[0]
  const history = (cells ?? [])
    .filter((c) => c.category_id === (row?.category_id ?? selected))
    .sort((a, b) => a.month - b.month)
  const notes = (movers ?? []).filter((t) => t.category_id === row?.category_id)
  return (
    <div className="widget">
      <h3>{title || 'Category drill-down'}</h3>
      {options.length === 0 ? (
        <p className="muted">Add categories and amounts to drill in.</p>
      ) : (
        <>
          <label className="dashboard-view-select">
            Category
            <select
              value={row?.category_id ?? ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </label>
          {row && (
            <>
              <dl className="stat-grid">
                <div>
                  <dt>Planned</dt>
                  <dd>{formatUsd(row.planned)}</dd>
                </div>
                <div>
                  <dt>Actual</dt>
                  <dd>{formatUsd(row.actual)}</dd>
                </div>
                <div>
                  <dt>Left</dt>
                  <dd className={n(row.remaining) < 0 ? 'warn-text' : undefined}>
                    {formatUsd(row.remaining)}
                  </dd>
                </div>
              </dl>
              {history.length > 1 && (
                <LineTrendChart
                  labels={history.map((h) => MONTH_SHORT[h.month - 1])}
                  series={[
                    {
                      key: 'planned',
                      label: 'Planned',
                      color: COLOR.planned,
                      values: history.map((h) => n(h.planned)),
                    },
                    {
                      key: 'actual',
                      label: 'Actual',
                      color: COLOR.actual,
                      values: history.map((h) => n(h.actual)),
                    },
                  ]}
                  height={160}
                />
              )}
              {notes.length > 0 && (
                <ul className="mover-list">
                  {notes.slice(0, 5).map((tx) => (
                    <li key={tx.id}>
                      <div className="bucket-row">
                        <span>{tx.note || 'No note'}</span>
                        <strong>{formatUsd(tx.amount)}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export function UnderusedPlanWidget({
  categories,
  trends,
  title,
}: {
  categories?: CategoryProgress[]
  trends?: CategoryTrend[]
  title?: string | null
}) {
  const monthly = (categories ?? [])
    .filter(
      (c) =>
        (c.kind === 'expense' || c.kind === 'savings') &&
        n(c.remaining) > 1 &&
        n(c.planned) > 0,
    )
    .sort((a, b) => n(b.remaining) - n(a.remaining))
    .slice(0, 8)
  const annual = (trends ?? [])
    .filter((c) => c.months_under_budget >= 3 && n(c.total_planned) > n(c.total_actual))
    .sort((a, b) => b.months_under_budget - a.months_under_budget)
    .slice(0, 8)
  const items =
    annual.length > 0
      ? annual.map((c) => ({
          label: c.category_name,
          value: n(c.total_planned) - n(c.total_actual),
          color: COLOR.savings,
        }))
      : monthly.map((c) => ({
          label: c.category_name,
          value: n(c.remaining),
          color: COLOR.savings,
        }))
  return (
    <div className="widget">
      <h3>{title || 'Unused plan'}</h3>
      <p className="muted compact">
        Dollars sitting in the plan that could move to a savings bucket or a chronically over-plan category.
      </p>
      {items.length === 0 ? (
        <p className="muted">No unused plan to reallocate in this period.</p>
      ) : (
        <HorizontalBarChart items={items} />
      )}
    </div>
  )
}

export function FlexibleSplitWidget({
  split,
  title,
}: {
  split?: FlexibleSplit | null
  title?: string | null
}) {
  if (!split) {
    return (
      <div className="widget">
        <h3>{title || 'Flexible vs committed'}</h3>
        <p className="muted">Need expense categories to split committed vs flexible spend.</p>
      </div>
    )
  }
  return (
    <div className="widget">
      <h3>{title || 'Flexible vs committed'}</h3>
      <p className="muted compact">
        Rent/mortgage-like lines stay put. Reallocation lives in the flexible band. Soft inference from category names.
      </p>
      <ShareBarChart
        label="Planned paycheck split"
        slices={[
          { id: 'c', label: 'Committed', value: n(split.committed_planned), color: COLOR.committed },
          { id: 'f', label: 'Flexible', value: n(split.flexible_planned), color: COLOR.flexible },
          { id: 's', label: 'Savings', value: n(split.savings_planned), color: COLOR.savings },
          { id: 'l', label: 'Leftover', value: Math.max(0, n(split.leftover_planned)), color: COLOR.leftover },
        ].filter((s) => s.value > 0)}
      />
      <dl className="stat-grid">
        <div>
          <dt>Flexible actual</dt>
          <dd>{formatUsd(split.flexible_actual)}</dd>
        </div>
        <div>
          <dt>Committed actual</dt>
          <dd>{formatUsd(split.committed_actual)}</dd>
        </div>
        <div>
          <dt>From buckets</dt>
          <dd>{formatUsd(split.funded_actual)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function SavingsTrajectoryWidget({
  series,
  title,
}: {
  series?: SavingsHistorySeries[]
  title?: string | null
}) {
  const rows = series ?? []
  const labels = MONTH_SHORT
  return (
    <div className="widget">
      <h3>{title || 'Savings trajectory'}</h3>
      <p className="muted compact">Balance by month. A flattening line after withdrawals is a reason to raise the contribution.</p>
      {rows.length === 0 ? (
        <p className="muted">Add a savings bucket to see trajectory.</p>
      ) : (
        <LineTrendChart
          labels={labels}
          series={rows.map((s, i) => ({
            key: s.category_id,
            label: s.category_name,
            color: MIX_PALETTE[i % MIX_PALETTE.length],
            values: s.points.map((p) => n(p.balance)),
          }))}
        />
      )}
    </div>
  )
}

export function BucketFlowWidget({
  buckets,
  title,
}: {
  buckets: SavingsBucket[]
  title?: string | null
}) {
  return (
    <div className="widget">
      <h3>{title || 'Bucket fill vs use'}</h3>
      <p className="muted compact">Contributions in versus planned use out of each bucket.</p>
      {buckets.length === 0 ? (
        <p className="muted">No savings buckets yet.</p>
      ) : (
        <ul className="bucket-list">
          {buckets.map((b) => (
            <li key={b.category_id}>
              <div className="bucket-row">
                <span>{b.category_name}</span>
                <strong>{formatUsd(b.balance)}</strong>
              </div>
              <p className="muted compact">
                In {formatUsd(b.actual_this_period)} / {formatUsd(b.planned_this_period)} planned
                {n(b.planned_use_this_period) > 0
                  ? ` · planned use ${formatUsd(b.planned_use_this_period)}`
                  : ''}
                {n(b.actual_use_this_period) > 0
                  ? ` · used ${formatUsd(b.actual_use_this_period)}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TradeoffWidget({
  tips,
  title,
  applying,
  onApply,
}: {
  tips?: TradeoffSuggestion[]
  title?: string | null
  applying?: string | null
  onApply?: (tip: TradeoffSuggestion) => void
}) {
  const list = tips ?? []
  return (
    <div className="widget">
      <h3>{title || 'Reallocate leftover'}</h3>
      <p className="muted compact">
        Optional one-click move from unused flexible plan into an unmet savings target. Never required.
      </p>
      {list.length === 0 ? (
        <p className="muted">
          Need unused flexible expense plan and a savings bucket with a target to suggest a move.
        </p>
      ) : (
        <ul className="plan-coaching-list">
          {list.map((tip) => (
            <li key={`${tip.source_category_id}-${tip.dest_category_id}`}>
              <div className="plan-coaching-row">
                <div className="plan-coaching-copy">
                  <strong>
                    {tip.source_category_name} → {tip.dest_category_name}
                  </strong>
                  <span className="muted">{tip.message}</span>
                </div>
                {onApply && (
                  <div className="plan-coaching-actions">
                    <button
                      type="button"
                      className="btn tiny"
                      disabled={applying === tip.source_category_id}
                      onClick={() => onApply(tip)}
                    >
                      {applying === tip.source_category_id
                        ? 'Applying…'
                        : `Move ${formatUsd(tip.unused_planned)}`}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PlanHeatmapWidget({
  cells,
  title,
}: {
  cells?: CategoryMonthCell[]
  title?: string | null
}) {
  const rows = useMemo(() => {
    const byId = new Map<string, { label: string; values: number[] }>()
    for (const cell of cells ?? []) {
      if (cell.kind !== 'expense') continue
      const slot = byId.get(cell.category_id) ?? {
        label: cell.category_name,
        values: Array.from({ length: 12 }, () => Number.NaN),
      }
      const planned = n(cell.planned)
      const actual = n(cell.actual)
      slot.values[cell.month - 1] = planned > 0 ? actual / planned : Number.NaN
      byId.set(cell.category_id, slot)
    }
    return [...byId.entries()].map(([id, row]) => ({ id, ...row }))
  }, [cells])
  return (
    <div className="widget">
      <h3>{title || 'Plan vs actual heatmap'}</h3>
      <p className="muted compact">
        Green is under plan, gold is about on plan, rust is over. Chronic rust in a row → raise the plan; a short cluster is often seasonal.
      </p>
      {rows.length === 0 ? (
        <p className="muted">Need monthly plans and actuals to draw the year.</p>
      ) : (
        <HeatmapChart rows={rows} />
      )}
    </div>
  )
}

export function PlanDriftWidget({
  cells,
  title,
}: {
  cells?: CategoryMonthCell[]
  title?: string | null
}) {
  const series = useMemo(() => {
    const byId = new Map<string, { label: string; values: number[] }>()
    for (const cell of cells ?? []) {
      if (cell.kind !== 'expense') continue
      const slot = byId.get(cell.category_id) ?? {
        label: cell.category_name,
        values: Array.from({ length: 12 }, () => 0),
      }
      slot.values[cell.month - 1] = n(cell.planned)
      byId.set(cell.category_id, slot)
    }
    return [...byId.entries()]
      .map(([id, row], i) => ({
        key: id,
        label: row.label,
        color: MIX_PALETTE[i % MIX_PALETTE.length],
        values: row.values,
      }))
      .filter((s) => s.values.some((v) => v > 0))
      .slice(0, 8)
  }, [cells])
  return (
    <div className="widget">
      <h3>{title || 'Plan drift'}</h3>
      <p className="muted compact">
        Planned expense amounts over the year. Rising lines mean the plan is learning from actuals.
      </p>
      {series.length === 0 ? (
        <p className="muted">No planned expenses this year.</p>
      ) : (
        <LineTrendChart labels={MONTH_SHORT} series={series} />
      )}
    </div>
  )
}

export function IncomeReliabilityWidget({
  months,
  prior,
  title,
}: {
  months: MonthlyTrendPoint[]
  prior?: MonthlyTrendPoint | null
  title?: string | null
}) {
  const short = months.filter(
    (m) => n(m.income_planned) > 0 && n(m.income_actual) + 0.005 < n(m.income_planned),
  )
  return (
    <div className="widget">
      <h3>{title || 'Income reliability'}</h3>
      <p className="muted compact">
        Months where actual income landed under plan. Coach already waits for paydays before flagging the current month.
      </p>
      <LineTrendChart
        labels={MONTH_SHORT}
        series={[
          {
            key: 'planned',
            label: 'Planned',
            color: COLOR.planned,
            values: months.map((m) => n(m.income_planned)),
          },
          {
            key: 'actual',
            label: 'Actual',
            color: COLOR.income,
            values: months.map((m) => n(m.income_actual)),
          },
        ]}
        height={180}
      />
      <p className="muted compact">
        {short.length === 0
          ? 'No under-plan income months in this year yet.'
          : `${short.length} month${short.length === 1 ? '' : 's'} under income plan.`}
        {prior
          ? ` Last year totaled ${formatUsd(prior.income_actual)} vs ${formatUsd(prior.income_planned)} planned.`
          : ''}
      </p>
    </div>
  )
}
