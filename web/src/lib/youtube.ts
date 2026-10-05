// YouTube (y otros sitios) para agregar canciones. En la APK, yt-dlp corre en el
// celular: YouTube no bloquea la IP de un teléfono como bloquea la del servidor.
// En la web se usa el servicio de descarga.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { downloaderConfigured, searchVideos as searchOnServer, type SearchResult } from './downloader'
import { isNative } from './platform'

interface DeviceInfo {
  path: string
  title?: string
  track?: string
  artist?: string
  uploader?: string
  channel?: string
  thumbnail?: string
  duration?: number
}

interface YouTubePlugin {
  search(options: { query: string; limit?: number }): Promise<{ json: string }>
  download(options: { url: string; id: string }): Promise<DeviceInfo>
  cancel(options: { id: string }): Promise<void>
  cleanup(options: { id: string }): Promise<void>
  addListener(event: 'progress', fn: (e: { id: string; progress: number }) => void): Promise<PluginListenerHandle>
}

const YouTube = registerPlugin<YouTubePlugin>('YouTube')

export const youtubeOnDevice = isNative && Capacitor.isPluginAvailable('YouTube')
export const youtubeAvailable = youtubeOnDevice || downloaderConfigured

/** Mensaje claro a partir del error de yt-dlp (en inglés y largo). */
export function youtubeErrorMessage(raw: string) {
  // Los mensajes propios de la app ya vienen en español.
  if (/[áéíóúñ¿]/i.test(raw) && raw.length < 250) return raw
  const low = raw.toLowerCase()
  if (low.includes('sign in to confirm') || low.includes('not a bot') || low.includes('429') || low.includes('too many requests')) {
    return 'YouTube pidió verificar que no eres un robot. Prueba de nuevo en unos minutos o cambia de Wi-Fi a datos (o al revés).'
  }
  if (low.includes('private video')) return 'El video es privado.'
  if (low.includes('age') && (low.includes('restricted') || low.includes('confirm your age'))) return 'El video tiene restricción de edad; prueba con otro.'
  if (low.includes('video unavailable') || low.includes('not available') || low.includes('has been removed')) {
    return 'El video no está disponible (borrado o bloqueado en tu país). Prueba con otro resultado.'
  }
  if (low.includes('unsupported url')) return 'Ese link no es compatible. Usa un link de YouTube, SoundCloud, Facebook, Instagram u otro sitio de videos.'
  if (low.includes('live event') || low.includes('is live')) return 'No se pueden descargar transmisiones en vivo.'
  if (low.includes('larger than max-filesize')) return 'El audio pesa más de 50 MB.'
  if (low.includes('unable to download') || low.includes('timed out') || low.includes('connection') || low.includes('network') || low.includes('resolve host')) {
    return 'No se pudo conectar con YouTube. Revisa tu internet e intenta de nuevo.'
  }
  return 'No se pudo descargar ese video. Prueba con otro resultado o sube el audio.'
}

interface SearchEntry {
  id?: string
  title?: string
  url?: string
  channel?: string
  uploader?: string
  duration?: number
  thumbnails?: { url: string }[]
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  if (!youtubeOnDevice) return searchOnServer(query)
  let json: string
  try {
    json = (await YouTube.search({ query, limit: 8 })).json
  } catch (e) {
    throw new Error(youtubeErrorMessage((e as Error).message ?? ''))
  }
  const data = JSON.parse(json || '{}') as { entries?: SearchEntry[] }
  return (data.entries ?? [])
    .filter((e): e is SearchEntry & { id: string } => Boolean(e?.id))
    .map((e) => ({
      id: e.id,
      title: e.title ?? '',
      channel: e.channel ?? e.uploader ?? null,
      duration: e.duration ?? null,
      thumbnail: e.thumbnails?.length ? e.thumbnails[e.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      url: e.url?.startsWith('http') ? e.url : `https://www.youtube.com/watch?v=${e.id}`,
    }))
}

export interface DeviceDownload {
  file: File
  info: Omit<DeviceInfo, 'path'>
}

const MIME: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', opus: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', aac: 'audio/aac' }

/** Descarga el audio en el celular. `id` sirve para cancelar con `cancelDeviceDownload`. */
export async function downloadOnDevice(url: string, id: string, onProgress?: (percent: number) => void): Promise<DeviceDownload> {
  const sub = await YouTube.addListener('progress', (e) => {
    if (e.id === id) onProgress?.(e.progress)
  })
  try {
    let result: DeviceInfo
    try {
      result = await YouTube.download({ url, id })
    } catch (e) {
      throw new Error(youtubeErrorMessage((e as Error).message ?? ''))
    }
    const { path, ...info } = result
    const res = await fetch(Capacitor.convertFileSrc(path))
    if (!res.ok) throw new Error('No se pudo leer el audio descargado.')
    const blob = await res.blob()
    const ext = path.split('.').pop()?.toLowerCase() || 'm4a'
    return { file: new File([blob], `audio.${ext}`, { type: MIME[ext] ?? 'audio/mp4' }), info }
  } finally {
    sub.remove()
    YouTube.cleanup({ id }).catch(() => {})
  }
}

export function cancelDeviceDownload(id: string) {
  return YouTube.cancel({ id }).catch(() => {})
}
