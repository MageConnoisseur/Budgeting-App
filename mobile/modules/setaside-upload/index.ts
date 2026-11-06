import { requireOptionalNativeModule } from 'expo-modules-core'

export interface LogLaunchEvent {
  url: string
  seq: number
}

export interface SetasideUploadNative {
  setSession(token: string, userId: string, apiBase: string): Promise<void>
  enqueue(itemJson: string): Promise<string>
  listOutbox(): Promise<string>
  remove(id: string): Promise<string>
  retryNeedsAuth(userId: string): Promise<string>
  readCache(name: string): Promise<string>
  writeCache(name: string, body: string): Promise<void>
  getPendingLaunch(): LogLaunchEvent
  addListener(
    event: 'onLogLaunch',
    listener: (event: LogLaunchEvent) => void,
  ): { remove(): void }
}

export function loadSetasideUpload(): SetasideUploadNative | null {
  return requireOptionalNativeModule<SetasideUploadNative>('SetasideUpload')
}
