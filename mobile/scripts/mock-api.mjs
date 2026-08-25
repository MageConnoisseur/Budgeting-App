/**
 * Tiny in-memory API for Expo web / client checks.
 * Mirrors the expense-logging subset of the FastAPI routes.
 *
 *   node scripts/mock-api.mjs
 */
import http from 'node:http'

const PORT = Number(process.env.MOCK_API_PORT || 8000)
const token = 'mock-token'
const user = { id: 'u1', username: 'demo', email: 'demo@setaside.test' }
const categories = [
  {
    id: 'c-groc',
    kind: 'expense',
    name: 'Groceries',
    archived: false,
    sort_order: 0,
  },
  {
    id: 'c-dine',
    kind: 'expense',
    name: 'Dining',
    archived: false,
    sort_order: 1,
  },
]
/** @type {Array<Record<string, unknown>>} */
const transactions = []

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function authOk(req) {
  return (req.headers.authorization || '') === `Bearer ${token}`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  if (req.method === 'OPTIONS') {
    json(res, 204)
    return
  }
  if (path === '/health') {
    json(res, 200, { status: 'ok' })
    return
  }
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body.username || !body.password || String(body.password).length < 8) {
      json(res, 401, { detail: 'Invalid credentials' })
      return
    }
    json(res, 200, { access_token: token, token_type: 'bearer' })
    return
  }
  if (!authOk(req)) {
    json(res, 401, { detail: 'Not authenticated' })
    return
  }
  if (path === '/api/auth/me') {
    json(res, 200, user)
    return
  }
  if (path === '/api/categories') {
    json(res, 200, categories)
    return
  }
  if (path.startsWith('/api/budgets/months/') && path.includes('expense-funding')) {
    json(res, 200, {
      category_id: 'c-groc',
      funded_by_category_id: null,
      funded_by_category_name: null,
    })
    return
  }
  if (path === '/api/transactions/note-suggestions') {
    json(res, 200, {
      items: [
        {
          note: 'Costco',
          use_count: 3,
          last_date: '2026-08-20',
          last_amount: '42.00',
          last_category_id: 'c-groc',
          last_category_name: 'Groceries',
          last_kind: 'expense',
        },
      ],
    })
    return
  }
  if (path === '/api/transactions' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const items = transactions.filter((t) => {
      if (!q) return true
      const cat = categories.find((c) => c.id === t.category_id)
      return (
        String(t.note || '').toLowerCase().includes(q) ||
        String(cat?.name || '').toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      )
    })
    json(res, 200, { items, total: items.length, limit: 40, offset: 0 })
    return
  }
  if (path === '/api/transactions' && req.method === 'POST') {
    const body = await readBody(req)
    const cat = categories.find((c) => c.id === body.category_id)
    const row = {
      id: `t-${transactions.length + 1}`,
      category_id: body.category_id,
      amount: body.amount,
      date: body.date,
      note: body.note ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      category: cat,
    }
    transactions.unshift(row)
    json(res, 201, row)
    return
  }
  if (path.startsWith('/api/transactions/') && req.method === 'PATCH') {
    const id = path.split('/').pop()
    const body = await readBody(req)
    const row = transactions.find((t) => t.id === id)
    if (!row) {
      json(res, 404, { detail: 'Transaction not found' })
      return
    }
    Object.assign(row, body, { updated_at: new Date().toISOString() })
    if (body.category_id) {
      row.category = categories.find((c) => c.id === body.category_id)
    }
    json(res, 200, row)
    return
  }
  if (path.startsWith('/api/transactions/') && req.method === 'DELETE') {
    const id = path.split('/').pop()
    const idx = transactions.findIndex((t) => t.id === id)
    if (idx >= 0) transactions.splice(idx, 1)
    json(res, 200, { detail: 'Transaction deleted' })
    return
  }
  json(res, 404, { detail: 'Not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock Setaside API on http://127.0.0.1:${PORT}`)
})
