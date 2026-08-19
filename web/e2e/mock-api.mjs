#!/usr/bin/env node
/**
 * In-memory API used by Playwright smoke tests so the web app can be exercised
 * without Postgres. Shapes match the FastAPI JSON the pages already consume.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.E2E_API_PORT || 8000)

/** @typedef {{ id: string, username: string, email: string, password: string, preferred_budget_view: string, preferred_dashboard_view: string, created_at: string }} User */
/** @typedef {{ id: string, userId: string, kind: string, name: string, archived: boolean, sort_order: number, target_amount: string | null, created_at: string, updated_at: string }} Category */
/** @typedef {{ id: string, category_id: string, planned_amount: string, funded_by_category_id: string | null }} Line */
/** @typedef {{ id: string, year: number, month: number, lines: Line[], created_at: string, updated_at: string }} Month */
/** @typedef {{ id: string, userId: string, category_id: string, amount: string, date: string, note: string | null, created_at: string, pair_id: string | null }} Tx */

const users = new Map()
const tokens = new Map()
const categories = new Map()
/** @type {Map<string, Month>} key = userId:year:month */
const months = new Map()
const transactions = new Map()

function nowIso() {
  return new Date().toISOString()
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    has_password: true,
    oauth_providers: [],
    preferred_budget_view: user.preferred_budget_view,
    preferred_dashboard_view: user.preferred_dashboard_view,
    created_at: user.created_at,
  }
}

