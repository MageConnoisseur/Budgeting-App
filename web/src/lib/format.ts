/** USD formatting helpers — amounts arrive as decimal strings from the API. */

export function formatUsd(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (Number.isNaN(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

export function toMoneyString(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return '0.00'
  return n.toFixed(2)
}

export function parseMoneyInput(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return n.toFixed(2)
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** e.g. "Mar 2027" for a projected savings hit month. */
export function formatYearMonth(
  year: number | null | undefined,
  month: number | null | undefined,
): string | null {
  if (year == null || month == null || month < 1 || month > 12) return null
  return `${MONTH_SHORT[month - 1]} ${year}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
