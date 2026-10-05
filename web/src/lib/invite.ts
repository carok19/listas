import { APK_DOWNLOAD_URL, APP_SCHEME, WEB_URL } from './platform'
import type { Group } from './types'

type InviteGroup = Pick<Group, 'name' | 'invite_code'>

/** En la web el link abre la app directamente; sin web, abre la APK si ya está instalada. */
export function inviteLink(group: InviteGroup) {
  return WEB_URL ? `${WEB_URL}/unirse/${group.invite_code}` : `${APP_SCHEME}://unirse/${group.invite_code}`
}

export function inviteText(group: InviteGroup) {
  return WEB_URL
    ? `Únete a "${group.name}" en la app de Alabanza para ver las canciones y listas 🎶\n${inviteLink(group)}\nCódigo: ${group.invite_code}`
    : `Únete a "${group.name}" en la app de Alabanza 🎶\n1) Descarga la app (Android): ${APK_DOWNLOAD_URL}\n2) Crea tu cuenta y toca "Unirme con código": ${group.invite_code}`
}

/** Menú de compartir del sistema si existe; si no, WhatsApp. */
export async function shareInvite(group: InviteGroup) {
  const text = inviteText(group)
  if (navigator.share) {
    try {
      await navigator.share({ title: group.name, text })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}
