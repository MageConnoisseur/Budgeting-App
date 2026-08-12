import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import * as recurringApi from '../api/recurringSchedules'
import { KindBadge } from './KindBadge'
import { formatUsd, todayISO, toMoneyString } from '../lib/format'
import type {
  Category,
  CategoryKind,
  RecurrenceFrequency,
  RecurringPatternSuggestion,
  RecurringSchedule,
} from '../types/api'

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month (1st & 15th)',
  monthly: 'Monthly',
}

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

function defaultAnchor(frequency: RecurrenceFrequency): number {
  if (frequency === 'weekly' || frequency === 'biweekly') {
    return new Date().getDay() === 0 ? 7 : new Date().getDay()
  }
  return Math.min(new Date().getDate(), 28)
}

export function RecurringSchedulesPanel({
  categories,
  onLogged,
}: {
  categories: Category[]
  onLogged?: () => void
}) {
  const [items, setItems] = useState<RecurringSchedule[]>([])
  const [suggestions, setSuggestions] = useState<RecurringPatternSuggestion[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formKind, setFormKind] = useState<CategoryKind>('income')
  const [formCategory, setFormCategory] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formFreq, setFormFreq] = useState<RecurrenceFrequency>('biweekly')
  const [formAnchor, setFormAnchor] = useState(defaultAnchor('biweekly'))
  const [formStart, setFormStart] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  const filteredCats = useMemo(
    () => categories.filter((c) => c.kind === formKind && !c.archived),
    [categories, formKind],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, tips] = await Promise.all([
        recurringApi.listSchedules({ active_only: false }),
        recurringApi.listSuggestions(),
      ])
      setItems(list.items)
      setSuggestions(tips.items)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (filteredCats.length && !filteredCats.some((c) => c.id === formCategory)) {
      setFormCategory(filteredCats[0].id)
    }
  }, [filteredCats, formCategory])

  function resetForm() {
    setFormKind('income')
    setFormAmount('')
    setFormNote('')
    setFormFreq('biweekly')
    setFormAnchor(defaultAnchor('biweekly'))
    setFormStart(todayISO())
    setShowForm(false)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!formCategory) {
      setError('Select a category')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await recurringApi.createSchedule({
        category_id: formCategory,
        amount: toMoneyString(formAmount),
        note: formNote.trim() || null,
        frequency: formFreq,
        anchor_day: formAnchor,
        start_date: formStart,
      })
      resetForm()
      await load()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Could not create schedule',
      )
    } finally {
      setSaving(false)
    }
  }

  async function applySuggestion(tip: RecurringPatternSuggestion) {
    setSaving(true)
    setError(null)
    try {
      await recurringApi.createSchedule({
        category_id: tip.category_id,
        amount: tip.suggested_amount,
        note: tip.sample_note,
        frequency: tip.suggested_frequency,
        anchor_day: tip.suggested_anchor_day,
        start_date: tip.last_date,
      })
      await load()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Could not create schedule',
      )
    } finally {
      setSaving(false)
    }
  }

  async function onLog(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await recurringApi.logOccurrence(id)
      await load()
      onLogged?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not log occurrence')
    } finally {
      setBusyId(null)
    }
  }

  async function onSkip(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await recurringApi.skipOccurrence(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not skip')
    } finally {
      setBusyId(null)
    }
  }

  async function onToggleActive(sched: RecurringSchedule) {
    setBusyId(sched.id)
    setError(null)
    try {
      await recurringApi.updateSchedule(sched.id, { active: !sched.active })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not update')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await recurringApi.deleteSchedule(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not delete')
    } finally {
      setBusyId(null)
    }
  }

  const due = items.filter((s) => s.active && s.is_due)
  const upcoming = items.filter((s) => s.active && !s.is_due)
  const inactive = items.filter((s) => !s.active)

  return (
    <section className="panel stack recurring-panel">
      <div className="toolbar">
        <div>
          <h3 className="section-title">Scheduled tracking</h3>
          <p className="muted recurring-lead">
            Remind yourself to log paychecks and regular withdrawals. Logging
            still happens here in the tracker — nothing is auto-posted.
          </p>
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'Add schedule'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {showForm && (
        <form className="stack recurring-form" onSubmit={onCreate}>
          <div className="inline-form wrap">
            <label>
              Kind
              <select
                value={formKind}
                onChange={(e) => setFormKind(e.target.value as CategoryKind)}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
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
              Amount
              <input
                inputMode="decimal"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                placeholder="0.00"
              />
            </label>
            <label>
              Frequency
              <select
                value={formFreq}
                onChange={(e) => {
                  const f = e.target.value as RecurrenceFrequency
                  setFormFreq(f)
                  setFormAnchor(defaultAnchor(f))
                }}
              >
                {(Object.keys(FREQ_LABELS) as RecurrenceFrequency[]).map(
                  (f) => (
                    <option key={f} value={f}>
                      {FREQ_LABELS[f]}
                    </option>
                  ),
                )}
              </select>
            </label>
            {formFreq === 'weekly' || formFreq === 'biweekly' ? (
              <label>
                Weekday
                <select
                  value={formAnchor}
                  onChange={(e) => setFormAnchor(Number(e.target.value))}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : formFreq === 'monthly' ? (
              <label>
                Day of month
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={formAnchor}
                  onChange={(e) => setFormAnchor(Number(e.target.value))}
                  required
                />
              </label>
            ) : null}
            <label>
              Starts
              <input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                required
              />
            </label>
            <label className="grow">
              Note
              <input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </form>
      )}

      {suggestions.length > 0 && (
        <div className="recurring-suggestions">
          <h4 className="recurring-subhead">From your tracker patterns</h4>
          <ul className="recurring-suggest-list">
            {suggestions.slice(0, 4).map((tip) => (
              <li key={`${tip.category_id}-${tip.suggested_frequency}`}>
                <p>{tip.message}</p>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={() => void applySuggestion(tip)}
                >
                  Add schedule
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading schedules…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          No schedules yet. Add one for payday or a monthly bill, or wait for
          pattern tips after a few similar logs.
        </p>
      ) : (
        <>
          {due.length > 0 && (
            <div className="recurring-group">
              <h4 className="recurring-subhead">Due now</h4>
              <ScheduleTable
                rows={due}
                busyId={busyId}
                onLog={onLog}
                onSkip={onSkip}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
              />
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="recurring-group">
              <h4 className="recurring-subhead">Upcoming</h4>
              <ScheduleTable
                rows={upcoming}
                busyId={busyId}
                onLog={onLog}
                onSkip={onSkip}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
              />
            </div>
          )}
          {inactive.length > 0 && (
            <div className="recurring-group">
              <h4 className="recurring-subhead">Paused</h4>
              <ScheduleTable
                rows={inactive}
                busyId={busyId}
                onLog={onLog}
                onSkip={onSkip}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ScheduleTable({
  rows,
  busyId,
  onLog,
  onSkip,
  onToggleActive,
  onDelete,
}: {
  rows: RecurringSchedule[]
  busyId: string | null
  onLog: (id: string) => void
  onSkip: (id: string) => void
  onToggleActive: (s: RecurringSchedule) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data-table recurring-table">
        <thead>
          <tr>
            <th>Next</th>
            <th>Kind</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Frequency</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={s.is_due ? 'recurring-due-row' : undefined}>
              <td>{s.next_occurrence}</td>
              <td>
                {s.category ? <KindBadge kind={s.category.kind} /> : '—'}
              </td>
              <td>{s.category?.name ?? '—'}</td>
              <td className="num">{formatUsd(s.amount)}</td>
              <td>{FREQ_LABELS[s.frequency]}</td>
              <td className="note-cell">{s.note || '—'}</td>
              <td className="actions">
                {s.active && (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busyId === s.id}
                      onClick={() => void onLog(s.id)}
                    >
                      Log
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busyId === s.id}
                      onClick={() => void onSkip(s.id)}
                    >
                      Skip
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busyId === s.id}
                  onClick={() => void onToggleActive(s)}
                >
                  {s.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busyId === s.id}
                  onClick={() => void onDelete(s.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
