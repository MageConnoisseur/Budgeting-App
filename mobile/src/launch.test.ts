import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kindFromLaunchUrl } from './launch.ts'

test('kindFromLaunchUrl reads widget deep links', () => {
  assert.equal(kindFromLaunchUrl('setaside://log/income'), 'income')
  assert.equal(kindFromLaunchUrl('setaside://log/expense'), 'expense')
  assert.equal(kindFromLaunchUrl('setaside://log/savings'), 'savings')
  assert.equal(kindFromLaunchUrl('setaside://log/expense/'), 'expense')
  assert.equal(kindFromLaunchUrl('setaside://log/nope'), null)
  assert.equal(kindFromLaunchUrl(null), null)
})
