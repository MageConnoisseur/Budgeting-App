import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import * as txApi from '../api/transactions'
import { KindBadge } from '../components/KindBadge'
import { SavingsBucketsGuide } from '../components/SavingsBucketsGuide'
import { formatUsd, todayISO, toMoneyString } from '../lib/format'
import type {
  Category,
  CategoryKind,
  SortDir,
  Transaction,
  TransactionSortBy,
} from '../types/api'

const PAGE_SIZE = 50

export function TrackerPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [kind, setKind] = useState<CategoryKind | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState<TransactionSortBy>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formKind, setFormKind] = useState<CategoryKind>('expense')
  const [formCategory, setFormCategory] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(todayISO())
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredCats = useMemo(() => {
    const active = categories.filter((c) => c.kind === formKind && !c.archived)
    // Keep the current selection visible while editing, even if archived.
    if (formCategory && !active.some((c) => c.id === formCategory)) {
      const current = categories.find((c) => c.id === formCategory)
      if (current && current.kind === formKind) {
        return [current, ...active]
      }
    }
    return active
  }, [categories, formKind, formCategory])

  const filterCats = useMemo(
    () =>
      kind
        ? categories.filter((c) => c.kind === kind)
        : categories,
    [categories, kind],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await txApi.listTransactions({
        q: q || undefined,
        kind: kind || undefined,
        category_id: categoryId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        limit: PAGE_SIZE,
        offset,
      })
      setItems(list.items)
      setTotal(list.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [q, kind, categoryId, dateFrom, dateTo, sortBy, sortDir, offset])

  useEffect(() => {
    void categoriesApi.listCategories({ include_archived: true }).then(setCategories)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (filteredCats.length && !filteredCats.some((c) => c.id === formCategory)) {
      setFormCategory(filteredCats[0].id)
    }
  }, [filteredCats, formCategory])

  function resetFilters() {
    setQ('')
    setKind('')
    setCategoryId('')
    setDateFrom('')
    setDateTo('')
    setSortBy('date')
    setSortDir('desc')
    setOffset(0)
  }

  function resetForm() {
    setEditingId(null)
    setFormKind('expense')
    setFormAmount('')
    setFormNote('')
    setFormDate(todayISO())
    const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived)
    setFormCategory(expenseCats[0]?.id ?? '')
  }

  function startEdit(tx: Transaction) {
    const txKind = tx.category?.kind ?? 'expense'
    setEditingId(tx.id)
    setFormKind(txKind)
    setFormCategory(tx.category_id)
    setFormAmount(tx.amount)
    setFormDate(tx.date)
    setFormNote(tx.note ?? '')
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    resetForm()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formCategory) {
      setError('Select a category')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        category_id: formCategory,
        amount: toMoneyString(formAmount),
        date: formDate,
        note: formNote.trim() || null,
      }
      if (editingId) {
        await txApi.updateTransaction(editingId, payload)
      } else {
        await txApi.createTransaction(payload)
      }
      resetForm()
      setOffset(0)
      await load()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : editingId
            ? 'Could not update transaction'
            : 'Could not log transaction',
      )
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await txApi.deleteTransaction(id)
      if (editingId === id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Delete failed')
    }
  }

  function toggleSort(col: TransactionSortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(col === 'date' ? 'desc' : 'asc')
    }
    setOffset(0)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Tracker</h1>
          <p className="muted">
            Log actual money movement. Search and filter to confirm what you
            already entered.
          </p>
        </div>
      </header>

      <form className="panel stack" onSubmit={onSubmit}>
        <h3 className="section-title">
          {editingId ? 'Edit transaction' : 'Log transaction'}
        </h3>
        <div className="inline-form wrap">
          <label>
            Kind
            <select
              value={formKind}
              onChange={(e) => setFormKind(e.target.value as CategoryKind)}
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="savings">Savings</option>
            </select>
          </label>
          <label className="grow">
            Category
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              required
            >
              {filteredCats.length === 0 ? (
                <option value="">No categories</option>
              ) : (
                filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            {formKind === 'savings' ? 'Amount (+ in / − out)' : 'Amount'}
            <input
              inputMode="decimal"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              required
              placeholder={formKind === 'savings' ? 'e.g. 200 or -150' : '0.00'}
              aria-describedby={
                formKind === 'savings' ? 'savings-amount-hint' : undefined
              }
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
            />
          </label>
          <label className="grow">
            Note
            <input
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              maxLength={2000}
              placeholder="Optional"
            />
          </label>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving
              ? 'Saving…'
              : editingId
                ? 'Save changes'
                : 'Add'}
          </button>
          {editingId && (
            <button
              className="btn ghost"
              type="button"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
        {formKind === 'savings' && (
          <div id="savings-amount-hint">
            <SavingsBucketsGuide variant="tracker" defaultOpen />
          </div>
        )}
      </form>

      <div className="panel stack">
        <h3 className="section-title">Find past entries</h3>
        <div className="inline-form wrap">
          <label className="grow">
            Search
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOffset(0)
              }}
              placeholder="Note, category, amount, date…"
            />
          </label>
          <label>
            Kind
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as CategoryKind | '')
                setCategoryId('')
                setOffset(0)
              }}
            >
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="savings">Savings</option>
            </select>
          </label>
          <label>
            Category
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setOffset(0)
              }}
            >
              <option value="">All</option>
              {filterCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setOffset(0)
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setOffset(0)
              }}
            />
          </label>
          <button type="button" className="btn ghost" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          No transactions match. Try clearing search or filters.
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleSort('date')}
                    >
                      Date {sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleSort('kind')}
                    >
                      Kind {sortBy === 'kind' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleSort('category')}
                    >
                      Category{' '}
                      {sortBy === 'category' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleSort('amount')}
                    >
                      Amount{' '}
                      {sortBy === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr
                    key={tx.id}
                    className={editingId === tx.id ? 'row-editing' : undefined}
                  >
                    <td>{tx.date}</td>
                    <td>
                      {tx.category ? (
                        <KindBadge kind={tx.category.kind} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{tx.category?.name ?? '—'}</td>
                    <td className="num">{formatUsd(tx.amount)}</td>
                    <td className="note-cell">{tx.note || '—'}</td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => startEdit(tx)}
                        disabled={editingId === tx.id}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void onDelete(tx.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <p className="muted">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{' '}
              {total}
            </p>
            <div className="row-gap">
              <button
                type="button"
                className="btn ghost"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
