import { apiFetch } from './client'
import type { MobileGlance } from '../types'

export function getGlance(year: number, month: number) {
  return apiFetch<MobileGlance>(`/mobile/glance?year=${year}&month=${month}`)
}
