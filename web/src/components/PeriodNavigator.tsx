import { MONTH_NAMES, shiftMonth } from '../lib/format'

interface Props {
  year: number
  month: number
  onChange: (year: number, month: number) => void
  yearOnly?: boolean
}

export function PeriodNavigator({ year, month, onChange, yearOnly }: Props) {
  if (yearOnly) {
    return (
      <div className="period-nav">
        <button
          type="button"
          className="btn ghost"
          onClick={() => onChange(year - 1, month)}
          aria-label="Previous year"
        >
          ‹
        </button>
        <h2 className="period-label">{year}</h2>
        <button
          type="button"
          className="btn ghost"
          onClick={() => onChange(year + 1, month)}
          aria-label="Next year"
        >
          ›
        </button>
      </div>
    )
  }

  const prev = () => {
    const n = shiftMonth(year, month, -1)
    onChange(n.year, n.month)
  }
  const next = () => {
    const n = shiftMonth(year, month, 1)
    onChange(n.year, n.month)
  }

  return (
    <div className="period-nav">
      <button
        type="button"
        className="btn ghost"
        onClick={prev}
        aria-label="Previous month"
      >
        ‹
      </button>
      <h2 className="period-label">
        {MONTH_NAMES[month - 1]} {year}
      </h2>
      <button
        type="button"
        className="btn ghost"
        onClick={next}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}
