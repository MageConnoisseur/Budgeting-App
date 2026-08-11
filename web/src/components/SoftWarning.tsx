interface Props {
  message?: string
  className?: string
}

/** Soft over-budget indicator — never blocks actions. */
export function SoftWarning({
  message = 'Over plan',
  className = '',
}: Props) {
  return (
    <span className={`soft-warning ${className}`.trim()} title={message}>
      {message}
    </span>
  )
}
