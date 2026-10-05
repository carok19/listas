// Guardado de listas para usar sin internet (Cache Storage).
// Los MP3 se guardan con una clave estable (la ruta en Storage), así la
// URL firmada puede cambiar sin perder lo descargado.
import { signedAudioUrl } from './api'
import type { SetlistWithItems } from './types'

const AUDIO_CACHE = 'alabanza-audio-v1'
const DATA_CACHE = 'alabanza-data-v1'

const audioKey = (path: string) => `/__offline/audio/${path}`
const setlistKey = (id: string) => `/__offline/setlist/${id}.json`

export const offlineSupported = typeof caches !== 'undefined'

export interface SavedSetlist {
  setlist: SetlistWithItems
  groupName: string
  savedAt: string
}

export async function saveSetlistOffline(
  setlist: SetlistWithItems,
  groupName: string,
  onProgress?: (done: number, total: number) => void,
) {
  if (!offlineSupported) throw new Error('Este navegador no permite guardar para usar sin internet.')
  const audio = await caches.open(AUDIO_CACHE)
  const paths = [...new Set(setlist.setlist_songs.map((i) => i.songs.audio_path).filter(Boolean) as string[])]
  let done = 0
  onProgress?.(done, paths.length)
  for (const path of paths) {
    if (!(await audio.match(audioKey(path)))) {
      const url = await signedAudioUrl(path)
      const res = await fetch(url)
      if (!res.ok) throw new Error('No se pudo descargar un audio de la lista.')
      const blob = await res.blob()
      await audio.put(audioKey(path), new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }))
    }
    done++
    onProgress?.(done, paths.length)
  }
  const data = await caches.open(DATA_CACHE)
  const payload: SavedSetlist = { setlist, groupName, savedAt: new Date().toISOString() }
  await data.put(setlistKey(setlist.id), new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }))
  await navigator.storage?.persist?.().catch(() => false)
}

export async function getSavedSetlist(id: string): Promise<SavedSetlist | null> {
  if (!offlineSupported) return null
  const data = await caches.open(DATA_CACHE)
  const res = await data.match(setlistKey(id))
  return res ? ((await res.json()) as SavedSetlist) : null
}

export async function listSavedSetlists(): Promise<SavedSetlist[]> {
  if (!offlineSupported) return []
  const data = await caches.open(DATA_CACHE)
  const keys = await data.keys()
  const out: SavedSetlist[] = []
  for (const k of keys) {
    const res = await data.match(k)
    if (res) out.push((await res.json()) as SavedSetlist)
  }
  return out.sort((a, b) => a.setlist.service_date.localeCompare(b.setlist.service_date))
}

export async function removeSavedSetlist(id: string) {
  if (!offlineSupported) return
  const data = await caches.open(DATA_CACHE)
  const saved = await getSavedSetlist(id)
  await data.delete(setlistKey(id))
  if (!saved) return
  // Borrar audios que ya no use ninguna otra lista guardada.
  const others = await listSavedSetlists()
  const inUse = new Set(others.flatMap((s) => s.setlist.setlist_songs.map((i) => i.songs.audio_path)))
  const audio = await caches.open(AUDIO_CACHE)
  for (const item of saved.setlist.setlist_songs) {
    const p = item.songs.audio_path
    if (p && !inUse.has(p)) await audio.delete(audioKey(p))
  }
}

/** El MP3 guardado para usar sin internet, si está en este dispositivo. */
export async function cachedAudioBlob(path: string): Promise<Blob | null> {
  if (!offlineSupported) return null
  const res = await (await caches.open(AUDIO_CACHE)).match(audioKey(path))
  return res ? res.blob() : null
}

/** URL reproducible: primero el caché local, si no, URL firmada de Supabase. */
export async function playableAudioUrl(path: string): Promise<{ url: string; local: boolean }> {
  const cached = await cachedAudioBlob(path)
  if (cached) return { url: URL.createObjectURL(cached), local: true }
  return { url: await signedAudioUrl(path), local: false }
}
