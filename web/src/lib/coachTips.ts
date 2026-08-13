import type { CoachTip } from '../types/api'

const STORAGE_KEY = 'coach-tip-dismissals'

type DismissedCoachTip = {
  id: string
  year: number
}

function readAll(): DismissedCoachTip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is DismissedCoachTip =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as DismissedCoachTip).id === 'string' &&
        typeof (row as DismissedCoachTip).year === 'number',
    )
  } catch {
    return []
  }
}

function writeAll(rows: DismissedCoachTip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function coachDismissalKey(id: string, year: number): string {
  return `${id}:${year}`
}

export function loadDismissedCoachTips(): Set<string> {
  return new Set(readAll().map((r) => coachDismissalKey(r.id, r.year)))
}

export function dismissCoachTip(id: string, year: number): Set<string> {
  const rows = readAll().filter((r) => !(r.id === id && r.year === year))
  rows.push({ id, year })
  writeAll(rows)
  return loadDismissedCoachTips()
}

export function visibleCoachTips(
  tips: CoachTip[] | undefined,
  year: number,
  dismissed: Set<string>,
): CoachTip[] {
  if (!tips?.length) return []
  return tips.filter((t) => !dismissed.has(coachDismissalKey(t.id, year)))
}

export function coachTipCanApply(tip: CoachTip): boolean {
  return (
    tip.suggested_planned != null &&
    tip.apply_year != null &&
    tip.apply_month != null &&
    tip.category_id != null
  )
}
