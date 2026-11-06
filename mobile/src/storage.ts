import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { User } from './types'
import { syncNativeSession } from './upload/native'

const TOKEN_KEY = 'setaside_token'
const USER_KEY = 'setaside_user'
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
  } else if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  }
  await syncNativeSession(token)
}

export async function getCachedUser(): Promise<User | null> {
  const raw =
    Platform.OS === 'web'
      ? webStorage()?.getItem(USER_KEY)
      : await SecureStore.getItemAsync(USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as User
    if (!parsed?.id || !parsed.username) return null
    return { id: parsed.id, username: parsed.username, email: parsed.email ?? null }
  } catch {
    return null
  }
}

export async function setCachedUser(user: User | null): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = webStorage()
    if (user) storage?.setItem(USER_KEY, JSON.stringify(user))
    else storage?.removeItem(USER_KEY)
    return
  }
  if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
  else await SecureStore.deleteItemAsync(USER_KEY)
}
