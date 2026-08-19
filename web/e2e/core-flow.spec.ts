import { expect, test, type Page } from '@playwright/test'
import { nearListEnd, virtualWindow } from '../src/lib/virtualWindow'
import { ensureLayout, visiblePlaced } from '../src/dashboard/grid'
import type { DashboardWidget } from '../src/types/api'

function uniqueUser() {
  const stamp = Date.now().toString(36)
  return {
    username: `e2e_${stamp}`,
    email: `e2e_${stamp}@setaside.test`,
    password: 'setasidepass123',
  }
}

async function register(page: Page) {
  const user = uniqueUser()
  await page.goto('/register')
  await page.getByRole('heading', { name: 'Create account' }).waitFor()
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Confirm email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Setaside').first()).toBeVisible()
  return user
}

test.describe('virtual window math', () => {
  test('keeps DOM work bounded as history grows', () => {
    const w = virtualWindow({
      scrollTop: 4800,
      viewportHeight: 400,
      rowCount: 8000,
      rowHeight: 48,
      overscan: 4,
    })
    expect(w.totalHeight).toBe(8000 * 48)
    expect(w.end - w.start).toBeLessThan(20)
    expect(w.start).toBeGreaterThan(90)
    expect(
      nearListEnd({
        scrollTop: w.totalHeight - 100,
        viewportHeight: 400,
        totalHeight: w.totalHeight,
      }),
    ).toBe(true)
  })
})

test.describe('core smoke: auth → categories → budget → tracker → dashboard', () => {
  test('new user can plan, log, and see plan vs actual', async ({ page }) => {
    await register(page)

    await page.getByRole('link', { name: 'Categories' }).click()
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
    await page.getByLabel('Kind').selectOption('expense')
    await page.getByLabel('Name').fill('Groceries')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('cell', { name: 'Groceries' })).toBeVisible()

    await page.getByRole('link', { name: 'Budget' }).click()
    await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible()
    await page.getByLabel('Groceries planned amount').fill('400')
    await page.getByRole('button', { name: 'Save month' }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.getByRole('link', { name: 'Tracker' }).click()
    await expect(page.getByRole('heading', { name: 'Tracker' })).toBeVisible()
    const logForm = page.locator('form').filter({ hasText: 'Log transaction' })
    await logForm.getByLabel('Kind').selectOption('expense')
    await logForm.getByLabel('Category').selectOption({ label: 'Groceries' })
    await logForm.getByLabel('Amount').fill('12.50')
    await logForm.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Groceries' })).toBeVisible()
    await expect(page.getByText('$12.50').first()).toBeVisible()
    await page.getByRole('button', { name: 'Not now' }).click()

    await page.getByRole('link', { name: 'Budget' }).click()
    await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible()
    const groceryFill = page.locator('.budget-fill').filter({
      has: page.getByLabel(/Groceries planned amount/),
    })
    await expect(groceryFill).toHaveAttribute('data-fill-pct', '3')
    await expect(groceryFill).toHaveAttribute('data-fill-over', 'false')

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible()
    await expect(page.getByText('$400.00').first()).toBeVisible()
    await expect(page.getByText('$12.50').first()).toBeVisible()
    await expect(page.getByText('Groceries').first()).toBeVisible()
  })
})

test.describe('dashboard grid layout', () => {
  test('packs progress widgets side by side on a 12-column grid', () => {
    const widgets: DashboardWidget[] = [
      {
        id: 'income-progress',
        type: 'kind_progress',
        title: 'Income',
        order: 1,
        config: { kind: 'income' },
      },
      {
        id: 'expense-progress',
        type: 'kind_progress',
        title: 'Expenses',
        order: 2,
        config: { kind: 'expense' },
      },
      {
        id: 'savings-progress',
        type: 'kind_progress',
        title: 'Savings',
        order: 3,
        config: { kind: 'savings' },
      },
    ]
    const placed = visiblePlaced(ensureLayout(widgets, 'monthly'))
    expect(placed).toHaveLength(3)
    expect(placed.map((w) => w.rect)).toEqual([
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 4, y: 0, w: 4, h: 4 },
      { x: 8, y: 0, w: 4, h: 4 },
    ])
  })

  test('user can hide a widget and save a named view', async ({ page }) => {
    await register(page)
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Customize layout' }).click()
    await page.getByRole('checkbox', { name: /Expenses/ }).uncheck()
    await expect(
      page.getByRole('heading', { name: 'Expenses', exact: true }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Save as view' }).click()
    await page.getByPlaceholder('Spending focus').fill('Lean month')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved view “Lean month”')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('View: Lean month')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Expenses', exact: true }),
    ).toHaveCount(0)
  })
})