function publicCategory(c) {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    archived: c.archived,
    sort_order: c.sort_order,
    target_amount: c.target_amount,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

function authUser(req) {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return null
  const userId = tokens.get(match[1])
  if (!userId) return null
  return users.get(userId) || null
}

function monthKey(userId, year, month) {
  return `${userId}:${year}:${month}`
}

function ensureMonth(userId, year, month) {
  const key = monthKey(userId, year, month)
  let row = months.get(key)
  if (!row) {
    row = {
      id: randomUUID(),
      year,
      month,
      lines: [],
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    months.set(key, row)
  }
  return row
}

function userCategories(userId, includeArchived = false) {
  return [...categories.values()].filter(
    (c) => c.userId === userId && (includeArchived || !c.archived),
  )
}

function emptyLeftover() {
  return {
    income: '0.00',
    expense_from_income: '0.00',
    expense_from_savings: '0.00',
    savings_contributions: '0.00',
    leftover: '0.00',
  }
}

function kindTotals(planned, actual) {
  const remaining = (Number(planned) - Number(actual)).toFixed(2)
  return {
    planned,
    actual,
    remaining,
    over_budget: Number(actual) > Number(planned) && Number(planned) >= 0,
  }
}

function emptyPace() {
  const today = new Date().toISOString().slice(0, 10)
  return {
    as_of: today,
    window_start: today,
    window_end: today,
    window_days: 0,
    income: '0.00',
    expense: '0.00',
    savings: '0.00',
    outflow: '0.00',
    net: '0.00',
    average_daily_income: '0.00',
    expected_income: '0.00',
    income_lookback_start: null,
    income_lookback_end: null,
    income_lookback_days: 0,
    tracking_started_on: null,
    overspending: false,
    has_data: false,
    days: [],
  }
}

function emptyCoach(year, month) {
  return {
    headline: 'Add a few categories to get plan advice.',
    tone: 'getting_started',
    leftover_planned: '0.00',
    leftover_actual: '0.00',
    apply_year: year,
    apply_month: month,
    tips: [],
  }
}

function money(n) {
  return Number(n || 0).toFixed(2)
}

function dashboardFor(user, year, month) {
  const cats = userCategories(user.id, true)
  const plan = months.get(monthKey(user.id, year, month))
  const txs = [...transactions.values()].filter((t) => {
    if (t.userId !== user.id) return false
    const [y, m] = t.date.split('-').map(Number)
    return y === year && m === month
  })
  const catById = new Map(cats.map((c) => [c.id, c]))
  const plannedByCat = new Map(
    (plan?.lines || []).map((l) => [l.category_id, l.planned_amount]),
  )
  const actualByCat = new Map()
  for (const t of txs) {
    actualByCat.set(t.category_id, Number(actualByCat.get(t.category_id) || 0) + Number(t.amount))
  }

  const categoriesOut = cats.map((c) => {
    const planned = money(plannedByCat.get(c.id) || 0)
    const actual = money(actualByCat.get(c.id) || 0)
    return {
      category_id: c.id,
      category_name: c.name,
      kind: c.kind,
      planned,
      actual,
      remaining: money(Number(planned) - Number(actual)),
      over_budget: Number(actual) > Number(planned),
    }
  })

  const sumKind = (kind, field) =>
    money(
      categoriesOut
        .filter((c) => c.kind === kind)
        .reduce((s, c) => s + Number(c[field]), 0),
    )

  const income = kindTotals(sumKind('income', 'planned'), sumKind('income', 'actual'))
  const expense = kindTotals(sumKind('expense', 'planned'), sumKind('expense', 'actual'))
  const savings = kindTotals(sumKind('savings', 'planned'), sumKind('savings', 'actual'))
  const leftover = {
    income: income.planned,
    expense_from_income: expense.planned,
    expense_from_savings: '0.00',
    savings_contributions: savings.planned,
    leftover: money(Number(income.planned) - Number(expense.planned) - Number(savings.planned)),
  }
  const leftoverActual = {
    income: income.actual,
    expense_from_income: expense.actual,
    expense_from_savings: '0.00',
    savings_contributions: savings.actual,
    leftover: money(Number(income.actual) - Number(expense.actual) - Number(savings.actual)),
  }

  return {
    year,
    month,
    income,
    expense,
    savings,
    leftover_planned: leftover,
    leftover_actual: leftoverActual,
    categories: categoriesOut,
    savings_buckets: [],
    spending_pace: emptyPace(),
    coach: emptyCoach(year, month),
  }
}

function defaultLayout(viewMode) {
  const monthly = [
    { id: 'budget-coach', type: 'budget_coach', title: 'Budget coach', order: -1, config: {} },
    { id: 'spending-pace', type: 'spending_pace', title: 'Spending pace', order: 0, config: {} },
    { id: 'income-progress', type: 'kind_progress', title: 'Income', order: 1, config: { kind: 'income' } },
    { id: 'expense-progress', type: 'kind_progress', title: 'Expenses', order: 2, config: { kind: 'expense' } },
    { id: 'savings-progress', type: 'kind_progress', title: 'Savings', order: 3, config: { kind: 'savings' } },
    { id: 'category-breakdown', type: 'category_breakdown', title: 'Categories', order: 6, config: {} },
  ]
  const annual = [
    { id: 'year-totals', type: 'year_totals', title: 'Year totals', order: 1, config: {} },
    { id: 'month-trends', type: 'month_trends', title: 'Month-to-month trends', order: 2, config: {} },
  ]
  return {
    view_mode: viewMode,
    widgets: viewMode === 'annual' ? annual : monthly,
  }
}

function txOut(t) {
  const cat = categories.get(t.category_id)
  return {
    id: t.id,
    category_id: t.category_id,
    amount: t.amount,
    date: t.date,
    note: t.note,
    pair_id: t.pair_id,
    created_at: t.created_at,
    updated_at: t.created_at,
    category: cat ? publicCategory(cat) : null,
  }
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type,authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    })
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const method = req.method || 'GET'

  if (path === '/health' && method === 'GET') {
    json(res, 200, { status: 'ok' })
    return
  }

  if (path === '/api/auth/oauth/providers' && method === 'GET') {
    json(res, 200, [])
    return
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const body = await readBody(req)
    const username = String(body.username || '').trim()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (username.length < 3 || password.length < 8 || !email.includes('@')) {
      json(res, 422, { detail: 'Invalid registration' })
      return
    }
    const user = {
      id: randomUUID(),
      username,
      email,
      password,
      preferred_budget_view: 'monthly',
      preferred_dashboard_view: 'monthly',
      created_at: nowIso(),
    }
    users.set(user.id, user)
    const token = randomUUID()
    tokens.set(token, user.id)
    json(res, 201, { access_token: token, token_type: 'bearer' })
    return
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req)
    const ident = String(body.username || '').trim()
    const password = String(body.password || '')
    const user = [...users.values()].find(
      (u) => (u.username === ident || u.email === ident) && u.password === password,
    )
    if (!user) {
      json(res, 401, { detail: 'Invalid credentials' })
      return
    }
    const token = randomUUID()
    tokens.set(token, user.id)
    json(res, 200, { access_token: token, token_type: 'bearer' })
    return
  }

  const user = authUser(req)
  if (!user) {
    json(res, 401, { detail: 'Not authenticated' })
    return
  }

  if (path === '/api/auth/me' && method === 'GET') {
    json(res, 200, publicUser(user))
    return
  }

  if (path === '/api/auth/me/preferences' && method === 'PATCH') {
    const body = await readBody(req)
    if (body.preferred_budget_view) user.preferred_budget_view = body.preferred_budget_view
    if (body.preferred_dashboard_view) {
      user.preferred_dashboard_view = body.preferred_dashboard_view
    }
    json(res, 200, publicUser(user))
    return
  }

  if (path === '/api/categories' && method === 'GET') {
    const includeArchived = url.searchParams.get('include_archived') === 'true'
    json(res, 200, userCategories(user.id, includeArchived).map(publicCategory))
    return
  }

  if (path === '/api/categories' && method === 'POST') {
    const body = await readBody(req)
    const row = {
      id: randomUUID(),
      userId: user.id,
      kind: body.kind || 'expense',
      name: String(body.name || '').trim(),
      archived: false,
      sort_order: Number(body.sort_order || 0),
      target_amount: body.target_amount ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    categories.set(row.id, row)
    json(res, 201, publicCategory(row))
    return
  }

  const monthMatch = /^\/api\/budgets\/months\/(\d+)\/(\d+)$/.exec(path)
  if (monthMatch && method === 'GET') {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    const row = ensureMonth(user.id, year, month)
    json(res, 200, { ...row, seeded_from: null })
    return
  }
  if (monthMatch && method === 'PUT') {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    const body = await readBody(req)
    const row = ensureMonth(user.id, year, month)
    row.lines = (body.lines || []).map((l) => ({
      id: randomUUID(),
      category_id: l.category_id,
      planned_amount: money(l.planned_amount),
      funded_by_category_id: l.funded_by_category_id || null,
    }))
    row.updated_at = nowIso()
    json(res, 200, { ...row, seeded_from: null })
    return
  }

  const fundingMatch =
    /^\/api\/budgets\/months\/(\d+)\/(\d+)\/expense-funding\/([^/]+)$/.exec(path)
  if (fundingMatch && method === 'GET') {
    json(res, 200, {
      category_id: fundingMatch[3],
      funded_by_category_id: null,
      funded_by_category_name: null,
    })
    return
  }

  const annualMatch = /^\/api\/budgets\/annual\/(\d+)$/.exec(path)
  if (annualMatch && method === 'GET') {
    const year = Number(annualMatch[1])
    const owned = [...months.entries()]
      .filter(([k]) => k.startsWith(`${user.id}:${year}:`))
      .map(([, m]) => m)
    json(res, 200, { year, months: owned })
    return
  }

  if (path === '/api/budgets/templates' && method === 'GET') {
    json(res, 200, [])
    return
  }

  if (path === '/api/transactions' && method === 'GET') {
    const items = [...transactions.values()]
      .filter((t) => t.userId === user.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(txOut)
    const limit = Number(url.searchParams.get('limit') || 50)
    const offset = Number(url.searchParams.get('offset') || 0)
    json(res, 200, {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    })
    return
  }

  if (path === '/api/transactions' && method === 'POST') {
    const body = await readBody(req)
    const row = {
      id: randomUUID(),
      userId: user.id,
      category_id: body.category_id,
      amount: money(body.amount),
      date: body.date,
      note: body.note || null,
      pair_id: null,
      created_at: nowIso(),
    }
    transactions.set(row.id, row)
    json(res, 201, txOut(row))
    return
  }

  if (path === '/api/transactions/note-suggestions' && method === 'GET') {
    json(res, 200, { items: [] })
    return
  }

  if (path.startsWith('/api/recurring-schedules/income-estimate') && method === 'GET') {
    const year = Number(url.searchParams.get('year'))
    const month = Number(url.searchParams.get('month'))
    json(res, 200, {
      year,
      month,
      estimated_total: '0.00',
      planned_total: '0.00',
      actual_to_date: '0.00',
      categories: [],
      based_on_schedules: 0,
      based_on_history: 0,
      message: 'No income history yet.',
    })
    return
  }

  if (path.startsWith('/api/recurring-schedules') && method === 'GET') {
    json(res, 200, { items: [] })
    return
  }

  const layoutMatch = /^\/api\/dashboard\/layout\/(monthly|annual)$/.exec(path)
  if (layoutMatch && method === 'GET') {
    json(res, 200, defaultLayout(layoutMatch[1]))
    return
  }
  if (layoutMatch && method === 'PUT') {
    const body = await readBody(req)
    json(res, 200, { view_mode: layoutMatch[1], widgets: body.widgets || [] })
    return
  }

  const monthlyDash = /^\/api\/dashboard\/monthly\/(\d+)\/(\d+)$/.exec(path)
  if (monthlyDash && method === 'GET') {
    json(res, 200, dashboardFor(user, Number(monthlyDash[1]), Number(monthlyDash[2])))
    return
  }

  const annualDash = /^\/api\/dashboard\/annual\/(\d+)$/.exec(path)
  if (annualDash && method === 'GET') {
    const year = Number(annualDash[1])
    const monthly = dashboardFor(user, year, 1)
    json(res, 200, {
      year,
      months: Array.from({ length: 12 }, (_, i) => ({
        year,
        month: i + 1,
        income_planned: '0.00',
        income_actual: '0.00',
        expense_planned: i + 1 === new Date().getMonth() + 1 ? monthly.expense.planned : '0.00',
        expense_actual: i + 1 === new Date().getMonth() + 1 ? monthly.expense.actual : '0.00',
        savings_planned: '0.00',
        savings_actual: '0.00',
      })),
      category_trends: [],
      plan_suggestions: [],
      category_health: [],
      income: monthly.income,
      expense: monthly.expense,
      savings: monthly.savings,
      leftover_planned: emptyLeftover(),
      leftover_actual: emptyLeftover(),
      savings_buckets: [],
      spending_pace: emptyPace(),
      coach: emptyCoach(year, 1),
    })
    return
  }

  if (path === '/api/dashboard/savings-balances' && method === 'GET') {
    json(res, 200, [])
    return
  }

  json(res, 404, { detail: `No mock for ${method} ${path}` })
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    json(res, 500, { detail: String(err) })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`E2E mock API on http://127.0.0.1:${PORT}`)
})
