import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import * as budgetsApi from '../api/budgets'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import {
  BudgetBalancePanel,
  sumByKind,
} from '../components/BudgetBalance'
import { BudgetFillInput } from '../components/BudgetFillInput'
import { BudgetPlanDiffStrip } from '../components/BudgetPlanDiffStrip'
import { PeriodNavigator } from '../components/PeriodNavigator'
import { SavingsBucketsGuide } from '../components/SavingsBucketsGuide'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { useAuth } from '../context/AuthContext'
import { indexYearActuals, parseDraftAmount } from '../lib/budgetFill'
import {
  MONTH_SHORT,
  currentYearMonth,
  formatUsd,
  parseMoneyInput,
  shiftMonth,
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

function annualCellKey(categoryId: string, month: number) {
  return `${categoryId}:${month}`
}

function draftFromAnnual(cats: Category[], months: BudgetMonth[]) {
  const amounts: Record<string, string> = {}
  const funding: Record<string, string> = {}
  for (const c of cats) {
    for (let m = 1; m <= 12; m++) {
      const bm = months.find((x) => x.month === m)
      const line = bm?.lines.find((l) => l.category_id === c.id)
      amounts[annualCellKey(c.id, m)] = line
        ? toMoneyString(line.planned_amount)
        : ''
      if (c.kind === 'expense') {
        funding[annualCellKey(c.id, m)] = line?.funded_by_category_id ?? ''
      }
    }
  }
  return { amounts, funding }
}

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
  const [annualDraft, setAnnualDraft] = useState<Record<string, string>>({})
  const [templates, setTemplates] = useState<BudgetTemplate[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  /** Expense category id → savings bucket id (empty = paid from this month's income). */
  const [funding, setFunding] = useState<Record<string, string>>({})
  const [annualFunding, setAnnualFunding] = useState<Record<string, string>>(
    {},
  )
  /** Prior calendar month planned amounts for the "what changed" strip. */
  const [priorAmounts, setPriorAmounts] = useState<Record<string, string> | null>(
    null,
  )
  const [hasPriorPlan, setHasPriorPlan] = useState(false)
  const [yearActuals, setYearActuals] = useState<
    Record<number, Record<string, number>>
  >({})
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
        const prior = shiftMonth(year, month, -1)
        // Annual fetch lists existing months only — avoids creating an empty prior.
        const [bm, priorAnnual, actuals] = await Promise.all([
          budgetsApi.getBudgetMonth(year, month, true),
          budgetsApi.getAnnualBudget(prior.year),
          budgetsApi.getYearActuals(year),
        ])
        setYearActuals(indexYearActuals(actuals))
        setBudget(bm)
        const map: Record<string, string> = {}
        const fund: Record<string, string> = {}
        for (const line of bm.lines) {
          map[line.category_id] = toMoneyString(line.planned_amount)
          if (line.funded_by_category_id) {
            fund[line.category_id] = line.funded_by_category_id
          }
        }
        setAmounts(map)
        setFunding(fund)

        const priorMonth = priorAnnual.months.find((m) => m.month === prior.month)
        if (priorMonth && priorMonth.lines.length > 0) {
          const priorMap: Record<string, string> = {}
          for (const line of priorMonth.lines) {
            priorMap[line.category_id] = toMoneyString(line.planned_amount)
          }
          setPriorAmounts(priorMap)
          setHasPriorPlan(true)
        } else {
          setPriorAmounts(null)
          setHasPriorPlan(false)
        }

        if (bm.seeded_from) {
          setStatus(`Seeded from ${bm.seeded_from}`)
        } else {
          setStatus(null)
        }
      } else {
        const [annual, actuals] = await Promise.all([
          budgetsApi.getAnnualBudget(year),
          budgetsApi.getYearActuals(year),
        ])
        setYearActuals(indexYearActuals(actuals))
        setAnnualMonths(annual.months)
        const draft = draftFromAnnual(cats, annual.months)
        setAnnualDraft(draft.amounts)
        setAnnualFunding(draft.funding)
        setPriorAmounts(null)
        setHasPriorPlan(false)
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

  const priorPeriod = useMemo(() => shiftMonth(year, month, -1), [year, month])

  const grouped = useMemo(() => {
    const map: Record<CategoryKind, Category[]> = {
      income: [],
      expense: [],
      savings: [],
    }
    for (const c of categories) map[c.kind].push(c)
    return map
  }, [categories])

  const plannedUseByBucket = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of grouped.expense) {
      const bucketId = funding[c.id]
      if (!bucketId) continue
      const raw = amounts[c.id]
      const n = raw ? Number(String(raw).replace(/[^0-9.-]/g, '')) : 0
      if (!Number.isNaN(n) && n > 0) {
        map[bucketId] = (map[bucketId] ?? 0) + n
      }
    }
    return map
  }, [grouped.expense, funding, amounts])

  /** Live monthly plan balance from draft inputs (updates as you type). */
  const monthlyBalance = useMemo(
    () =>
      sumByKind(
        categories,
        (id) => {
          const raw = amounts[id]
          if (raw === undefined || raw === '') return 0
          const n = Number(raw.replace(/[^0-9.-]/g, ''))
          return Number.isNaN(n) ? 0 : n
        },
        funding,
      ),
    [categories, amounts, funding],
  )

  /** Annual: year totals + per-month remainder from draft inputs (live as you type). */
  const annualBalance = useMemo(() => {
    const amountFor = (id: string, m: number) => {
      const raw = annualDraft[annualCellKey(id, m)]
      if (raw === undefined || raw === '') return 0
      const n = Number(raw.replace(/[^0-9.-]/g, ''))
      return Number.isNaN(n) ? 0 : n
    }
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const monthFunding: Record<string, string> = {}
      for (const c of categories) {
        if (c.kind !== 'expense') continue
        const fid = annualFunding[annualCellKey(c.id, i + 1)]
        if (fid) monthFunding[c.id] = fid
      }
      return sumByKind(categories, (id) => amountFor(id, i + 1), monthFunding)
    })
    const yearFromMonths = byMonth.reduce(
      (acc, t) => ({
        income: acc.income + t.income,
        expense: acc.expense + t.expense,
        expenseFromSavings: acc.expenseFromSavings + t.expenseFromSavings,
        savings: acc.savings + t.savings,
        balance: acc.balance + t.balance,
      }),
      {
        income: 0,
        expense: 0,
        expenseFromSavings: 0,
        savings: 0,
        balance: 0,
      },
    )
    return { yearTotals: yearFromMonths, byMonth }
  }, [categories, annualDraft, annualFunding])

  async function saveMonthly(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const lines = categories.map((c) => ({
        category_id: c.id,
        planned_amount: parseMoneyInput(amounts[c.id] ?? '0') ?? '0.00',
        funded_by_category_id:
          c.kind === 'expense' ? funding[c.id] || null : null,
      }))
      const bm = await budgetsApi.upsertBudgetMonth(year, month, {
        lines,
        replace_all: true,
      })
      setBudget(bm)
      const fund: Record<string, string> = {}
      for (const line of bm.lines) {
        if (line.funded_by_category_id) {
          fund[line.category_id] = line.funded_by_category_id
        }
      }
      setFunding(fund)
      setStatus('Saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveAnnual(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const dirtyByMonth = new Map<
        number,
        {
          category_id: string
          planned_amount: string
          funded_by_category_id?: string | null
        }[]
      >()
      for (const c of categories) {
        for (let m = 1; m <= 12; m++) {
          const key = annualCellKey(c.id, m)
          const raw = annualDraft[key] ?? ''
          const parsed = raw.trim() === '' ? '' : parseMoneyInput(raw)
          if (parsed === null) {
            setError(`Enter a valid amount for ${c.name} (${MONTH_SHORT[m - 1]})`)
            return
          }
          const bm = annualMonths.find((x) => x.month === m)
          const line = bm?.lines.find((l) => l.category_id === c.id)
          const prev = line ? toMoneyString(line.planned_amount) : ''
          const nextAmount = parsed === '' ? '0.00' : parsed
          const prevFund = line?.funded_by_category_id ?? ''
          const nextFund =
            c.kind === 'expense' ? (annualFunding[key] ?? '') : ''
          const amountChanged = (parsed === '' ? '' : nextAmount) !== prev
          const fundChanged = c.kind === 'expense' && nextFund !== prevFund
          if (!amountChanged && !fundChanged) continue
          const list = dirtyByMonth.get(m) ?? []
          list.push({
            category_id: c.id,
            planned_amount: parsed === '' ? '0.00' : parsed,
            ...(c.kind === 'expense'
              ? { funded_by_category_id: nextFund || null }
              : {}),
          })
          dirtyByMonth.set(m, list)
        }
      }

      if (dirtyByMonth.size > 0) {
        const months = [...dirtyByMonth.keys()].sort((a, b) => a - b)
        for (const m of months) {
          const lines = dirtyByMonth.get(m)
          if (!lines?.length) continue
          await budgetsApi.upsertAnnualCell({
            year,
            month: m,
            category_id: lines[0].category_id,
            planned_amount: lines[0].planned_amount,
            ...(lines[0].funded_by_category_id !== undefined
              ? { funded_by_category_id: lines[0].funded_by_category_id }
              : {}),
          })
          if (lines.length > 1) {
            await budgetsApi.upsertBudgetMonth(year, m, {
              lines,
              replace_all: false,
            })
          }
        }
        const annual = await budgetsApi.getAnnualBudget(year)
        setAnnualMonths(annual.months)
        const draft = draftFromAnnual(categories, annual.months)
        setAnnualDraft(draft.amounts)
        setAnnualFunding(draft.funding)
      }
      setStatus('Saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Save failed')
    } finally {
      setSaving(false)
    }
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
      const fund: Record<string, string> = {}
      for (const line of bm.lines) {
        map[line.category_id] = toMoneyString(line.planned_amount)
        if (line.funded_by_category_id) {
          fund[line.category_id] = line.funded_by_category_id
        }
      }
      setAmounts(map)
      setFunding(fund)
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
      const fund: Record<string, string> = {}
      for (const line of bm.lines) {
        map[line.category_id] = toMoneyString(line.planned_amount)
        if (line.funded_by_category_id) {
          fund[line.category_id] = line.funded_by_category_id
        }
      }
      setAmounts(map)
      setFunding(fund)
      setStatus('Template applied')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Apply failed')
    }
  }

  return (
    <div className={`page${view === 'annual' ? ' page-budget-annual' : ''}`}>
      <header className="page-header">
        <div>
          <h1>Budget</h1>
          <p className="muted">
            Planned amounts by month. The fill behind each amount is actuals
            for that month — hover a cell for the dollars.
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
        <div className="row-gap">
          {view === 'annual' && !loading && categories.length > 0 && (
            <button
              className="btn primary"
              type="submit"
              form="annual-save-form"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save year'}
            </button>
          )}
          {status && <p className="status-chip">{status}</p>}
        </div>
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
            subtitle="Updates as you edit — income − expenses paid from this month − savings"
          />

          <BudgetPlanDiffStrip
            categories={categories}
            currentAmounts={amounts}
            priorAmounts={priorAmounts}
            priorYear={priorPeriod.year}
            priorMonth={priorPeriod.month}
            hasPriorPlan={hasPriorPlan}
          />

          <form className="panel stack" onSubmit={saveMonthly}>
            {KIND_ORDER.map((kind) =>
              grouped[kind].length === 0 ? null : (
                <section key={kind} className="budget-section">
                  <h3 className="section-title">
                    {kind.charAt(0).toUpperCase() + kind.slice(1)}
                  </h3>
                  {kind === 'savings' && (
                    <SavingsBucketsGuide variant="budget" className="compact" />
                  )}
                  <div className="budget-lines">
                    {grouped[kind].map((c) => (
                      <div key={c.id} className="budget-line">
                        <span>{c.name}</span>
                        <BudgetFillInput
                          kind={kind}
                          actual={yearActuals[month]?.[c.id] ?? 0}
                          planned={parseDraftAmount(amounts[c.id])}
                          inputMode="decimal"
                          value={amounts[c.id] ?? ''}
                          onChange={(e) =>
                            setAmounts((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                          aria-label={`${c.name} planned amount`}
                        />
                        {kind === 'expense' && grouped.savings.length > 0 && (
                          <select
                            className="pay-from"
                            aria-label={`Pay ${c.name} from`}
                            value={funding[c.id] ?? ''}
                            onChange={(e) =>
                              setFunding((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">This month’s income</option>
                            {grouped.savings.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {kind === 'savings' && (
                          <span className="budget-line-note muted compact">
                            {plannedUseByBucket[c.id]
                              ? `This month’s expenses plan to use ${formatUsd(plannedUseByBucket[c.id])} from this bucket.`
                              : 'Contribution this month'}
                          </span>
                        )}
                      </div>
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
            subtitle="Sum of monthly remainders — income − expenses paid from income − savings"
          />

          {grouped.savings.length > 0 && (
            <SavingsBucketsGuide variant="budget" className="compact" />
          )}

          <div className="panel month-balance-strip">
            <h3 className="section-title">Monthly remainder</h3>
            <p className="muted compact">
              Each month’s planned income − expenses paid from that month −
              savings as you edit.
              Save the year to keep changes.
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

          <form
            id="annual-save-form"
            className="annual-form"
            onSubmit={(e) => void saveAnnual(e)}
          >
            <div className="table-wrap annual-wrap">
              <table className="data-table annual-grid">
                <colgroup>
                  <col className="annual-cat-col" />
                  {MONTH_SHORT.map((m) => (
                    <col key={m} className="annual-month-col" />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="annual-cat-col" scope="col">
                      Category
                    </th>
                    {MONTH_SHORT.map((m) => (
                      <th key={m} className="annual-month-col" scope="col">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KIND_ORDER.map((kind) =>
                    grouped[kind].map((c, idx) => (
                      <tr key={c.id}>
                        <th className="annual-cat-col" scope="row" title={c.name}>
                          {idx === 0 && (
                            <span className="kind-inline">
                              {kind.charAt(0).toUpperCase() + kind.slice(1)} ·{' '}
                            </span>
                          )}
                          {c.name}
                        </th>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <td key={m} className="annual-month-col">
                            <div
                              className={`annual-cell${
                                c.kind === 'expense' &&
                                annualFunding[annualCellKey(c.id, m)]
                                  ? ' is-funded'
                                  : ''
                              }`}
                            >
                              <BudgetFillInput
                                className="cell-input"
                                kind={c.kind}
                                actual={yearActuals[m]?.[c.id] ?? 0}
                                planned={parseDraftAmount(
                                  annualDraft[annualCellKey(c.id, m)],
                                )}
                                inputMode="decimal"
                                value={annualDraft[annualCellKey(c.id, m)] ?? ''}
                                onChange={(e) =>
                                  setAnnualDraft((prev) => ({
                                    ...prev,
                                    [annualCellKey(c.id, m)]: e.target.value,
                                  }))
                                }
                                placeholder="—"
                                aria-label={`${c.name} ${MONTH_SHORT[m - 1]}`}
                              />
                              {c.kind === 'expense' &&
                                grouped.savings.length > 0 && (
                                  <select
                                    className="cell-fund"
                                    value={
                                      annualFunding[annualCellKey(c.id, m)] ??
                                      ''
                                    }
                                    onChange={(e) =>
                                      setAnnualFunding((prev) => ({
                                        ...prev,
                                        [annualCellKey(c.id, m)]:
                                          e.target.value,
                                      }))
                                    }
                                    aria-label={`Pay ${c.name} ${MONTH_SHORT[m - 1]} from`}
                                    title={
                                      annualFunding[annualCellKey(c.id, m)]
                                        ? grouped.savings.find(
                                            (s) =>
                                              s.id ===
                                              annualFunding[
                                                annualCellKey(c.id, m)
                                              ],
                                          )?.name
                                        : 'This month’s income'
                                    }
                                  >
                                    <option value="">Income</option>
                                    {grouped.savings.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <div className="annual-save-bar">
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save year'}
              </button>
              <p className="muted compact">
                Edit any cell, then save. Empty months seed from prior plans
                when needed.
              </p>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
