import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteSong, getSong, updateSong, uploadSongAudio } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { getJob, startDownload, type Job } from '../lib/downloader'
import { findLyricsAuto, SOURCE_LABEL } from '../lib/lyrics'
import { hasAudio } from '../lib/files'
import { formatDuration } from '../lib/format'
import type { Song } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { useWakeLock } from '../hooks/useWakeLock'
import { Header, Page } from '../components/Layout'
import { AudioPlayer } from '../components/AudioPlayer'
import { DownloadSong } from '../components/DownloadSong'
import { LyricsSearch } from '../components/LyricsSearch'
import { Badge, Button, Card, ErrorBox, Input, PageSpinner, Spinner, Textarea } from '../components/ui'

const TEXT_SIZE_KEY = 'alabanza:letra'

function loadTextSize() {
  try {
    const n = Number(localStorage.getItem(TEXT_SIZE_KEY))
    return n >= 14 && n <= 40 ? n : 18
  } catch {
    return 18
  }
}

const JOB_LABEL: Record<Job['status'], string> = {
  queued: 'En cola…',
  downloading: 'Descargando audio…',
  uploading: 'Guardando en la nube…',
  done: 'Listo',
  error: 'Error',
}

export default function SongDetail() {
  const { songId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const jobId = params.get('job')
  const { groupId, isAdmin } = useGroup()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const key = ['song', songId]

  const song = useQuery({
    queryKey: key,
    queryFn: () => getSong(songId),
    refetchInterval: (q) => (q.state.data?.audio_status === 'processing' ? 4000 : false),
  })

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['done', 'error'].includes(q.state.data.status) ? false : 2000),
    retry: 2,
  })

  useEffect(() => {
    if (job.data?.status === 'done' || job.data?.status === 'error') {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['songs', groupId] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data?.status])

  const refresh = (s?: Song) => {
    if (s) qc.setQueryData(key, s)
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['songs', groupId] })
  }

  const [editing, setEditing] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [autoLyrics, setAutoLyrics] = useState<string | null>(null)
  const triedLyrics = useRef(false)
  const [textSize, setTextSizeState] = useState(loadTextSize)
  const setTextSize = (n: number) => {
    const size = Math.min(40, Math.max(14, n))
    setTextSizeState(size)
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(size))
    } catch {
      /* sin almacenamiento */
    }
  }
  // Pantalla encendida mientras suena, para leer la letra sin tocar el celular.
  const [playing, setPlaying] = useState(false)
  useWakeLock(playing)

  // Letra automática (LRCLIB y luego letras.com) cuando la canción no tiene letra.
  useEffect(() => {
    const s = song.data
    if (!s || !isAdmin || triedLyrics.current || s.lyrics?.trim() || s.audio_status === 'processing') return
    triedLyrics.current = true
    findLyricsAuto(s.title, s.artist)
      .then(async (found) => {
        if (!found) {
          setAutoLyrics('No encontramos la letra automáticamente. Toca "Buscar letra" para buscarla en letras.com o Google.')
          return
        }
        refresh(await updateSong(s.id, { lyrics: found.lyrics }))
        setAutoLyrics(`Letra encontrada en ${SOURCE_LABEL[found.source]} (${found.artist} – ${found.title}). Revisa que sea la correcta.`)
      })
      .catch(() => setAutoLyrics(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.data?.id, song.data?.audio_status, isAdmin])

  const retry = useMutation({
    mutationFn: async (s: Song) => {
      await updateSong(s.id, { audio_status: 'processing', audio_error: null })
      return startDownload(s.source_url!, s.id, false)
    },
    onSuccess: (j) => {
      setParams({ job: j.id }, { replace: true })
      refresh()
    },
    onError: async (e) => {
      await updateSong(songId, { audio_status: 'error', audio_error: errorMessage(e) }).catch(() => {})
      refresh()
    },
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadSongAudio(song.data!, file),
    onSuccess: (s) => {
      setParams({}, { replace: true })
      refresh(s)
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteSong(song.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['songs', groupId] })
      navigate(`/g/${groupId}/canciones`, { replace: true })
    },
  })

  if (song.isLoading) return <PageSpinner />
  if (song.error || !song.data) {
    return (
      <>
        <Header title="Canción" back={`/g/${groupId}/canciones`} />
        <Page>
          <ErrorBox>{errorMessage(song.error ?? 'Canción no encontrada.')}</ErrorBox>
        </Page>
      </>
    )
  }
  const s = song.data
  const jobErr = job.data?.status === 'error' ? job.data.error : null
  const audioError = jobErr || (s.audio_status === 'error' ? s.audio_error || 'No se pudo descargar el audio.' : null)

  return (
    <>
      <Header
        title={s.title}
        back
        right={isAdmin && !editing && <Button variant="ghost" className="min-h-9 py-1" onClick={() => setEditing(true)}>Editar</Button>}
      />
      <Page>
        {editing ? (
          <SongForm
            song={s}
            onCancel={() => setEditing(false)}
            onSaved={(ns) => {
              refresh(ns)
              setEditing(false)
            }}
            onDelete={() => confirm('¿Borrar esta canción? También se quitará de todas las listas.') && remove.mutate()}
            deleting={remove.isPending}
          />
        ) : (
          <>
            <div className="flex gap-3">
              {s.thumbnail_url && <img src={s.thumbnail_url} alt="" className="h-20 w-20 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="text-sm text-slate-400">{s.artist || 'Sin artista'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.song_key && <Badge tone="indigo">Tono {s.song_key}</Badge>}
                  {s.bpm && <Badge>{s.bpm} BPM</Badge>}
                  {s.duration_sec && <Badge>{formatDuration(s.duration_sec)}</Badge>}
                </div>
              </div>
            </div>

            {/* Audio (se escucha con el reproductor de abajo) */}
            <Card className="mt-4">
              {s.audio_status === 'processing' && !jobErr ? (
                <div className="flex items-center gap-3 text-sm text-indigo-200">
                  <Spinner small />
                  <span>
                    {job.data ? JOB_LABEL[job.data.status] : 'Descargando audio…'}
                    {job.data?.progress != null && job.data.status === 'downloading' && ` ${Math.round(job.data.progress)}%`}
                  </span>
                </div>
              ) : hasAudio(s) ? (
                <DownloadSong song={s} />
              ) : audioError ? (
                <ErrorBox>{audioError}</ErrorBox>
              ) : (
                <p className="text-sm text-slate-400">Esta canción aún no tiene audio.</p>
              )}

              {isAdmin && s.audio_status !== 'processing' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-slate-800 px-4 text-sm font-semibold active:bg-slate-700">
                    {upload.isPending ? <Spinner small /> : s.audio_path ? 'Reemplazar MP3' : 'Sube el MP3 manualmente'}
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,.mp3"
                      className="hidden"
                      disabled={upload.isPending}
                      onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
                    />
                  </label>
                  {s.source_url && s.audio_status !== 'ready' && (
                    <Button variant="secondary" loading={retry.isPending} onClick={() => retry.mutate(s)}>
                      Reintentar descarga
                    </Button>
                  )}
                </div>
              )}
              {isAdmin && s.audio_status === 'processing' && (
                <button className="mt-2 text-xs text-slate-500 underline" onClick={() => updateSong(s.id, { audio_status: 'error', audio_error: 'Descarga cancelada.' }).then(refresh)}>
                  ¿Se quedó trabado? Cancelar
                </button>
              )}
              {upload.error && <div className="mt-2"><ErrorBox>{errorMessage(upload.error)}</ErrorBox></div>}
            </Card>

            {s.notes && (
              <Card className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Notas</p>
                <p className="whitespace-pre-line text-sm">{s.notes}</p>
              </Card>
            )}

            {/* Letra */}
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-1">
                <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Letra</h2>
                {s.lyrics?.trim() && (
                  <>
                    <button className="h-9 rounded-full px-2 text-sm font-bold text-slate-300 active:bg-slate-800" onClick={() => setTextSize(textSize - 2)} aria-label="Letra más pequeña">A−</button>
                    <button className="h-9 rounded-full px-2 text-sm font-bold text-slate-300 active:bg-slate-800" onClick={() => setTextSize(textSize + 2)} aria-label="Letra más grande">A+</button>
                  </>
                )}
                {isAdmin && (
                  <button className="ml-2 text-sm text-indigo-400" onClick={() => setLyricsOpen(true)}>
                    {s.lyrics?.trim() ? 'Buscar otra letra' : 'Buscar letra'}
                  </button>
                )}
              </div>
              {autoLyrics && <p className="mb-2 text-xs text-amber-300">{autoLyrics}</p>}
              {s.lyrics?.trim() ? (
                <p className="whitespace-pre-line leading-relaxed" style={{ fontSize: textSize }}>{s.lyrics}</p>
              ) : (
                <p className="text-sm text-slate-500">Sin letra todavía.</p>
              )}
            </div>

            {s.source_url && (
              <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-6 block truncate text-xs text-slate-500 underline">
                Origen: {s.source_url}
              </a>
            )}
            {hasAudio(s) && <div className="h-20" />}
          </>
        )}
      </Page>

      {/* Reproductor fijo sobre la barra de abajo: se escucha mientras se lee la letra. */}
      {hasAudio(s) && !editing && (
        <div className="fixed inset-x-0 bottom-[calc(55px+env(safe-area-inset-bottom))] z-20 border-t border-slate-800 bg-slate-950">
          <div className="mx-auto max-w-2xl">
            <AudioPlayer song={s} onPlayingChange={setPlaying} />
          </div>
        </div>
      )}

      {isAdmin && (
        <LyricsSearch
          open={lyricsOpen}
          onClose={() => setLyricsOpen(false)}
          title={s.title}
          artist={s.artist}
          onPick={async (lyrics) => {
            refresh(await updateSong(s.id, { lyrics }))
            setAutoLyrics(null)
            setLyricsOpen(false)
          }}
        />
      )}
    </>
  )
}

