// Aviso de versión nueva de la APK (las versiones se publican en GitHub Releases).
import { App } from '@capacitor/app'
import { isNative } from './platform'

const LATEST_RELEASE_API = 'https://api.github.com/repos/carok19/listas/releases/latest'
const CHECK_KEY = 'alabanza.update-check'
const DISMISS_KEY = 'alabanza.update-dismissed'
const DAY = 24 * 60 * 60 * 1000

/** Versión instalada ("1.0.12"), solo dentro de la APK. */
export async function installedVersion(): Promise<string | null> {
  if (!isNative) return null
  return App.getInfo()
    .then((i) => i.version)
    .catch(() => null)
}

/** true si la versión `a` es más nueva que `b` ("v1.0.10" > "1.0.9"). */
export function isNewer(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento: se vuelve a consultar la próxima vez.
  }
}

/** La versión publicada si es más nueva que la instalada y no se descartó. Consulta GitHub como mucho una vez al día. */
export async function availableUpdate(): Promise<string | null> {
  const current = await installedVersion()
  if (!current) return null
  const cached = read<{ at: number; latest: string }>(CHECK_KEY)
  let latest = cached?.latest ?? null
  if (!cached || Date.now() - cached.at > DAY) {
    try {
      const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.ok) {
        latest = String((await res.json()).tag_name ?? '').replace(/^v/, '') || null
        if (latest) write(CHECK_KEY, { at: Date.now(), latest })
      }
    } catch {
      // Sin internet: se usa lo último que se supo.
    }
  }
  if (!latest || !isNewer(latest, current) || read<string>(DISMISS_KEY) === latest) return null
  return latest
}

export function dismissUpdate(version: string) {
  write(DISMISS_KEY, version)
}
