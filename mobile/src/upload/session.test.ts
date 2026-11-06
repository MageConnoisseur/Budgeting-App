import assert from 'node:assert/strict'
import { test } from 'node:test'
import { userIdFromToken } from './session.ts'

test('userIdFromToken reads the JWT subject', () => {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: 1 }),
  ).toString('base64url')
  assert.equal(userIdFromToken(`header.${payload}.sig`), 'user-1')
  assert.equal(userIdFromToken('not-a-jwt'), null)
})
