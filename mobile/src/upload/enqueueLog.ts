import { getToken } from '../storage'
import * as txApi from '../api/transactions'
import { createId, type OutboxItem } from './outbox'
import { enqueueNative, nativeUploadAvailable } from './native'
import { userIdFromToken } from './session'
import type { CategoryKind } from '../types'

export async function enqueueLog(input: {
  kind: CategoryKind
  categoryId: string
  categoryName: string
  amount: string
  date: string
  note: string | null
  withdrawFromCategoryId: string | null
}): Promise<{ mode: 'queued'; items: OutboxItem[] } | { mode: 'direct' }> {
  const token = await getToken()
  const ownerId = token ? userIdFromToken(token) : null
  if (!ownerId) throw new Error('Sign in before logging.')
  const item: OutboxItem = {
    id: createId(),
    owner_id: ownerId,
    kind: input.kind,
    category_id: input.categoryId,
    category_name: input.categoryName,
    amount: input.amount,
    date: input.date,
    note: input.note,
    withdraw_from_category_id: input.withdrawFromCategoryId,
    status: 'pending',
    detail: null,
    created_at: new Date().toISOString(),
  }
  if (nativeUploadAvailable()) {
    return { mode: 'queued', items: await enqueueNative(item) }
  }
  await txApi.createTransaction({
    category_id: item.category_id,
    amount: item.amount,
    date: item.date,
    note: item.note,
    withdraw_from_category_id: item.withdraw_from_category_id,
    client_request_id: item.id,
  })
  return { mode: 'direct' }
}
