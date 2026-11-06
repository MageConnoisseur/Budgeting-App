import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { kindFromLaunchUrl } from './launch'
import { addLogLaunchListener, getPendingLaunch } from './upload/native'
import type { CategoryKind } from './types'

export interface LogLaunch {
  kind: CategoryKind
  seq: number
}

export function useLogLaunch(): LogLaunch | null {
  const [launch, setLaunch] = useState<LogLaunch | null>(null)

  useEffect(() => {
    let last = 0
    const apply = (url: string, seq: number) => {
      if (!seq || seq <= last) return
      const kind = kindFromLaunchUrl(url)
      if (!kind) return
      last = seq
      setLaunch({ kind, seq })
    }
    const pending = getPendingLaunch()
    if (pending) apply(pending.url, pending.seq)
    const subscription = addLogLaunchListener((event) => apply(event.url, event.seq))
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      const again = getPendingLaunch()
      if (again) apply(again.url, again.seq)
    })
    return () => {
      subscription.remove()
      appState.remove()
    }
  }, [])

  return launch
}
