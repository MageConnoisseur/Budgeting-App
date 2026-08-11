import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import * as budgetsApi from '../api/budgets'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import {
  BudgetBalancePanel,
  sumByKind,
} from '../components/BudgetBalance'
import { PeriodNavigator } from '../components/PeriodNavigator'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { useAuth } from '../context/AuthContext'
import {
  MONTH_SHORT,
  currentYearMonth,
  formatUsd,
  parseMoneyInput,
  toMoneyString,
} from '../lib/format'
import type {
  BudgetMonth,
  BudgetTemplate,
  Category,
  CategoryKind,
  ViewMode,
} from '../types/api'

const KIND_ORDER: CategoryKind[] = ['income', 'expense', 'savings']

export function BudgetPage() {
  const { user, setPreferredView } = useAuth()
  const initial = currentYearMonth()
  const [view, setView] = useState<ViewMode>(
    user?.preferred_budget_view ?? 'monthly',
  )
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [categories, setCategories] = useState<Category[]>([])
  const [budget, setBudget] = useState<BudgetMonth | null>(null)
  const [annualMonths, setAnnualMonths] = useState<BudgetMonth[]>([])
  const [templates, setTemplates] = useState<BudgetTemplate[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copyYear, setCopyYear] = useState(initial.year)
  const [copyMonth, setCopyMonth] = useState(
    initial.month === 1 ? 12 : initial.month - 1,
  )
  const [templateName, setTemplateName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')

  useEffect(() => {
    if (user?.preferred_budget_view) setView(user.preferred_budget_view)
  }, [user?.preferred_budget_view])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cats, tpls] = await Promise.all([
        categoriesApi.listCategories(),
        budgetsApi.listTemplates(),
      ])
      setCategories(cats)
      setTemplates(tpls)

      if (view === 'monthly') {
        const bm = await budgetsApi.getBudgetMonth(year, month, true)
        setBudget(bm)
        const map: Record<string, string> = {}
        for (const line of bm.lines) {
          map[line.category_id] = toMoneyString(line.planned_amount)
        }
        setAmounts(map)
        if (bm.seeded_from) {
          setStatus(`Seeded from ${bm.seeded_from}`)
        } else {
          setStatus(null)
        }
      } else {
        const annual = await budgetsApi.getAnnualBudget(year)
        setAnnualMonths(annual.months)
        setStatus(null)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load budget')
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
      await setPreferredView('budget', mode)
    } catch {
      /* preference is best-effort */
    }
  }

  const grouped = useMemo(() => {
    const map: Record<CategoryKind, Category[]> = {
      income: [],
      expense: [],
      savings: [],
    }
    for (const c of categories) map[c.kind].push(c)
    return map
  }, [categories])

  /** Live monthly plan balance from draft inputs (updates as you type). */
  const monthlyBalance = useMemo(
    () =>
      sumByKind(categories, (id) => {
        const raw = amounts[id]
        if (raw === undefined || raw === '') return 0
        const n = Number(raw.replace(/[^0-9.-]/g, ''))
        return Number.isNaN(n) ? 0 : n
      }),
    [categories, amounts],
  )

  /** Annual: year totals + per-month remainder for balanced-budget scanning. */
  const annualBalance = useMemo(() => {
    const yearTotals = sumByKind(categories, (id) => {
      let total = 0
      for (const bm of annualMonths) {
        const line = bm.lines.find((l) => l.category_id === id)
        if (line) total += Number(line.planned_amount)
      }
      return total
    })
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const bm = annualMonths.find((x) => x.month === m)
      return sumByKind(categories, (id) => {
        const line = bm?.lines.find((l) => l.category_id === id)
        return line ? Number(line.planned_amount) : 0
      })
    })
    return { yearTotals, byMonth }
  }, [categories, annualMonths])

  async function saveMonthly(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const lines = categories.map((c) => ({
        category_id: c.id,
        planned_amount: parseMoneyInput(amounts[c.id] ?? '0') ?? '0.00',
      }))
      const bm = await budgetsApi.upsertBudgetMonth(year, month, {
        lines,
        replace_all: true,
      })
      setBudget(bm)
      setStatus('Saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onAnnualCellBlur(
    categoryId: string,
    m: number,
    raw: string,
  ) {
    const parsed = parseMoneyInput(raw)
    if (parsed === null) return
    setError(null)
    try {
      await budgetsApi.upsertAnnualCell({
        year,
        month: m,
        category_id: categoryId,
        planned_amount: parsed,
      })
      const annual = await budgetsApi.getAnnualBudget(year)
      setAnnualMonths(annual.months)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Cell update failed')
    }
  }

  function annualAmount(categoryId: string, m: number): string {
    const bm = annualMonths.find((x) => x.month === m)
    const line = bm?.lines.find((l) => l.category_id === categoryId)
    return line ? toMoneyString(line.planned_amount) : ''
  }

  async function onCopyFrom(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const bm = await budgetsApi.copyFromMonth(
        year,
        month,
        copyYear,
        copyMonth,
      )
      setBudget(bm)
      const map: Record<string, string> = {}
      for (const line of bm.lines) {
        map[line.category_id] = toMoneyString(line.planned_amount)
      }
      setAmounts(map)
      setStatus(`Copied from ${copyYear}-${String(copyMonth).padStart(2, '0')}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Copy failed')
    }
  }

  async function onSaveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!templateName.trim()) return
    setError(null)
    try {
      await budgetsApi.saveTemplate({
        name: templateName.trim(),
        year,
        month,
      })
      setTemplateName('')
      setTemplates(await budgetsApi.listTemplates())
      setStatus('Template saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Template save failed')
    }
  }

  async function onApplyTemplate(e: FormEvent) {
    e.preventDefault()
    if (!selectedTemplate) return
    setError(null)
    try {
      const bm = await budgetsApi.applyTemplate(
        year,
        month,
        selectedTemplate,
      )
      setBudget(bm)
      const map: Record<string, string> = {}
      for (const line of bm.lines) {
        map[line.category_id] = toMoneyString(line.planned_amount)
      }
      setAmounts(map)
      setStatus('Template applied')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Apply failed')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Budget</h1>
          <p className="muted">
            Planned amounts by month. USD only. Going over is allowed later in
            the tracker.
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
        {status && <p className="status-chip">{status}</p>}
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="empty">
          Add categories first, then set planned amounts here.
        </p>
      ) : view === 'monthly' ? (
        <>
          <BudgetBalancePanel
            totals={monthlyBalance}
            title="Month plan balance"
            subtitle="Updates as you edit — income − expenses − savings"
          />

          <form className="panel stack" onSubmit={saveMonthly}>
            {KIND_ORDER.map((kind) =>
              grouped[kind].length === 0 ? null : (
                <section key={kind} className="budget-section">
                  <h3 className="section-title">
                    {kind.charAt(0).toUpperCase() + kind.slice(1)}
                  </h3>
                  <div className="budget-lines">
                    {grouped[kind].map((c) => (
                      <label key={c.id} className="budget-line">
                        <span>{c.name}</span>
                        <input
                          inputMode="decimal"
                          value={amounts[c.id] ?? ''}
                          onChange={(e) =>
                            setAmounts((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ),
            )}
            <div className="toolbar">
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save month'}
              </button>
              {budget && (
                <span className="muted">
                  Balance updates live · {budget.lines.length} lines
                </span>
              )}
            </div>
          </form>

          <div className="panel-grid">
            <form className="panel stack" onSubmit={onCopyFrom}>
              <h3 className="section-title">Copy from month…</h3>
              <div className="inline-form">
                <label>
                  Year
                  <input
                    type="number"
                    value={copyYear}
                    onChange={(e) => setCopyYear(Number(e.target.value))}
                  />
                </label>
                <label>
                  Month
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={copyMonth}
                    onChange={(e) => setCopyMonth(Number(e.target.value))}
                  />
                </label>
                <button className="btn" type="submit">
                  Copy
                </button>
              </div>
            </form>

            <form className="panel stack" onSubmit={onSaveTemplate}>
              <h3 className="section-title">Save as template</h3>
              <div className="inline-form">
                <label className="grow">
                  Name
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Default plan"
                    required
                  />
                </label>
                <button className="btn" type="submit">
                  Save
                </button>
              </div>
            </form>

            <form className="panel stack" onSubmit={onApplyTemplate}>
              <h3 className="section-title">Apply template</h3>
              <div className="inline-form">
                <label className="grow">
                  Template
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn"
                  type="submit"
                  disabled={!selectedTemplate}
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
        <>
          <BudgetBalancePanel
            totals={annualBalance.yearTotals}
            title="Year plan balance"
            subtitle="Sum of all planned months — income − expenses − savings"
          />

          <div className="panel month-balance-strip">
            <h3 className="section-title">Monthly remainder</h3>
            <p className="muted compact">
              Each month’s planned income − expenses − savings after cell edits.
            </p>
            <div className="month-balance-grid">
              {annualBalance.byMonth.map((t, i) => {
                const tone =
                  Math.abs(t.balance) < 0.005
                    ? 'balanced'
                    : t.balance > 0
                      ? 'surplus'
                      : 'deficit'
                return (
                  <div key={MONTH_SHORT[i]} className={`month-balance-cell tone-${tone}`}>
                    <span>{MONTH_SHORT[i]}</span>
                    <strong>{formatUsd(t.balance)}</strong>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="table-wrap annual-wrap">
            <table className="data-table annual-grid">
              <thead>
                <tr>
                  <th>Category</th>
                  {MONTH_SHORT.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.map((kind) =>
                  grouped[kind].map((c, idx) => (
                    <tr key={c.id}>
                      <td>
                        {idx === 0 && (
                          <span className="kind-inline">
                            {kind.charAt(0).toUpperCase() + kind.slice(1)} ·{' '}
                          </span>
                        )}
                        {c.name}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <td key={m}>
                          <input
                            className="cell-input"
                            inputMode="decimal"
                            defaultValue={annualAmount(c.id, m)}
                            key={`${c.id}-${m}-${annualAmount(c.id, m)}`}
                            onBlur={(e) =>
                              void onAnnualCellBlur(c.id, m, e.target.value)
                            }
                            placeholder="—"
                            aria-label={`${c.name} ${MONTH_SHORT[m - 1]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            <p className="muted compact">
              Edit any cell to update that month’s plan. Empty months seed from
              prior plans when needed.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
