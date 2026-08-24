import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatShortDate,
  formatUsd,
  isToday,
  parseMoneyInput,
  resolveApiBaseUrl,
  shiftDate,
  todayISO,
  toMoneyString,
} from './format.ts'

test('formatUsd formats decimal strings', () => {
  assert.equal(formatUsd('12.5'), '$12.50')
  assert.equal(formatUsd('0'), '$0.00')
})

test('toMoneyString and parseMoneyInput', () => {
  assert.equal(toMoneyString('12.5'), '12.50')
  assert.equal(parseMoneyInput('$12.50'), '12.50')
  assert.equal(parseMoneyInput('abc'), null)
})

test('todayISO uses local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 7, 24, 22, 0, 0)), '2026-08-24')
})

test('shiftDate and isToday', () => {
  assert.equal(shiftDate('2026-08-24', -1), '2026-08-23')
  assert.equal(shiftDate('2026-08-01', -1), '2026-07-31')
  assert.equal(isToday('2026-08-24', new Date(2026, 7, 24)), true)
  assert.equal(formatShortDate('2026-08-24').includes('24'), true)
})

test('resolveApiBaseUrl rewrites Android emulator loopback', () => {
  assert.equal(
    resolveApiBaseUrl('http://localhost:8000', 'android'),
    'http://10.0.2.2:8000',
  )
  assert.equal(
    resolveApiBaseUrl('http://127.0.0.1:8000', 'android'),
    'http://10.0.2.2:8000',
  )
  assert.equal(
    resolveApiBaseUrl('http://localhost:8000', 'ios'),
    'http://localhost:8000',
  )
  assert.equal(
    resolveApiBaseUrl('https://api.example.com', 'android'),
    'https://api.example.com',
  )
})
