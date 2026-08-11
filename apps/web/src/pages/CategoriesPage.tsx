import { type FormEvent, useCallback, useEffect, useState } from 'react'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import { KindBadge } from '../components/KindBadge'
import type { Category, CategoryKind } from '../types/api'

const KINDS: CategoryKind[] = ['income', 'expense', 'savings']

export function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [showArchived, setShowArchived] = useState(false)
  const [saving, setSaving] = useState(false)

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
      await categoriesApi.createCategory({ kind, name: name.trim() })
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not create')
    } finally {
      setSaving(false)
    }
  }

  async function onArchive(id: string) {
    try {
      await categoriesApi.archiveCategory(id)
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

      <form className="panel inline-form" onSubmit={onCreate}>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
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
            placeholder="e.g. Groceries"
          />
        </label>
        <button className="btn primary" type="submit" disabled={saving}>
          Add
        </button>
      </form>

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
                  <td>{c.name}</td>
                  <td>{c.archived ? 'Archived' : 'Active'}</td>
                  <td className="actions">
                    {c.archived ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void onRestore(c.id)}
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void onArchive(c.id)}
                      >
                        Archive
                      </button>
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
