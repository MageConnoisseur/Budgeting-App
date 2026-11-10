import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authFromLaunchUrl, kindFromLaunchUrl } from './launch.ts'

test('kindFromLaunchUrl reads widget deep links', () => {
  assert.equal(kindFromLaunchUrl('setaside://log/income'), 'income')
  assert.equal(kindFromLaunchUrl('setaside://log/expense'), 'expense')
  assert.equal(kindFromLaunchUrl('setaside://log/savings'), 'savings')
  assert.equal(kindFromLaunchUrl('setaside://log/expense/'), 'expense')
  assert.equal(kindFromLaunchUrl('setaside://log/nope'), null)
  assert.equal(kindFromLaunchUrl(null), null)
  assert.equal(kindFromLaunchUrl('setaside://auth?token=abc'), null)
})

test('authFromLaunchUrl reads the Google handoff and ignores log links', () => {
  assert.deepEqual(authFromLaunchUrl('setaside://auth?token=abc.def'), {
    token: 'abc.def',
    error: null,
  })
  assert.deepEqual(
    authFromLaunchUrl(
      'setaside://auth?oauth_error=denied&detail=Google%20sign-in%20was%20canceled',
    ),
    { token: null, error: 'Google sign-in was canceled' },
  )
  assert.equal(authFromLaunchUrl('setaside://log/expense'), null)
  assert.equal(authFromLaunchUrl('https://setasideplan.com/auth?token=abc'), null)
  assert.equal(authFromLaunchUrl(null), null)
})
