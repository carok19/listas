// Guardar los MP3 en el dispositivo: en la APK quedan en Documentos/Alabanza
// (visibles en Archivos y en las apps de música); en el navegador, en Descargas.
import { Browser } from '@capacitor/browser'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { signedAudioUrl } from './api'
import { cachedAudioBlob } from './offline'
import { isNative } from './platform'
import type { Song } from './types'

const ROOT = 'Alabanza'
export const SAVE_LOCATION = isNative ? `Documentos › ${ROOT}` : 'Descargas'

export const hasAudio = (s: Song) => Boolean(s.audio_path) && s.audio_status === 'ready'

function safeName(s: string) {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
}

export function songFileName(song: Pick<Song, 'title' | 'artist'>, position?: number) {
  const base = safeName([song.title, song.artist].filter(Boolean).join(' - ')) || 'cancion'
  return `${position ? `${String(position).padStart(2, '0')} - ` : ''}${base}.mp3`
}

async function audioBlob(path: string): Promise<Blob> {
  const cached = await cachedAudioBlob(path)
  if (cached) return cached
  const res = await fetch(await signedAudioUrl(path))
  if (!res.ok) throw new Error('No se pudo descargar el audio. Revisa tu conexión.')
  return res.blob()
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Por partes, para no pasar un texto base64 enorme al lado nativo.
const CHUNK = 1024 * 1024

async function writeDocument(path: string, blob: Blob) {
  for (let start = 0; start < blob.size; start += CHUNK) {
    const options = { path, data: await toBase64(blob.slice(start, start + CHUNK)), directory: Directory.Documents }
    if (start === 0) await Filesystem.writeFile({ ...options, recursive: true })
    else await Filesystem.appendFile(options)
  }
}

async function saveNative(folder: string, name: string, blob: Blob) {
  if (!blob.size) throw new Error('El audio está vacío.')
  try {
    await writeDocument(`${folder}/${name}`, blob)
  } catch (e) {
    if ((e as { code?: string }).code === 'OS-PLUG-FILE-0007') {
      throw new Error('Alabanza no tiene permiso para guardar archivos. Actívalo en Ajustes › Apps › Alabanza › Permisos.')
    }
    // Android 11+ no deja reemplazar un archivo creado por una instalación anterior de la app.
    await writeDocument(`${folder}/${name.replace(/\.mp3$/i, '')} (${Date.now() % 100000}).mp3`, blob)
  }
}

function clickDownload(url: string, name?: string) {
  const a = document.createElement('a')
  a.href = url
  if (name) a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function downloadInBrowser(path: string, name: string) {
  const cached = await cachedAudioBlob(path)
  if (cached) {
    const url = URL.createObjectURL(cached)
    clickDownload(url, name)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  clickDownload(await signedAudioUrl(path, name))
}

/** Guarda el MP3 de una canción en el dispositivo. */
export async function downloadSong(song: Song, folder = ROOT, position?: number) {
  if (!song.audio_path || !hasAudio(song)) throw new Error('Esta canción no tiene audio.')
  const name = songFileName(song, position)
  if (isNative) await saveNative(folder, name, await audioBlob(song.audio_path))
  else await downloadInBrowser(song.audio_path, name)
}

/** Guarda los MP3 de una lista, numerados en orden, en su propia carpeta. Devuelve la carpeta. */
export async function downloadSetlistSongs(
  title: string,
  date: string,
  songs: Song[],
  onProgress?: (done: number, total: number) => void,
) {
  const folder = `${ROOT}/${safeName(`${date} ${title}`) || date}`
  const items = songs.map((song, i) => ({ song, position: i + 1 })).filter((it) => hasAudio(it.song))
  onProgress?.(0, items.length)
  for (const [i, it] of items.entries()) {
    await downloadSong(it.song, folder, it.position)
    onProgress?.(i + 1, items.length)
    // El navegador bloquea varias descargas seguidas sin pausa.
    if (!isNative) await new Promise((r) => setTimeout(r, 700))
  }
  return isNative ? `Documentos › ${folder.replace('/', ' › ')}` : SAVE_LOCATION
}

/** Plan B en la APK: que el navegador del celular descargue el MP3 a Descargas. */
export async function downloadWithBrowser(song: Song) {
  if (!song.audio_path) return
  await Browser.open({ url: await signedAudioUrl(song.audio_path, songFileName(song)) })
}
