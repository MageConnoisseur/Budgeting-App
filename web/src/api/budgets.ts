import { apiFetch } from './client'
import type { AnnualBudget, BudgetMonth, BudgetTemplate, YearActuals } from '../types/api'

export function getBudgetMonth(year: number, month: number, seed = true) {
  return apiFetch<BudgetMonth>(
    `/budgets/months/${year}/${month}?seed=${seed ? 'true' : 'false'}`,
  )
}

export function upsertBudgetMonth(
  year: number,
  month: number,
  body: {
    lines: {
      category_id: string
      planned_amount: string
      funded_by_category_id?: string | null
    }[]
    replace_all?: boolean
  },
) {
  return apiFetch<BudgetMonth>(`/budgets/months/${year}/${month}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function getAnnualBudget(year: number) {
  return apiFetch<AnnualBudget>(`/budgets/annual/${year}`)
}

export function getYearActuals(year: number) {
  return apiFetch<YearActuals>(`/budgets/actuals/${year}`)
}

export function upsertAnnualCell(body: {
  year: number
  month: number
  category_id: string
  planned_amount: string
  funded_by_category_id?: string | null
}) {
  return apiFetch<BudgetMonth>('/budgets/annual/cell', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function copyFromMonth(
  year: number,
  month: number,
  source_year: number,
  source_month: number,
) {
  return apiFetch<BudgetMonth>(`/budgets/months/${year}/${month}/copy-from`, {
    method: 'POST',
    body: JSON.stringify({ source_year, source_month }),
  })
}

export function listTemplates() {
  return apiFetch<BudgetTemplate[]>('/budgets/templates')
}

export function saveTemplate(body: {
  name: string
  year: number
  month: number
}) {
  return apiFetch<BudgetTemplate>('/budgets/templates/save', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function applyTemplate(
  year: number,
  month: number,
  template_id: string,
) {
  return apiFetch<BudgetMonth>(
    `/budgets/months/${year}/${month}/apply-template`,
    {
      method: 'POST',
      body: JSON.stringify({ template_id }),
    },
  )
}

export function deleteTemplate(template_id: string) {
  return apiFetch<{ detail: string }>(`/budgets/templates/${template_id}`, {
    method: 'DELETE',
  })
}

export function getExpenseFunding(
  year: number,
  month: number,
  categoryId: string,
) {
  return apiFetch<{
    category_id: string
    funded_by_category_id: string | null
    funded_by_category_name: string | null
  }>(`/budgets/months/${year}/${month}/expense-funding/${categoryId}`)
}
