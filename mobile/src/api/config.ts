import { Platform } from 'react-native'

import { resolveApiBaseUrl } from '../lib/format'

/** Same Render origin the website uses. Override at APK build time with EXPO_PUBLIC_API_URL. */
export const PRODUCTION_API_URL = 'https://budgeting-app-m3aj.onrender.com'

export function apiBaseUrl(): string {
  return resolveApiBaseUrl(
    process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL,
    Platform.OS,
  )
}
