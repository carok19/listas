import { useEffect, useRef, useState } from 'react'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { isNative } from '../lib/platform'

/** Mantiene la pantalla encendida mientras `enabled` sea true. */
export function useWakeLock(enabled: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null)
  const [active, setActive] = useState(false)
  const supported = isNative || (typeof navigator !== 'undefined' && 'wakeLock' in navigator)

  useEffect(() => {
    if (!supported || !enabled) return
    let cancelled = false

    // Dentro de la APK: plugin nativo (más confiable que la API web).
    if (isNative) {
      KeepAwake.keepAwake()
        .then(() => !cancelled && setActive(true))
        .catch(() => setActive(false))
      return () => {
        cancelled = true
        KeepAwake.allowSleep().catch(() => {})
        setActive(false)
      }
    }

    const request = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release()
          return
        }
        lock.current = sentinel
        setActive(true)
        sentinel.addEventListener('release', () => setActive(false))
      } catch {
        setActive(false)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }

    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock.current?.release().catch(() => {})
      lock.current = null
      setActive(false)
    }
  }, [enabled, supported])

  return { supported, active }
}
