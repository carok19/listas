// Integración con Android (solo se activa dentro de la APK).
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'
import { APP_SCHEME, isNative } from './platform'

/**
 * Escucha deep links (com.alabanza.app://...) para:
 *  - completar el login con Google / enlace mágico (?code=...)
 *  - abrir invitaciones (com.alabanza.app://unirse/ABC123)
 */
export function setupNative(navigate: (path: string) => void) {
  if (!isNative) return () => {}

  const handleUrl = async (raw: string) => {
    if (!raw.startsWith(`${APP_SCHEME}://`)) return
    const url = new URL(raw.replace(`${APP_SCHEME}://`, 'https://app.local/'))
    const code = url.searchParams.get('code')
    const errorDesc = url.searchParams.get('error_description')
    if (code) {
      await Browser.close().catch(() => {})
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) navigate(`/login?error=${encodeURIComponent(error.message)}`)
      return
    }
    if (errorDesc) {
      await Browser.close().catch(() => {})
      navigate(`/login?error=${encodeURIComponent(errorDesc)}`)
      return
    }
    const path = url.pathname.replace(/\/+$/, '')
    if (path && path !== '/login') navigate(path + url.search)
  }

  const subs = [
    App.addListener('appUrlOpen', (e) => handleUrl(e.url)),
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else App.exitApp()
    }),
  ]
  App.getLaunchUrl().then((r) => {
    if (r?.url) handleUrl(r.url)
  })

  return () => subs.forEach((s) => s.then((h) => h.remove()))
}

/** Abre el login de Google en el navegador del sistema (Custom Tab). */
export async function openOAuthInBrowser(url: string) {
  await Browser.open({ url, presentationStyle: 'popover' })
}
