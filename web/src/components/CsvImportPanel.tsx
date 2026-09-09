import { useCallback, useEffect, useMemo, useState } from 'react'
import * as importApi from '../api/imports'
import { ApiError } from '../api/client'
import { formatUsd } from '../lib/format'
import type { Category, ImportCandidate, ImportPreview } from '../types/api'

function inRange(iso: string, from: string, to: string) {
  if (from && iso < from) return false
  if (to && iso > to) return false
  return true
}

export function CsvImportPanel({
  categories,
  onLedgerChange,
}: {
  categories: Category[]
  onLedgerChange: () => void
}) {
  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === 'expense' && !c.archived),
    [categories],
  )

  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [inbox, setInbox] = useState<ImportCandidate[]>([])
  const [categoryById, setCategoryById] = useState<Record<string, string>>({})
  const [lastCategory, setLastCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const loadInbox = useCallback(async () => {
    try {
      const list = await importApi.listImportInbox()
      setError(null)
      setInbox(list.items)
      setCategoryById((prev) => {
        const next = { ...prev }
        for (const item of list.items) {
          if (!next[item.id]) {
            next[item.id] = item.category_id || lastCategory || expenseCats[0]?.id || ''
          }
        }
        return next
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load import inbox')
    }
  }, [expenseCats, lastCategory])

  useEffect(() => {
    void loadInbox()
  }, [loadInbox])

  const rangedCount = useMemo(() => {
    if (!preview) return 0
    return preview.rows.filter((r) => inRange(r.trans_date, dateFrom, dateTo))
      .length
  }, [preview, dateFrom, dateTo])

  async function onPickFile(next: File | null) {
    setFile(next)
    setPreview(null)
    setError(null)
    if (!next) return
    setBusy(true)
    try {
      const parsed = await importApi.previewImport(next)
      setPreview(parsed)
      setDateFrom(parsed.date_min ?? '')
      setDateTo(parsed.date_max ?? '')
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not read that CSV')
    } finally {
      setBusy(false)
    }
  }

  async function onCommit() {
    if (!file || !dateFrom || !dateTo) return
    setBusy(true)
    setError(null)
    try {
      const result = await importApi.commitImport(file, dateFrom, dateTo)
      setInbox(result.inbox.items)
      const batch = result.batch
      const bits = [
        `${batch.imported_count} row${batch.imported_count === 1 ? '' : 's'} added to the inbox`,
      ]
      if (batch.skipped_payment_count) {
        bits.push(`${batch.skipped_payment_count} card payment(s) skipped`)
      }
      if (batch.skipped_duplicate_count) {
        bits.push(`${batch.skipped_duplicate_count} already imported`)
      }
      if (batch.skipped_out_of_range_count) {
        bits.push(`${batch.skipped_out_of_range_count} outside the date range`)
      }
      setPreview(null)
      setFile(null)
      setFileKey((k) => k + 1)
      setError(null)
      setNotice(bits.join('. ') + '.')
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  function categoryFor(id: string) {
    return categoryById[id] || lastCategory || expenseCats[0]?.id || ''
  }

  async function onAccept(row: ImportCandidate) {
    const categoryId = categoryFor(row.id)
    if (!categoryId) {
      setError('Create an expense category before accepting imported charges.')
      return
    }
    setRowBusy(row.id)
    setError(null)
    try {
      await importApi.acceptImport(row.id, categoryId)
      setLastCategory(categoryId)
      setInbox((items) => items.filter((i) => i.id !== row.id))
      onLedgerChange()
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not accept that row')
    } finally {
      setRowBusy(null)
    }
  }

  async function onSkip(row: ImportCandidate) {
    setRowBusy(row.id)
    setError(null)
    try {
      await importApi.skipImport(row.id)
      setInbox((items) => items.filter((i) => i.id !== row.id))
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not skip that row')
    } finally {
      setRowBusy(null)
    }
  }

  async function onMerge(row: ImportCandidate) {
    setRowBusy(row.id)
    setError(null)
    try {
      await importApi.mergeImport(row.id, row.matched_transaction?.id)
      setInbox((items) => items.filter((i) => i.id !== row.id))
      onLedgerChange()
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not merge that row')
    } finally {
      setRowBusy(null)
    }
  }

  const sourceLabel =
    preview?.source === 'discover'
      ? 'Discover'
      : preview?.source
        ? preview.source
        : null

  return (
    <div className="panel stack">
      <h3 className="section-title">Import statement</h3>
      <p className="muted">
        Upload a Discover CSV, pick the transaction dates to bring in, then
        review each charge. Card payments are skipped (those are transfers).
        Nothing hits the tracker until you accept or merge it.
      </p>

      <div className="inline-form wrap">
        <label className="grow">
          CSV file
          <input
            key={fileKey}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>
      </div>

      {preview && (
        <div className="import-preview stack">
          <p className="status-chip">
            {sourceLabel} · {preview.importable_count} purchases/credits ·{' '}
            {preview.payment_count} payment{preview.payment_count === 1 ? '' : 's'} skipped
          </p>
          {preview.date_min && preview.date_max && (
            <p className="muted">
              File covers {preview.date_min} to {preview.date_max} (transaction
              date).
            </p>
          )}
          <div className="inline-form wrap">
            <label>
              From
              <input
                type="date"
                min={preview.date_min ?? undefined}
                max={preview.date_max ?? undefined}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                min={preview.date_min ?? undefined}
                max={preview.date_max ?? undefined}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={() => void onCommit()}
              disabled={busy || rangedCount === 0}
            >
              {busy ? 'Importing…' : `Review ${rangedCount} in inbox`}
            </button>
          </div>
          {preview.warnings.map((w) => (
            <p key={w} className="muted">
              {w}
            </p>
          ))}
        </div>
      )}

      {notice && <p className="status-chip">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {inbox.length === 0 ? (
        <p className="muted">
          Inbox is empty. Imported rows wait here until you accept, merge, or
          skip them.
        </p>
      ) : (
        <div className="table-wrap import-inbox-wrap">
          <table className="data-table compact import-inbox">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Category</th>
                <th>Match</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((row) => {
                const match = row.matched_transaction
                const isCredit = Number(row.amount) < 0
                return (
                  <tr key={row.id}>
                    <td>{row.trans_date}</td>
                    <td className="import-desc">
                      <div className="import-clip">
                        <span className="import-desc-text" title={row.description}>
                          {row.description}
                        </span>
                        {row.issuer_category && (
                          <span className="muted import-desc-meta">
                            Bank label: {row.issuer_category}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`num${isCredit ? ' warn-text' : ''}`}>
                      {formatUsd(row.amount)}
                      {isCredit ? ' credit' : ''}
                    </td>
                    <td className="import-category">
                      <select
                        value={categoryFor(row.id)}
                        onChange={(e) =>
                          setCategoryById((m) => ({
                            ...m,
                            [row.id]: e.target.value,
                          }))
                        }
                        disabled={expenseCats.length === 0}
                        aria-label={`Category for ${row.description}`}
                      >
                        {expenseCats.length === 0 ? (
                          <option value="">No expense categories</option>
                        ) : (
                          expenseCats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))
                        )}
                      </select>
                    </td>
                    <td className="import-match">
                      {match ? (
                        <div className="import-clip">
                          <span className="import-dup-label">
                            Possible duplicate
                          </span>
                          <span
                            className="muted import-dup-detail"
                            title={[
                              match.category_name,
                              formatUsd(match.amount),
                              match.date,
                              match.note,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            {match.category_name} {formatUsd(match.amount)} on{' '}
                            {match.date}
                            {match.note ? ` (${match.note})` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">New</span>
                      )}
                    </td>
                    <td className="actions">
                      <div className="inline-edit">
                        {match ? (
                          <>
                            <button
                              type="button"
                              className="btn tiny primary"
                              disabled={rowBusy === row.id}
                              onClick={() => void onMerge(row)}
                            >
                              Merge
                            </button>
                            <button
                              type="button"
                              className="btn tiny"
                              disabled={rowBusy === row.id}
                              onClick={() => void onAccept(row)}
                            >
                              Keep both
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn tiny primary"
                            disabled={rowBusy === row.id || !categoryFor(row.id)}
                            onClick={() => void onAccept(row)}
                          >
                            Accept
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn tiny ghost"
                          disabled={rowBusy === row.id}
                          onClick={() => void onSkip(row)}
                        >
                          Skip
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
