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

test('category kind stays selected, and savings can be scheduled', async ({
  page,
}) => {
  await register(page)

  await page.getByRole('link', { name: 'Categories' }).click()
  await page.getByLabel('Kind').selectOption('income')
  await page.getByLabel('Name').fill('Paycheck')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name: 'Paycheck' })).toBeVisible()
  await expect(page.getByLabel('Kind')).toHaveValue('income')

  await page.getByLabel('Name').fill('Side gig')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name: 'Side gig' })).toBeVisible()
  await expect(page.getByLabel('Kind')).toHaveValue('income')

  await page.getByLabel('Kind').selectOption('savings')
  await page.getByLabel('Savings type').selectOption('allocation')
  await page.getByLabel('Name').fill('Extra loan')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name: 'Extra loan' })).toBeVisible()
  await expect(page.getByLabel('Kind')).toHaveValue('savings')
  await expect(page.getByLabel('Savings type')).toHaveValue('allocation')

  await page.getByLabel('Name').fill('Roth')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name: 'Roth' })).toBeVisible()
  await expect(page.getByLabel('Savings type')).toHaveValue('allocation')
  await expect(page.getByRole('cell', { name: 'Not a bucket' })).toHaveCount(2)

  await page.getByLabel('Savings type').selectOption('bucket')
  await page.getByLabel('Name').fill('Emergency')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('cell', { name: 'Emergency' })).toBeVisible()
  await expect(page.getByLabel('Kind')).toHaveValue('savings')
  await expect(page.getByLabel('Savings type')).toHaveValue('bucket')

  await page.getByRole('link', { name: 'Tracker' }).click()
  const logForm = page.locator('form').filter({ hasText: 'Log transaction' })
  await logForm.getByLabel('Kind').selectOption('savings')
  await logForm.getByLabel('Category').selectOption({ label: 'Emergency' })
  await logForm.getByLabel(/^Amount/).fill('25')
  await logForm.getByRole('button', { name: 'Add' }).click()
  const ledgerRows = page.locator('.virtual-table-row')
  await expect(ledgerRows.filter({ hasText: 'Emergency' })).toBeVisible()
  await expect(logForm.getByLabel('Kind')).toHaveValue('savings')
  await expect(logForm.getByLabel('Category').locator('option:checked')).toHaveText(
    'Emergency',
  )
  await expect(page.getByText(/schedule this savings/i)).toBeVisible()
  await expect(page.getByText(/set money aside/i)).toBeVisible()
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(logForm.getByLabel('Kind')).toHaveValue('savings')

  await page.getByRole('button', { name: 'Add schedule' }).click()
  const scheduleForm = page.locator('form.recurring-form')
  await scheduleForm.getByLabel('Kind').selectOption('savings')
  await scheduleForm.getByLabel('Category').selectOption({ label: 'Emergency' })
  await expect(page.getByText(/standalone withdrawal/i)).toBeVisible()
  await scheduleForm.getByLabel(/^Amount/).fill('100')
  await scheduleForm.getByRole('button', { name: 'Save schedule' }).click()

  const scheduleRow = page
    .locator('.recurring-table')
    .getByRole('row')
    .filter({ hasText: 'Emergency' })
  await expect(scheduleRow).toContainText('Savings')
  await expect(scheduleRow).toContainText('$100.00')

  await page.getByRole('button', { name: 'Add schedule' }).click()
  await expect(scheduleForm.getByLabel('Kind')).toHaveValue('savings')
  await expect(
    scheduleForm.getByLabel('Category').locator('option:checked'),
  ).toHaveText('Emergency')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await scheduleRow.getByRole('button', { name: 'Log' }).click()
  await expect(
    ledgerRows.filter({ hasText: 'Emergency' }).filter({ hasText: '$100.00' }),
  ).toBeVisible()
  await expect(logForm.getByLabel('Kind')).toHaveValue('savings')
})
