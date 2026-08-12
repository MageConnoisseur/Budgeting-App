import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import * as recurringApi from '../api/recurringSchedules'
import { formatUsd, toMoneyString } from '../lib/format'
import type { CategoryKind, RecurrenceFrequency } from '../types/api'

const FREQ_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
]

export interface RecurringPromptDraft {
  categoryId: string
  categoryName: string
  kind: CategoryKind
  amount: string
  date: string
  note: string | null
}

/**
 * Soft prompt after logging an income/expense — asks whether to schedule it.
 */
export function RecurringPrompt({
  draft,
  onDismiss,
  onCreated,
}: {
  draft: RecurringPromptDraft
  onDismiss: () => void
  onCreated?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [anchorDay, setAnchorDay] = useState(15)
  const [amount, setAmount] = useState(draft.amount)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const d = new Date(`${draft.date}T12:00:00`)
    const weekday = d.getDay() === 0 ? 7 : d.getDay()
    setFrequency('monthly')
    setAnchorDay(Math.min(d.getDate(), 28))
    setAmount(draft.amount)
    // Prefill weekday if user switches to weekly later.
    void weekday
  }, [draft])

  const kindLabel = draft.kind === 'income' ? 'income' : 'expense'
  const weekday = useMemo(() => {
    const d = new Date(`${draft.date}T12:00:00`)
    return d.getDay() === 0 ? 7 : d.getDay()
  }, [draft.date])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const anchor =
        frequency === 'weekly' || frequency === 'biweekly'
          ? weekday
          : frequency === 'semimonthly'
            ? 1
            : Math.min(Math.max(anchorDay, 1), 28)
      await recurringApi.createSchedule({
        category_id: draft.categoryId,
        amount: toMoneyString(amount),
        note: draft.note,
        frequency,
        anchor_day: anchor,
        start_date: draft.date,
      })
      onCreated?.()
      onDismiss()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Could not create schedule',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="recurring-prompt" role="status">
        <p>
          Want to schedule this {kindLabel} (
          <strong>{draft.categoryName}</strong> · {formatUsd(draft.amount)}) so
          it shows up again on payday or withdrawal day?
        </p>
        <div className="row-gap">
          <button
            type="button"
            className="btn primary"
            onClick={() => setOpen(true)}
          >
            Yes, make it recurring
          </button>
          <button type="button" className="btn ghost" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="recurring-prompt stack" onSubmit={onSubmit}>
      <p>
        Schedule <strong>{draft.categoryName}</strong> as recurring {kindLabel}.
      </p>
      <div className="inline-form wrap">
        <label>
          Amount
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Frequency
          <select
            value={frequency}
            onChange={(e) => {
              const f = e.target.value as RecurrenceFrequency
              setFrequency(f)
              if (f === 'weekly' || f === 'biweekly') setAnchorDay(weekday)
              else if (f === 'monthly') {
                const d = new Date(`${draft.date}T12:00:00`)
                setAnchorDay(Math.min(d.getDate(), 28))
              }
            }}
          >
            {FREQ_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {frequency === 'monthly' && (
          <label>
            Day of month
            <input
              type="number"
              min={1}
              max={28}
              value={anchorDay}
              onChange={(e) => setAnchorDay(Number(e.target.value))}
              required
            />
          </label>
        )}
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={onDismiss}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}
