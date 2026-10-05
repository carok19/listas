// Cliente del servicio de descarga (yt-dlp). Está desacoplado: si se cambia
// el servicio, basta con que respete este mismo contrato HTTP.
import { supabase } from './supabase'

const BASE = (import.meta.env.VITE_DOWNLOADER_URL as string | undefined)?.replace(/\/$/, '') ?? ''
// Capa extra opcional (debe coincidir con API_TOKEN del servicio). No es secreta: se ve en el navegador.
const APP_TOKEN = import.meta.env.VITE_DOWNLOADER_TOKEN as string | undefined

export const downloaderConfigured = Boolean(BASE)

export interface SearchResult {
  id: string
  title: string
  channel: string | null
  duration: number | null
  thumbnail: string | null
  url: string
}

export type JobStatus = 'queued' | 'downloading' | 'uploading' | 'done' | 'error'

export interface Job {
  id: string
  status: JobStatus
  progress: number | null
  error: string | null
  song_id: string
}

export class DownloaderError extends Error {}

async function call<T>(path: string, init?: RequestInit, as: 'json' | 'text' = 'json'): Promise<T> {
  if (!BASE) throw new DownloaderError('El servicio de descarga no está configurado. Sube el MP3 manualmente.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(APP_TOKEN ? { 'X-Api-Token': APP_TOKEN } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new DownloaderError(
      'No se pudo contactar el servicio de descarga. Puede estar despertando (tarda ~1 minuto); intenta de nuevo o sube el MP3 manualmente.',
    )
  }
  if (res.ok && as === 'text') return (await res.text()) as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new DownloaderError(body.detail || body.error || `Error del servicio de descarga (${res.status}).`)
  return body as T
}

export function searchVideos(q: string) {
  return call<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.results)
}

export function startDownload(url: string, songId: string, fillMetadata: boolean) {
  return call<Job>('/download', {
    method: 'POST',
    body: JSON.stringify({ url, song_id: songId, fill_metadata: fillMetadata }),
  })
}

export function getJob(jobId: string) {
  return call<Job>(`/jobs/${jobId}`)
}

/** Despierta el servicio (Render gratis se duerme) sin esperar respuesta. */
export function wakeDownloader() {
  if (BASE) fetch(`${BASE}/health`).catch(() => {})
}

export function lyricsViaDownloader(params: Record<string, string>) {
  return call<unknown[]>(`/lyrics?${new URLSearchParams(params)}`)
}

/** Lee una página de un sitio de letras (letras.com, etc.), que el navegador no puede pedir directo por CORS. */
export function pageViaDownloader(url: string) {
  return call<string>(`/page?${new URLSearchParams({ url })}`, undefined, 'text')
}
