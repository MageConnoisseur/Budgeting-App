import type { CategoryKind } from '../types'

export type OutboxStatus = 'pending' | 'needs_auth' | 'failed'

export interface OutboxItem {
  id: string
  owner_id: string
  kind: CategoryKind
  category_id: string
  category_name: string
  amount: string
  date: string
  note: string | null
  withdraw_from_category_id: string | null
  status: OutboxStatus
  detail: string | null
  created_at: string
}

export type UploadResult =
  | { type: 'ok' }
  | { type: 'needs_auth' }
  | { type: 'retry' }
  | { type: 'failed'; detail: string }

export function enqueueOutbox(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  return [item, ...items.filter((existing) => existing.id !== item.id)]
}

export function applyUploadResult(
  items: OutboxItem[],
  id: string,
  result: UploadResult,
): OutboxItem[] {
  if (result.type === 'retry') return items
  if (result.type === 'ok') return items.filter((item) => item.id !== id)
  const status = result.type === 'needs_auth' ? 'needs_auth' : 'failed'
  const detail =
    result.type === 'failed' ? result.detail : 'Sign in to finish uploading'
  return items.map((item) =>
    item.id === id ? { ...item, status, detail } : item,
  )
}

export function requeueNeedsAuth(
  items: OutboxItem[],
  ownerId: string,
): { items: OutboxItem[]; changed: boolean } {
  let changed = false
  const next = items.map((item) => {
    if (item.owner_id !== ownerId || item.status !== 'needs_auth') return item
    changed = true
    return { ...item, status: 'pending' as const, detail: null }
  })
  return { items: next, changed }
}

export function createId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16)
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}
