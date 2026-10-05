// Agregar una canción desde un video (YouTube u otro sitio). Si algo falla, no
// queda ninguna canción a medias en la biblioteca.
import { createSong, deleteSong, getSong, updateSong, uploadSongAudio } from './api'
import { getJob, startDownload, type Job } from './downloader'
import { guessTitleArtist } from './format'
import { findLyricsAuto } from './lyrics'
import type { Song } from './types'
import { cancelDeviceDownload, DownloadCanceled, downloadOnDevice, youtubeOnDevice, type DeviceDownload } from './youtube'

export interface VideoMeta {
  title: string
  artist?: string
  thumbnail?: string | null
  duration?: number | null
}

export interface Progress {
  label: string
  percent?: number | null
  cancel?: () => void
}

type OnProgress = (p: Progress) => void

const JOB_LABEL: Record<Job['status'], string> = {
  queued: 'En cola en el servidor…',
  downloading: 'Descargando…',
  uploading: 'Guardando en el grupo…',
  done: 'Listo',
  error: 'Error',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

function namesFromInfo(info: DeviceDownload['info']) {
  if (info.track) return { title: info.track, artist: info.artist ?? '' }
  const g = guessTitleArtist(info.title ?? '', info.channel ?? info.uploader)
  return { title: g.title || info.title || 'Sin título', artist: g.artist }
}

async function downloadToPhone(url: string, onProgress: OnProgress) {
  const id = newId()
  let canceled = false
  const cancel = () => {
    canceled = true
    onProgress({ label: 'Cancelando…' })
    void cancelDeviceDownload(id)
  }
  onProgress({ label: 'Preparando la descarga…', cancel })
  const result = await downloadOnDevice(url, id, (percent) => {
    if (!canceled) onProgress({ label: 'Descargando…', percent, cancel })
  })
  // Si se canceló justo al terminar, no se guarda nada.
  if (canceled) throw new DownloadCanceled()
  return result
}

async function withLyrics(song: Song, onProgress: OnProgress) {
  if (song.lyrics?.trim()) return song
  onProgress({ label: 'Buscando la letra…' })
  const found = await findLyricsAuto(song.title, song.artist).catch(() => null)
  return found ? updateSong(song.id, { lyrics: found.lyrics }).catch(() => song) : song
}

async function addOnDevice(groupId: string, url: string, meta: VideoMeta | undefined, onProgress: OnProgress) {
  const { file, info } = await downloadToPhone(url, onProgress)
  onProgress({ label: 'Guardando en el grupo…' })
  const names = meta ?? namesFromInfo(info)
  const song = await createSong(groupId, {
    title: names.title.slice(0, 200),
    artist: names.artist || null,
    source_url: url,
    thumbnail_url: meta?.thumbnail ?? info.thumbnail ?? null,
    duration_sec: Math.round(info.duration ?? meta?.duration ?? 0) || null,
  })
  let saved: Song
  try {
    saved = await uploadSongAudio(song, file)
  } catch (e) {
    await deleteSong(song).catch(() => {})
    throw e
  }
  return withLyrics(saved, onProgress)
}

async function addViaServer(groupId: string, url: string, meta: VideoMeta | undefined, onProgress: OnProgress) {
  onProgress({ label: 'Conectando con el servidor… (si estaba dormido tarda cerca de 1 minuto)' })
  const song = await createSong(groupId, {
    title: meta?.title || 'Descargando…',
    artist: meta?.artist || null,
    source_url: url,
    thumbnail_url: meta?.thumbnail ?? null,
    duration_sec: meta?.duration ? Math.round(meta.duration) : null,
    audio_status: 'processing',
  })
  try {
    let job = await startDownload(url, song.id, !meta)
    const deadline = Date.now() + 15 * 60_000
    let failures = 0
    while (job.status !== 'done') {
      if (job.status === 'error') throw new Error(job.error || 'No se pudo descargar el audio.')
      if (Date.now() > deadline) throw new Error('La descarga tardó demasiado. Intenta de nuevo o sube el audio.')
      onProgress({ label: JOB_LABEL[job.status], percent: job.status === 'downloading' ? job.progress : null })
      await sleep(2000)
      try {
        job = await getJob(job.id)
        failures = 0
      } catch (e) {
        // Si el servicio se reinició, el resultado igual queda guardado en la canción.
        const current = await getSong(song.id).catch(() => null)
        if (current?.audio_status === 'ready') break
        if (current?.audio_status === 'error') throw new Error(current.audio_error || 'No se pudo descargar el audio.')
        if (++failures >= 5) throw e
      }
    }
  } catch (e) {
    await deleteSong(song).catch(() => {})
    throw e
  }
  return withLyrics(await getSong(song.id), onProgress)
}

/** Crea la canción con su audio. Si la descarga falla, no se guarda nada. */
export function addSongFromVideo(groupId: string, url: string, meta: VideoMeta | undefined, onProgress: OnProgress) {
  return youtubeOnDevice ? addOnDevice(groupId, url, meta, onProgress) : addViaServer(groupId, url, meta, onProgress)
}

/** Vuelve a bajar en el celular el audio de una canción que ya existe (desde su link). */
export async function retryOnDevice(song: Song, onProgress: OnProgress) {
  if (!song.source_url) throw new Error('La canción no tiene link de origen.')
  const { file } = await downloadToPhone(song.source_url, onProgress)
  onProgress({ label: 'Guardando en el grupo…' })
  return uploadSongAudio(song, file)
}
