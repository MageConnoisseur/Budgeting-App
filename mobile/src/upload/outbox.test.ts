import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyUploadResult,
  enqueueOutbox,
  requeueNeedsAuth,
  type OutboxItem,
} from './outbox.ts'

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: 'a',
    owner_id: 'user-1',
    kind: 'expense',
    category_id: 'cat',
    category_name: 'Groceries',
    amount: '12.00',
    date: '2026-11-06',
    note: null,
    withdraw_from_category_id: null,
    status: 'pending',
    detail: null,
    created_at: '2026-11-06T12:00:00.000Z',
    ...overrides,
  }
}

test('enqueueOutbox puts the new entry first and replaces the same id', () => {
  const first = enqueueOutbox([], item())
  const second = enqueueOutbox(first, item({ id: 'b', amount: '3.00' }))
  assert.deepEqual(
    second.map((entry) => entry.id),
    ['b', 'a'],
  )
  const replaced = enqueueOutbox(second, item({ id: 'a', amount: '9.00' }))
  assert.equal(replaced.length, 2)
  assert.equal(replaced[0].amount, '9.00')
})

test('applyUploadResult removes a saved entry', () => {
  const next = applyUploadResult([item()], 'a', { type: 'ok' })
  assert.deepEqual(next, [])
})

test('applyUploadResult keeps a retryable failure pending', () => {
  const start = [item()]
  assert.equal(applyUploadResult(start, 'a', { type: 'retry' }), start)
})

test('applyUploadResult marks sign-in and hard failures', () => {
  const needsAuth = applyUploadResult([item()], 'a', { type: 'needs_auth' })
  assert.equal(needsAuth[0].status, 'needs_auth')
  assert.equal(needsAuth[0].detail, 'Sign in to finish uploading')
  const failed = applyUploadResult([item()], 'a', {
    type: 'failed',
    detail: 'Category not found',
  })
  assert.equal(failed[0].status, 'failed')
  assert.equal(failed[0].detail, 'Category not found')
})

test('requeueNeedsAuth only restarts this user', () => {
  const items = [
    item({ status: 'needs_auth' }),
    item({ id: 'b', owner_id: 'other', status: 'needs_auth' }),
    item({ id: 'c', status: 'failed' }),
  ]
  const result = requeueNeedsAuth(items, 'user-1')
  assert.equal(result.changed, true)
  assert.equal(result.items[0].status, 'pending')
  assert.equal(result.items[1].status, 'needs_auth')
  assert.equal(result.items[2].status, 'failed')
})
