import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_WEB_PORT || 5173)
const apiPort = Number(process.env.E2E_API_PORT || 8000)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node ./e2e/mock-api.mjs`,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, E2E_API_PORT: String(apiPort) },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_API_URL: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
})