function SongForm({
  song,
  onCancel,
  onSaved,
  onDelete,
  deleting,
}: {
  song: Song
  onCancel: () => void
  onSaved: (s: Song) => void
  onDelete: () => void
  deleting: boolean
}) {
  const [v, setV] = useState({
    title: song.title,
    artist: song.artist ?? '',
    song_key: song.song_key ?? '',
    bpm: song.bpm?.toString() ?? '',
    notes: song.notes ?? '',
    lyrics: song.lyrics ?? '',
    source_url: song.source_url ?? '',
  })
  const save = useMutation({
    mutationFn: () =>
      updateSong(song.id, {
        title: v.title.trim(),
        artist: v.artist.trim() || null,
        song_key: v.song_key.trim() || null,
        bpm: v.bpm ? Number(v.bpm) : null,
        notes: v.notes.trim() || null,
        lyrics: v.lyrics.trim() || null,
        source_url: v.source_url.trim() || null,
      }),
    onSuccess: onSaved,
  })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  const bpmInvalid = v.bpm !== '' && (Number(v.bpm) < 20 || Number(v.bpm) > 400)

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Input label="Título" value={v.title} onChange={set('title')} required />
      <Input label="Artista" value={v.artist} onChange={set('artist')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Tono" placeholder="G, Am, Bb…" value={v.song_key} onChange={set('song_key')} />
        <Input label="BPM (opcional)" type="number" inputMode="numeric" value={v.bpm} onChange={set('bpm')} />
      </div>
      <Textarea label="Notas" rows={2} placeholder="Intro con piano, repetir coro 2 veces…" value={v.notes} onChange={set('notes')} />
      <Textarea label="Letra" rows={14} placeholder="Pega aquí la letra…" value={v.lyrics} onChange={set('lyrics')} />
      <Input label="Link de origen" type="url" value={v.source_url} onChange={set('source_url')} />
      {bpmInvalid && <ErrorBox>El BPM debe estar entre 20 y 400.</ErrorBox>}
      {save.error && <ErrorBox>{errorMessage(save.error)}</ErrorBox>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={save.isPending} disabled={!v.title.trim() || bpmInvalid}>Guardar</Button>
      </div>
      <Button type="button" variant="danger" className="w-full" onClick={onDelete} loading={deleting}>
        Borrar canción
      </Button>
    </form>
  )
}
