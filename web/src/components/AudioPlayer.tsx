import { useEffect, useRef, useState } from 'react'
import { playableAudioUrl } from '../lib/offline'
import { formatDuration } from '../lib/format'
import type { Song } from '../lib/types'

interface Props {
  song: Song
  light?: boolean
  /** Navegación dentro de una lista (Presentación). Sin esto, es el reproductor de una sola canción. */
  hasPrev?: boolean
  hasNext?: boolean
  onPrev?: () => void
  onNext?: () => void
  onPlayingChange?: (playing: boolean) => void
}

export function AudioPlayer({ song, light = false, hasPrev = false, hasNext = false, onPrev, onNext, onPlayingChange }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [autoNext, setAutoNext] = useState(false)
  const wantPlay = useRef(false)
  const inList = Boolean(onPrev || onNext)

  useEffect(() => onPlayingChange?.(playing), [playing, onPlayingChange])

  // Cargar audio de la canción actual (caché local primero).
  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    setError(null)
    setSrc(null)
    setTime(0)
    setDuration(song.duration_sec ?? 0)
    if (!song.audio_path || song.audio_status !== 'ready') return
    playableAudioUrl(song.audio_path)
      .then(({ url, local }) => {
        if (cancelled) {
          if (local) URL.revokeObjectURL(url)
          return
        }
        if (local) revoked = url
        setSrc(url)
      })
      .catch(() => !cancelled && setError(navigator.onLine ? 'No se pudo cargar el audio.' : 'Audio no descargado para usar sin internet.'))
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [song.id, song.audio_path, song.audio_status, song.duration_sec])

  useEffect(() => {
    const el = audio.current
    if (el && src && wantPlay.current) el.play().catch(() => setPlaying(false))
  }, [src])

  // Controles en pantalla bloqueada / auriculares.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist ?? '',
      artwork: song.thumbnail_url ? [{ src: song.thumbnail_url, sizes: '480x360' }] : [],
    })
    navigator.mediaSession.setActionHandler('previoustrack', hasPrev && onPrev ? onPrev : null)
    navigator.mediaSession.setActionHandler('nexttrack', hasNext && onNext ? onNext : null)
    navigator.mediaSession.setActionHandler('play', () => audio.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause())
  }, [song, hasPrev, hasNext, onPrev, onNext])

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) {
      wantPlay.current = true
      el.play().catch(() => setError('No se pudo reproducir.'))
    } else {
      wantPlay.current = false
      el.pause()
    }
  }

  const btn = `flex h-12 w-12 items-center justify-center rounded-full text-xl disabled:opacity-30 ${light ? 'active:bg-slate-200' : 'active:bg-slate-800'}`
  const noAudio = !song.audio_path || song.audio_status !== 'ready'
  const status = noAudio ? 'Sin audio' : error ? '' : !src ? 'Cargando…' : ''

  const element = src && (
    <audio
      ref={audio}
      src={src}
      preload="auto"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
      onEnded={() => {
        setPlaying(false)
        if (autoNext && hasNext && onNext) onNext()
        else wantPlay.current = false
      }}
      onError={() => setError('No se pudo reproducir el audio.')}
    />
  )

  const playButton = (size: string) => (
    <button
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-30`}
      onClick={toggle}
      disabled={!src}
      aria-label={playing ? 'Pausa' : 'Reproducir'}
    >
      {playing ? '❚❚' : '▶'}
    </button>
  )

  const seek = (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs tabular-nums opacity-70">
      <span className="w-10">{formatDuration(time)}</span>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.5}
        value={Math.min(time, duration || 0)}
        disabled={!src}
        onChange={(e) => {
          const t = Number(e.target.value)
          if (audio.current) audio.current.currentTime = t
          setTime(t)
        }}
        className="min-w-0 flex-1"
        aria-label="Posición"
      />
      <span className="w-10 text-right">{formatDuration(duration)}</span>
    </div>
  )

  if (!inList) {
    return (
      <div className="px-4 py-2">
        {element}
        <div className="flex items-center gap-3">
          {playButton('h-12 w-12 text-xl')}
          {seek}
        </div>
        {(error || status) && <p className={`text-center text-xs ${error ? 'text-red-400' : 'opacity-60'}`}>{error || status}</p>}
      </div>
    )
  }

  return (
    <div className={`border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${light ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-950'}`}>
      {element}
      {seek}
      <div className="flex items-center justify-between">
        <button
          className={`w-16 rounded-lg py-1 text-[11px] leading-tight ${autoNext ? 'text-indigo-400' : 'opacity-50'}`}
          onClick={() => setAutoNext((v) => !v)}
          aria-pressed={autoNext}
        >
          {autoNext ? '⟳ Auto: sí' : '⟳ Auto: no'}
        </button>
        <div className="flex items-center gap-3">
          <button className={btn} onClick={onPrev} disabled={!hasPrev} aria-label="Anterior">⏮</button>
          {playButton('h-14 w-14 text-2xl')}
          <button className={btn} onClick={onNext} disabled={!hasNext} aria-label="Siguiente">⏭</button>
        </div>
        <span className="w-16 truncate text-right text-[11px] opacity-50">{status}</span>
      </div>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  )
}
