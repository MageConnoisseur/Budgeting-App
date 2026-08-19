import type { InputHTMLAttributes } from 'react'
import { budgetFillHint, budgetFillRatio } from '../lib/budgetFill'
import type { CategoryKind } from '../types/api'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  kind: CategoryKind
  actual: number
  planned: number
}

/** Planned-amount input with a kind-colored actuals fill behind the value. */
export function BudgetFillInput({
  kind,
  actual,
  planned,
  className,
  'aria-label': ariaLabel,
  title: titleProp,
  ...inputProps
}: Props) {
  const fill = budgetFillRatio(actual, planned)
  const hint = budgetFillHint(kind, actual, planned, fill)
  const title = titleProp ? `${titleProp}. ${hint}` : hint
  const label = ariaLabel ? `${ariaLabel}. ${hint}` : hint
  const wrapClass = [
    'budget-fill',
    `budget-fill--${kind}`,
    fill.over ? 'is-over' : '',
    fill.pct <= 0 ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={wrapClass}
      style={{ ['--fill-pct' as string]: `${fill.pct}%` }}
      title={title}
      data-fill-pct={String(Math.round(fill.pct))}
      data-fill-over={fill.over ? 'true' : 'false'}
    >
      <div className="budget-fill-bar" aria-hidden="true" />
      <input
        {...inputProps}
        className={className}
        aria-label={label}
        title={title}
      />
    </div>
  )
}
