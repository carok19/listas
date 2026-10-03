import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteSong, getSong, signedAudioUrl, updateSong, uploadSongAudio } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { getJob, startDownload, type Job } from '../lib/downloader'
import { searchLyrics, type LyricsMatch } from '../lib/lrclib'
import { formatDuration } from '../lib/format'
import type { Song } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Badge, Button, Card, ErrorBox, Input, Modal, PageSpinner, Spinner, Textarea } from '../components/ui'

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

  // Letra automática desde LRCLIB cuando la canción no tiene letra.
  useEffect(() => {
    const s = song.data
    if (!s || !isAdmin || triedLyrics.current || s.lyrics?.trim() || s.audio_status === 'processing') return
    triedLyrics.current = true
    searchLyrics(s.title, s.artist)
      .then(async (matches) => {
        if (!matches[0]) {
          setAutoLyrics('No encontramos la letra automáticamente. Puedes pegarla con "Editar".')
          return
        }
        refresh(await updateSong(s.id, { lyrics: matches[0].lyrics }))
        setAutoLyrics(`Letra encontrada en LRCLIB (${matches[0].artist} – ${matches[0].title}). Revisa que sea la correcta.`)
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

            {/* Audio */}
            <Card className="mt-4">
              {s.audio_status === 'processing' && !jobErr ? (
                <div className="flex items-center gap-3 text-sm text-indigo-200">
                  <Spinner small />
                  <span>
                    {job.data ? JOB_LABEL[job.data.status] : 'Descargando audio…'}
                    {job.data?.progress != null && job.data.status === 'downloading' && ` ${Math.round(job.data.progress)}%`}
                  </span>
                </div>
              ) : s.audio_status === 'ready' && s.audio_path ? (
                <AudioPreview path={s.audio_path} version={s.updated_at} />
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
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Letra</h2>
                {isAdmin && (
                  <button className="text-sm text-indigo-400" onClick={() => setLyricsOpen(true)}>
                    Buscar en LRCLIB
                  </button>
                )}
              </div>
              {autoLyrics && <p className="mb-2 text-xs text-amber-300">{autoLyrics}</p>}
              {s.lyrics?.trim() ? (
                <p className="whitespace-pre-line text-lg leading-relaxed">{s.lyrics}</p>
              ) : (
                <p className="text-sm text-slate-500">Sin letra todavía.</p>
              )}
            </div>

            {s.source_url && (
              <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-6 block truncate text-xs text-slate-500 underline">
                Origen: {s.source_url}
              </a>
            )}
          </>
        )}
      </Page>

      <LyricsSearch
        open={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        song={s}
        onPick={async (m) => {
          refresh(await updateSong(s.id, { lyrics: m.lyrics }))
          setAutoLyrics(null)
          setLyricsOpen(false)
        }}
      />
    </>
  )
}

function AudioPreview({ path, version }: { path: string; version: string }) {
  const url = useQuery({ queryKey: ['audio-url', path, version], queryFn: () => signedAudioUrl(path), staleTime: 60 * 60 * 1000 })
  if (url.error) return <ErrorBox>{errorMessage(url.error)}</ErrorBox>
  if (!url.data) return <Spinner small />
  return <audio controls preload="metadata" src={url.data} className="w-full" />
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

function LyricsSearch({ open, onClose, song, onPick }: { open: boolean; onClose: () => void; song: Song; onPick: (m: LyricsMatch) => Promise<void> }) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist ?? '')
  const [results, setResults] = useState<LyricsMatch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(song.title)
      setArtist(song.artist ?? '')
      setResults(null)
      setPreview(null)
    }
  }, [open, song.title, song.artist])

  return (
    <Modal open={open} onClose={onClose} title="Buscar letra">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setLoading(true)
          setError(null)
          try {
            setResults(await searchLyrics(title, artist))
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setLoading(false)
          }
        }}
      >
        <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <Button type="submit" className="w-full" loading={loading}>Buscar</Button>
      </form>
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
      {results && (
        <div className="mt-3 space-y-2">
          {results.length === 0 && <p className="text-sm text-slate-400">No se encontró. Puedes pegar la letra con "Editar".</p>}
          {results.map((r, i) => (
            <Card key={i} className="bg-slate-950">
              <button className="w-full text-left" onClick={() => setPreview(preview === i ? null : i)}>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-slate-400">{r.artist}</p>
              </button>
              {preview === i && <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-300">{r.lyrics}</p>}
              <Button className="mt-2 w-full" variant="secondary" onClick={() => onPick(r)}>Usar esta letra</Button>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  )
}
