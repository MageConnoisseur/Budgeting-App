/**
 * Fail Vercel (and other CI) builds when VITE_API_URL is missing.
 * Without it the SPA defaults to http://localhost:8000 and registration
 * fails in the browser with a network error.
 */
const url = process.env.VITE_API_URL?.trim()
const onVercel = process.env.VERCEL === '1' || process.env.CI === 'true'

if (onVercel && !url) {
  console.error(
    'Missing VITE_API_URL. Set it to your Render API origin ' +
      '(e.g. https://your-service.onrender.com) with no trailing slash, then redeploy.',
  )
  process.exit(1)
}

if (url) {
  try {
    const parsed = new URL(url)
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      console.error(
        `VITE_API_URL must be an origin only (no path). Got pathname "${parsed.pathname}". ` +
          'Example: https://your-service.onrender.com',
      )
      process.exit(1)
    }
  } catch {
    console.error(`VITE_API_URL is not a valid URL: ${url}`)
    process.exit(1)
  }
}
