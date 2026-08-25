import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { ApiError, apiRequest, apiUrl, parseErrorDetail } from './http.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('apiUrl prefixes /api', () => {
  assert.equal(apiUrl('http://localhost:8000', '/auth/login'), 'http://localhost:8000/api/auth/login')
  assert.equal(apiUrl('http://localhost:8000/', '/transactions'), 'http://localhost:8000/api/transactions')
})

test('parseErrorDetail reads FastAPI string and array details', () => {
  assert.equal(parseErrorDetail({ detail: 'nope' }, 'fallback'), 'nope')
  assert.equal(
    parseErrorDetail({ detail: [{ msg: 'amount must not be zero' }] }, 'fallback'),
    'amount must not be zero',
  )
})

test('apiRequest sends JSON and bearer token', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const body = await apiRequest<{ access_token: string }>('/auth/login', {
    baseUrl: 'http://localhost:8000',
    method: 'POST',
    token: 'secret',
    body: JSON.stringify({ username: 'ada', password: 'password123' }),
  })
  assert.equal(body.access_token, 'tok')
  assert.equal(calls[0]?.url, 'http://localhost:8000/api/auth/login')
  const headers = new Headers(calls[0]?.init.headers)
  assert.equal(headers.get('Authorization'), 'Bearer secret')
  assert.equal(headers.get('Content-Type'), 'application/json')
})

test('apiRequest maps HTTP errors to ApiError', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: 'Invalid credentials' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })

  await assert.rejects(
    () =>
      apiRequest('/auth/login', {
        baseUrl: 'http://localhost:8000',
        method: 'POST',
        body: '{}',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 401)
      assert.equal(err.detail, 'Invalid credentials')
      return true
    },
  )
})

test('apiRequest surfaces unreachable API', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(
    () => apiRequest('/auth/me', { baseUrl: 'http://localhost:8000' }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 0)
      assert.match(err.detail, /Cannot reach API/)
      return true
    },
  )
})
