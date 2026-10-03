// Letras desde LRCLIB (https://lrclib.net), API pública sin clave.

interface LrcResult {
  id: number
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface LyricsMatch {
  title: string
  artist: string
  lyrics: string
}

import { lyricsViaDownloader } from './downloader'

const BASE = 'https://lrclib.net/api'

/** Consulta LRCLIB directo; si el navegador no puede (CORS/red), usa el servicio de descarga. */
async function lrcSearch(params: Record<string, string>): Promise<LrcResult[]> {
  try {
    const res = await fetch(`${BASE}/search?${new URLSearchParams(params)}`)
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as LrcResult[]
  } catch {
    return (await lyricsViaDownloader(params)) as LrcResult[]
  }
}

function fromSynced(synced: string) {
  return synced
    .split('\n')
    .map((l) => l.replace(/^\[[^\]]*\]\s?/, ''))
    .join('\n')
    .trim()
}

function toMatch(r: LrcResult): LyricsMatch | null {
  const lyrics = r.plainLyrics?.trim() || (r.syncedLyrics ? fromSynced(r.syncedLyrics) : '')
  if (!lyrics) return null
  return { title: r.trackName, artist: r.artistName, lyrics }
}

/** Busca letras por título y artista. Devuelve hasta 5 opciones. */
export async function searchLyrics(title: string, artist?: string | null): Promise<LyricsMatch[]> {
  const t = title.trim()
  if (!t) return []
  const params: Record<string, string> = { track_name: t }
  if (artist?.trim()) params.artist_name = artist.trim()
  let rows: LrcResult[]
  try {
    rows = await lrcSearch(params)
    if (!rows.length && artist?.trim()) rows = await lrcSearch({ q: `${t} ${artist.trim()}` })
    if (!rows.length) rows = await lrcSearch({ q: t })
  } catch {
    throw new Error('No se pudo consultar LRCLIB. Revisa tu conexión o pega la letra manualmente.')
  }
  const out: LyricsMatch[] = []
  for (const r of rows) {
    const m = toMatch(r)
    if (m) out.push(m)
    if (out.length >= 5) break
  }
  return out
}
