import { apiFetch } from './client'
import type {
  CategoryKind,
  IncomeEstimate,
  RecurrenceFrequency,
  RecurringLogResult,
  RecurringPatternSuggestionList,
  RecurringSchedule,
  RecurringScheduleList,
} from '../types/api'

export function listSchedules(params: {
  active_only?: boolean
  kind?: CategoryKind
} = {}) {
  const q = new URLSearchParams()
  if (params.active_only !== undefined) {
    q.set('active_only', String(params.active_only))
  }
  if (params.kind) q.set('kind', params.kind)
  const qs = q.toString()
  return apiFetch<RecurringScheduleList>(
    `/recurring-schedules${qs ? `?${qs}` : ''}`,
  )
}

export function listDue(withinDays = 0) {
  const q = new URLSearchParams()
  if (withinDays > 0) q.set('within_days', String(withinDays))
  const qs = q.toString()
  return apiFetch<RecurringScheduleList>(
    `/recurring-schedules/due${qs ? `?${qs}` : ''}`,
  )
}

export function listSuggestions() {
  return apiFetch<RecurringPatternSuggestionList>(
    '/recurring-schedules/suggestions',
  )
}

export function incomeEstimate(year: number, month: number) {
  const q = new URLSearchParams({
    year: String(year),
    month: String(month),
  })
  return apiFetch<IncomeEstimate>(
    `/recurring-schedules/income-estimate?${q.toString()}`,
  )
}

export function createSchedule(body: {
  category_id: string
  amount: string
  note?: string | null
  frequency: RecurrenceFrequency
  anchor_day: number
  start_date: string
  end_date?: string | null
  active?: boolean
}) {
  return apiFetch<RecurringSchedule>('/recurring-schedules', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateSchedule(
  id: string,
  body: Partial<{
    category_id: string
    amount: string
    note: string | null
    frequency: RecurrenceFrequency
    anchor_day: number
    start_date: string
    end_date: string | null
    next_occurrence: string
    active: boolean
  }>,
) {
  return apiFetch<RecurringSchedule>(`/recurring-schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteSchedule(id: string) {
  return apiFetch<{ detail: string }>(`/recurring-schedules/${id}`, {
    method: 'DELETE',
  })
}

export function logOccurrence(
  id: string,
  body: {
    amount?: string
    date?: string
    note?: string | null
  } = {},
) {
  return apiFetch<RecurringLogResult>(`/recurring-schedules/${id}/log`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function skipOccurrence(id: string) {
  return apiFetch<RecurringSchedule>(`/recurring-schedules/${id}/skip`, {
    method: 'POST',
  })
}
