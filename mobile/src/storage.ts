import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'setaside_token'
const memory: { token: string | null } = { token: null }

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webStorage()?.getItem(TOKEN_KEY) ?? memory.token
  }
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string | null): Promise<void> {
  memory.token = token
  if (Platform.OS === 'web') {
    const storage = webStorage()
    if (token) storage?.setItem(TOKEN_KEY, token)
    else storage?.removeItem(TOKEN_KEY)
    return
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}
