import { apiFetch } from './client'
import type {
  AnnualDashboard,
  DashboardLayout,
  DashboardLayoutPreset,
  DashboardWidget,
  MonthlyDashboard,
  SavingsBucket,
  ViewMode,
} from '../types/api'

export function getMonthlyDashboard(year: number, month: number) {
  return apiFetch<MonthlyDashboard>(`/dashboard/monthly/${year}/${month}`)
}

export function getAnnualDashboard(year: number) {
  return apiFetch<AnnualDashboard>(`/dashboard/annual/${year}`)
}

export function getSavingsBalances() {
  return apiFetch<SavingsBucket[]>('/dashboard/savings-balances')
}

export function getDashboardLayout(viewMode: ViewMode) {
  return apiFetch<DashboardLayout>(`/dashboard/layout/${viewMode}`)
}

export function putDashboardLayout(
  viewMode: ViewMode,
  widgets: DashboardWidget[],
  extras?: {
    presets?: DashboardLayoutPreset[]
    active_preset_id?: string | null
  },
) {
  return apiFetch<DashboardLayout>(`/dashboard/layout/${viewMode}`, {
    method: 'PUT',
    body: JSON.stringify({
      widgets,
      presets: extras?.presets,
      active_preset_id: extras?.active_preset_id ?? null,
    }),
  })
}
