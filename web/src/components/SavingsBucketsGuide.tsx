import { useState } from 'react'

type GuideVariant = 'full' | 'tracker' | 'budget' | 'dashboard'

interface Props {
  /** Which surface this tip appears on — adjusts emphasis. */
  variant?: GuideVariant
  /** Start expanded (details open). */
  defaultOpen?: boolean
  className?: string
}

/**
 * Explains savings buckets: plan contributions, log deposits (+) and
 * withdrawals (−), and read running balances on the dashboard.
 */
export function SavingsBucketsGuide({
  variant = 'full',
  defaultOpen = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  const title =
    variant === 'tracker'
      ? 'How savings amounts work'
      : variant === 'budget'
        ? 'Savings on the budget'
        : variant === 'dashboard'
          ? 'Reading savings buckets'
          : 'How savings buckets work'

  return (
    <details
      className={`savings-guide ${className}`.trim()}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      <div className="savings-guide-body">
        {(variant === 'full' || variant === 'budget') && (
          <p>
            Savings categories are <strong>named buckets</strong> (Emergency,
            Vacation, Car fund) with a running balance — not regular expense
            lines.
          </p>
        )}

        {(variant === 'full' || variant === 'budget') && (
          <p>
            On the budget, enter how much you <strong>plan to contribute</strong>{' '}
            to each bucket this month. That planned amount is always positive.
            Big bills you will pay from a bucket (a car shop visit, a new
            monitor) stay on the expense line — set <strong>Pay from</strong> to
            that bucket so the month’s leftover does not treat the bill as
            this paycheck’s problem.
          </p>
        )}

        {(variant === 'full' || variant === 'tracker') && (
          <>
            <p>
              In the tracker, log real money moving in or out of a bucket:
            </p>
            <ul className="savings-guide-list">
              <li>
                <strong>Positive</strong> (e.g. <code>200.00</code>) — deposit /
                contribution into the bucket.
              </li>
              <li>
                <strong>Negative</strong> (e.g. <code>-150.00</code>) — withdraw
                from the bucket when you use that money or move it elsewhere.
              </li>
            </ul>
            <p className="savings-guide-example">
              Example: you contribute $200 to a Car fund (<code>+200</code>).
              In September you take the car in — plan $500 Car maintenance
              paid from Car fund, then log the $500 expense and check{' '}
              <strong>Also withdraw from Car fund</strong> so the bucket drops
              to match.
            </p>
          </>
        )}

        {(variant === 'full' || variant === 'dashboard') && (
          <p>
            The dashboard shows each bucket’s <strong>balance</strong> (all
            deposits minus withdrawals over time) and this period’s progress vs
            your contribution plan. If expenses are marked paid from a bucket,
            leftover ignores those bills. Soft warnings appear if you put in
            more than planned — they never block logging.
          </p>
        )}

        {(variant === 'full' || variant === 'dashboard') && (
          <p>
            Optional <strong>targets</strong> turn buckets into goals: set a
            target amount on Categories, keep a monthly contribution on Budget,
            and the dashboard projects the month you&apos;ll hit it.
          </p>
        )}

        {variant === 'dashboard' && (
          <p className="muted compact">
            Negative tracker amounts reduce a bucket’s balance when you dip into
            savings.
          </p>
        )}
      </div>
    </details>
  )
}
