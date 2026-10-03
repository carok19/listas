import { useEffect, useRef, useState } from 'react'

/** Mantiene la pantalla encendida mientras `enabled` sea true. */
export function useWakeLock(enabled: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null)
  const [active, setActive] = useState(false)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    if (!supported || !enabled) return
    let cancelled = false

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
