import { Platform } from 'react-native'
import { resolveApiBaseUrl } from '../lib/format'

export function apiBaseUrl(): string {
  return resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, Platform.OS)
}
