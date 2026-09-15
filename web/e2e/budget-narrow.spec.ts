import { expect, test, type Page } from '@playwright/test'

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
}

async function addCategory(page: Page, kind: string, name: string) {
  await page.getByRole('link', { name: 'Categories' }).click()
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
  await page.getByLabel('Kind').selectOption(kind)
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name })).toBeVisible()
}

test.describe('budget layout on a phone-sized screen', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('monthly amounts stay beside category names', async ({ page }) => {
    await register(page)
    await addCategory(page, 'expense', 'Groceries')
    await addCategory(page, 'savings', 'Emergency')

    await page.getByRole('link', { name: 'Budget' }).click()
    await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible()

    const line = page.locator('.budget-line').filter({ hasText: 'Groceries' })
    const nameBox = await line.locator('.budget-line-name').boundingBox()
    const amountBox = await line.locator('.budget-fill').boundingBox()
    expect(nameBox).toBeTruthy()
    expect(amountBox).toBeTruthy()
    const nameMid = nameBox!.y + nameBox!.height / 2
    const amountMid = amountBox!.y + amountBox!.height / 2
    expect(Math.abs(nameMid - amountMid)).toBeLessThan(16)
    expect(amountBox!.x).toBeGreaterThan(nameBox!.x)
    expect(amountBox!.width).toBeGreaterThanOrEqual(96)

    const payFrom = line.locator('.pay-from')
    const payBox = await payFrom.boundingBox()
    expect(payBox).toBeTruthy()
    expect(payBox!.y).toBeGreaterThan(amountBox!.y + amountBox!.height - 4)
  })

  test('annual grid stays readable by scrolling sideways', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await register(page)
    await addCategory(page, 'expense', 'Groceries')

    await page.getByRole('link', { name: 'Budget' }).click()
    await page.getByRole('button', { name: 'Annual' }).click()
    await expect(page.locator('.annual-grid')).toBeVisible()
    await expect(page.getByText(/Swipe or scroll sideways/)).toBeVisible()
    await page.locator('.annual-wrap').scrollIntoViewIfNeeded()

    const wrap = page.locator('.annual-wrap')
    const scroll = await wrap.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth + 80)

    const monthHeader = page.locator('.annual-grid thead .annual-month-col').first()
    const monthBox = await monthHeader.boundingBox()
    expect(monthBox).toBeTruthy()
    expect(monthBox!.width).toBeGreaterThanOrEqual(70)

    const catHeader = page.locator('.annual-grid thead .annual-cat-col')
    await expect(catHeader).toBeInViewport()

    await page.getByRole('button', { name: 'Show Jan in the year grid' }).click()
    const atJan = await wrap.evaluate((el) => el.scrollLeft)
    await page.getByRole('button', { name: 'Show Dec in the year grid' }).click()
    await expect
      .poll(async () => wrap.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(atJan + 80)
    await expect(catHeader).toBeInViewport()
  })
})
