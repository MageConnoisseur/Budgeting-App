import { type FormEvent, useCallback, useEffect, useState } from 'react'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import { KindBadge } from '../components/KindBadge'
import { SavingsBucketsGuide } from '../components/SavingsBucketsGuide'
import { formatUsd, parseMoneyInput } from '../lib/format'
import type { Category, CategoryKind } from '../types/api'

const KINDS: CategoryKind[] = ['income', 'expense', 'savings']

export function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [targetAmount, setTargetAmount] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await categoriesApi.listCategories({
        include_archived: showArchived,
      })
      setItems(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: {
        kind: CategoryKind
        name: string
        target_amount?: string | null
      } = { kind, name: name.trim() }
      if (kind === 'savings') {
        const trimmed = targetAmount.trim()
        if (trimmed) {
          const parsed = parseMoneyInput(trimmed)
          if (parsed == null || Number(parsed) <= 0) {
            setError('Target amount must be a positive dollar amount')
            setSaving(false)
            return
          }
          body.target_amount = parsed
        }
      }
      await categoriesApi.createCategory(body)
      setName('')
      setTargetAmount('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not create')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditTarget(
      c.kind === 'savings' && c.target_amount != null ? c.target_amount : '',
    )
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditTarget('')
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    const current = items.find((c) => c.id === editingId)
    if (!current) return

    const body: {
      name: string
      target_amount?: string | null
    } = { name: trimmed }

    if (current.kind === 'savings') {
      const t = editTarget.trim()
      if (!t) {
        body.target_amount = null
      } else {
        const parsed = parseMoneyInput(t)
        if (parsed == null || Number(parsed) <= 0) {
          setError('Target amount must be a positive dollar amount')
          return
        }
        body.target_amount = parsed
      }
    }

    setRenaming(true)
    setError(null)
    try {
      await categoriesApi.updateCategory(editingId, body)
      cancelEdit()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not save')
    } finally {
      setRenaming(false)
    }
  }

  async function onArchive(id: string) {
    try {
      await categoriesApi.archiveCategory(id)
      if (editingId === id) cancelEdit()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not archive')
    }
  }

  async function onRestore(id: string) {
    try {
      await categoriesApi.updateCategory(id, { archived: false })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not restore')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Categories</h1>
          <p className="muted">
            Income, expense, and savings buckets used across plans and the
            tracker.
          </p>
        </div>
      </header>

      <SavingsBucketsGuide variant="full" />

      <form className="panel inline-form" onSubmit={onCreate}>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as CategoryKind
              setKind(next)
              if (next !== 'savings') setTargetAmount('')
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={128}
            placeholder={
              kind === 'savings'
                ? 'e.g. Emergency fund'
                : kind === 'income'
                  ? 'e.g. Paycheck'
                  : 'e.g. Groceries'
            }
          />
        </label>
        {kind === 'savings' && (
          <label>
            Target
            <input
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              inputMode="decimal"
              placeholder="optional"
              aria-label="Savings target amount"
            />
          </label>
        )}
        <button className="btn primary" type="submit" disabled={saving}>
          Add
        </button>
      </form>

      {kind === 'savings' && (
        <p className="muted compact">
          Tip: set an optional target goal here, plan a monthly contribution on
          Budget, then log deposits (+) and withdrawals (−) in Tracker. The
          dashboard projects when you&apos;ll hit the target.
        </p>
      )}

      <div className="toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No categories yet. Add your first above.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Name</th>
                <th>Target</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={c.archived ? 'row-muted' : undefined}>
                  <td>
                    <KindBadge kind={c.kind} />
                  </td>
                  <td>
                    {editingId === c.id ? (
                      <form className="inline-edit" onSubmit={onSaveEdit}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                          maxLength={128}
                          aria-label="Category name"
                          autoFocus
                        />
                        {c.kind === 'savings' && (
                          <input
                            value={editTarget}
                            onChange={(e) => setEditTarget(e.target.value)}
                            inputMode="decimal"
                            placeholder="Target (blank = none)"
                            aria-label="Savings target amount"
                          />
                        )}
                        <button
                          className="btn tiny primary"
                          type="submit"
                          disabled={renaming}
                        >
                          Save
                        </button>
                        <button
                          className="btn tiny ghost"
                          type="button"
                          onClick={cancelEdit}
                          disabled={renaming}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td>
                    {c.kind !== 'savings'
                      ? '—'
                      : c.target_amount != null
                        ? formatUsd(c.target_amount)
                        : '—'}
                  </td>
                  <td>{c.archived ? 'Archived' : 'Active'}</td>
                  <td className="actions">
                    {editingId === c.id ? null : c.archived ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void onRestore(c.id)}
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => startEdit(c)}
                        >
                          {c.kind === 'savings' ? 'Edit' : 'Rename'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => void onArchive(c.id)}
                        >
                          Archive
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
