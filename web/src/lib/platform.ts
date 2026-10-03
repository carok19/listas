import { Capacitor } from '@capacitor/core'

/** true dentro de la APK (Capacitor), false en el navegador. */
export const isNative = Capacitor.isNativePlatform()

/** Esquema de deep links de la APK: com.alabanza.app://ruta */
export const APP_SCHEME = 'com.alabanza.app'

/** A dónde vuelve Supabase después de un login con Google o enlace mágico. */
export function authRedirectUrl() {
  return isNative ? `${APP_SCHEME}://login` : `${window.location.origin}/login`
}

/** Link para descargar la APK (última versión publicada en GitHub). */
export const APK_DOWNLOAD_URL =
  (import.meta.env.VITE_APP_DOWNLOAD_URL as string | undefined) ||
  'https://github.com/carok19/listas/releases/latest/download/Alabanza.apk'

/** URL web pública de la app, si existe (para links de invitación). */
export const WEB_URL = (import.meta.env.VITE_WEB_URL as string | undefined)?.replace(/\/$/, '') || (isNative ? '' : window.location.origin)
