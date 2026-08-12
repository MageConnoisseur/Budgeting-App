import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import * as recurringApi from '../api/recurringSchedules'
import {
  MONTH_NAMES,
  currentYearMonth,
  formatUsd,
  shiftMonth,
} from '../lib/format'
import type { IncomeEstimate } from '../types/api'

export function IncomeEstimatePanel() {
  const initial = currentYearMonth()
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [data, setData] = useState<IncomeEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void recurringApi
      .incomeEstimate(year, month)
      .then((est) => {
        if (!cancelled) setData(est)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.detail : 'Could not estimate income',
          )
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, month])

  function move(delta: number) {
    const next = shiftMonth(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  return (
    <section className="panel stack income-estimate-panel">
      <div className="toolbar">
        <div>
          <h3 className="section-title">Income estimate</h3>
          <p className="muted income-estimate-lead">
            Projected from tracker patterns and your recurring schedules — not a
            locked plan.
          </p>
        </div>
        <div className="row-gap">
          <button
            type="button"
            className="btn ghost"
            onClick={() => move(-1)}
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="income-estimate-period">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => move(1)}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Estimating…</p>
      ) : data ? (
        <>
          <div className="income-estimate-totals">
            <div>
              <span className="muted">Estimated</span>
              <strong>{formatUsd(data.estimated_total)}</strong>
            </div>
            <div>
              <span className="muted">Planned</span>
              <strong>{formatUsd(data.planned_total)}</strong>
            </div>
            <div>
              <span className="muted">Logged so far</span>
              <strong>{formatUsd(data.actual_to_date)}</strong>
            </div>
          </div>
          <p className="muted income-estimate-msg">{data.message}</p>
          {data.categories.length === 0 ? (
            <p className="empty">
              Log a few paychecks or add an income schedule to unlock estimates.
            </p>
          ) : (
            <ul className="income-estimate-list">
              {data.categories.map((c) => (
                <li key={c.category_id}>
                  <div className="income-estimate-row">
                    <span>{c.category_name}</span>
                    <span className="num">{formatUsd(c.estimated_amount)}</span>
                  </div>
                  <p className="muted income-estimate-meta">{c.message}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  )
}
