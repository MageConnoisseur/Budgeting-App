import { apiBaseUrl } from '../api/config'
import {
  loadSetasideUpload,
  type LogLaunchEvent,
} from '../../modules/setaside-upload'
import type { Category } from '../types'
import { userIdFromToken } from './session'
import type { OutboxItem } from './outbox'

export function nativeUploadAvailable(): boolean {
  return loadSetasideUpload() != null
}

export async function syncNativeSession(token: string | null): Promise<void> {
  const native = loadSetasideUpload()
  if (!native) return
  if (!token) {
    await native.setSession('', '', '')
    return
  }
  await native.setSession(token, userIdFromToken(token) ?? '', apiBaseUrl())
}

export function parseOutbox(json: string): OutboxItem[] {
  try {
    const parsed = JSON.parse(json) as { items?: OutboxItem[] }
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

export async function readOutbox(): Promise<OutboxItem[]> {
  const native = loadSetasideUpload()
  if (!native) return []
  return parseOutbox(await native.listOutbox())
}

export async function enqueueNative(item: OutboxItem): Promise<OutboxItem[]> {
  const native = loadSetasideUpload()
  if (!native) throw new Error('Background upload is not available in this build.')
  return parseOutbox(await native.enqueue(JSON.stringify(item)))
}

export async function removeQueued(id: string): Promise<OutboxItem[]> {
  const native = loadSetasideUpload()
  if (!native) return []
  return parseOutbox(await native.remove(id))
}

export async function retryNeedsAuth(userId: string): Promise<OutboxItem[]> {
  const native = loadSetasideUpload()
  if (!native) return []
  return parseOutbox(await native.retryNeedsAuth(userId))
}

export function getPendingLaunch(): LogLaunchEvent | null {
  const native = loadSetasideUpload()
  if (!native) return null
  const launch = native.getPendingLaunch()
  if (!launch?.seq) return null
  return launch
}

export function addLogLaunchListener(
  listener: (event: LogLaunchEvent) => void,
): { remove(): void } {
  const native = loadSetasideUpload()
  if (!native) return { remove() {} }
  return native.addListener('onLogLaunch', listener)
}

export async function readCategoryCache(): Promise<Category[] | null> {
  const native = loadSetasideUpload()
  if (!native) return null
  const text = await native.readCache('categories')
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as Category[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function writeCategoryCache(categories: Category[]): Promise<void> {
  const native = loadSetasideUpload()
  if (!native) return
  await native.writeCache('categories', JSON.stringify(categories))
}

export interface FundingChoice {
  id: string
  name: string
}

function fundingKey(year: number, month: number, categoryId: string): string {
  return `${year}-${month}-${categoryId}`
}

async function readFundingMap(): Promise<Record<string, FundingChoice | null>> {
  const native = loadSetasideUpload()
  if (!native) return {}
  const text = await native.readCache('funding')
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as Record<string, FundingChoice | null>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function readFundingEntry(
  year: number,
  month: number,
  categoryId: string,
): Promise<FundingChoice | null | undefined> {
  const map = await readFundingMap()
  const key = fundingKey(year, month, categoryId)
  if (!Object.prototype.hasOwnProperty.call(map, key)) return undefined
  return map[key]
}

export async function writeFundingEntry(
  year: number,
  month: number,
  categoryId: string,
  value: FundingChoice | null,
): Promise<void> {
  const native = loadSetasideUpload()
  if (!native) return
  const map = await readFundingMap()
  map[fundingKey(year, month, categoryId)] = value
  await native.writeCache('funding', JSON.stringify(map))
}
