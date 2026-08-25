/** USD helpers — amounts are decimal strings from the API. */

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

/** Local calendar date (YYYY-MM-DD), not UTC — logging "today" at the register. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftDate(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const dt = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  )
  return todayISO(dt)
}

export function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  return iso === todayISO(now)
}

/**
 * Rewrite loopback hosts so the Android emulator can reach the host machine.
 * Physical devices still need a LAN IP or the production API URL.
 */
export function resolveApiBaseUrl(
  raw: string | undefined,
  os: string,
): string {
  const base = (raw ?? 'https://budgeting-app-m3aj.onrender.com').replace(
    /\/$/,
    '',
  )
  if (
    os === 'android' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
  ) {
    return base.replace(/localhost|127\.0\.0\.1/, '10.0.2.2')
  }
  return base
}
