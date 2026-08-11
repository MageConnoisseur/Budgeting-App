import type { ViewMode } from '../types/api'

interface Props {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  label?: string
}

export function ViewModeToggle({ value, onChange, label = 'View' }: Props) {
  return (
    <div className="view-toggle" role="group" aria-label={label}>
      <button
        type="button"
        className={value === 'monthly' ? 'toggle-btn active' : 'toggle-btn'}
        onClick={() => onChange('monthly')}
        aria-pressed={value === 'monthly'}
      >
        Monthly
      </button>
      <button
        type="button"
        className={value === 'annual' ? 'toggle-btn active' : 'toggle-btn'}
        onClick={() => onChange('annual')}
        aria-pressed={value === 'annual'}
      >
        Annual
      </button>
    </div>
  )
}
