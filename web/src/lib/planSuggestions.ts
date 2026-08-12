import type { PlanSuggestion, PlanSuggestionKind } from '../types/api'

const STORAGE_KEY = 'plan-suggestion-dismissals'

export type DismissedPlanSuggestion = {
  category_id: string
  year: number
  suggestion_kind: PlanSuggestionKind
}

function readAll(): DismissedPlanSuggestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is DismissedPlanSuggestion =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as DismissedPlanSuggestion).category_id === 'string' &&
        typeof (row as DismissedPlanSuggestion).year === 'number' &&
        ((row as DismissedPlanSuggestion).suggestion_kind === 'median_raise' ||
          (row as DismissedPlanSuggestion).suggestion_kind === 'seasonal'),
    )
  } catch {
    return []
  }
}

function writeAll(rows: DismissedPlanSuggestion[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function dismissalKey(
  categoryId: string,
  year: number,
  kind: PlanSuggestionKind,
): string {
  return `${categoryId}:${year}:${kind}`
}

export function loadDismissedPlanSuggestions(): Set<string> {
  return new Set(
    readAll().map((r) => dismissalKey(r.category_id, r.year, r.suggestion_kind)),
  )
}

export function dismissPlanSuggestion(
  categoryId: string,
  year: number,
  kind: PlanSuggestionKind,
): Set<string> {
  const rows = readAll().filter(
    (r) =>
      !(
        r.category_id === categoryId &&
        r.year === year &&
        r.suggestion_kind === kind
      ),
  )
  rows.push({ category_id: categoryId, year, suggestion_kind: kind })
  writeAll(rows)
  return loadDismissedPlanSuggestions()
}

export function visiblePlanSuggestions(
  suggestions: PlanSuggestion[] | undefined,
  year: number,
  dismissed: Set<string>,
): PlanSuggestion[] {
  if (!suggestions?.length) return []
  return suggestions.filter(
    (s) => !dismissed.has(dismissalKey(s.category_id, year, s.suggestion_kind)),
  )
}
