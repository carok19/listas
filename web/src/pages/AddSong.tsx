import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createSong, deleteSong, listSongs, updateSong, uploadSongAudio } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { wakeDownloader, type SearchResult } from '../lib/downloader'
import { addSongFromVideo, type Progress, type VideoMeta } from '../lib/addFromVideo'
import { isCanceled, searchYouTube, youtubeAvailable, youtubeOnDevice } from '../lib/youtube'
import { findLyricsAuto } from '../lib/lyrics'
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, audioExtension } from '../lib/audioFormat'
import { formatDuration, guessFromFileName, guessTitleArtist, normalizeTitle } from '../lib/format'
import type { Song } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Button, Card, Empty, ErrorBox, Input, PageSpinner, Spinner } from '../components/ui'

type Tab = 'youtube' | 'mp3' | 'link' | 'manual'

export default function AddSong() {
  const { groupId, isAdmin } = useGroup()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>(youtubeOnDevice ? 'youtube' : 'mp3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)

  // Si la persona salió de la pantalla mientras se descargaba, no la llevamos de vuelta.
  const onScreen = useRef(true)
  useEffect(() => {
    onScreen.current = true
    if (!youtubeOnDevice) wakeDownloader()
    return () => {
      onScreen.current = false
    }
  }, [])

  const done = (song: Song) => {
    qc.invalidateQueries({ queryKey: ['songs', groupId] })
    if (onScreen.current) navigate(`/g/${groupId}/canciones/${song.id}`, { replace: true })
  }

  async function addFromVideo(url: string, meta?: VideoMeta) {
    setBusy(true)
    setError(null)
    try {
      done(await addSongFromVideo(groupId, url, meta, setProgress))
    } catch (e) {
      if (!isCanceled(e)) setError(errorMessage(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  if (!isAdmin) {
    return (
      <>
        <Header title="Agregar canción" back />
        <Page>
          <ErrorBox>Solo el administrador del grupo puede agregar canciones.</ErrorBox>
        </Page>
      </>
    )
  }

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'youtube', label: 'YouTube', disabled: !youtubeAvailable },
    { id: 'mp3', label: 'Subir MP3' },
    { id: 'link', label: 'Link', disabled: !youtubeAvailable },
    { id: 'manual', label: 'Solo letra' },
  ]

  return (
    <>
      <Header title="Agregar canción" back={`/g/${groupId}/canciones`} />
      <Page>
        <div role="tablist" aria-label="Cómo agregar la canción" className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-900 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="add-panel"
              disabled={t.disabled || busy}
              onClick={() => {
                setTab(t.id)
                setError(null)
              }}
              className={`min-h-11 rounded-lg text-xs font-semibold disabled:opacity-30 ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!youtubeAvailable && (
          <p className="mb-3 text-xs text-amber-300">La descarga desde YouTube no está disponible en esta versión; sube el audio.</p>
        )}

        {progress && (
          <Card className="mb-4">
            <div role="status" aria-live="polite" className="flex items-center gap-3">
              <Spinner small />
              <p className="flex-1 text-sm">
                {progress.label}
                {progress.percent != null && ` ${Math.round(progress.percent)}%`}
              </p>
              {progress.cancel && (
                <Button variant="ghost" className="min-h-9 py-1" onClick={progress.cancel}>
                  Cancelar
                </Button>
              )}
            </div>
            {progress.percent != null && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden>
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }} />
              </div>
            )}
          </Card>
        )}

        {error && (
          <div className="mb-3">
            <ErrorBox
              action={
                tab !== 'mp3' && (
                  <Button variant="secondary" onClick={() => { setTab('mp3'); setError(null) }}>
                    Subir el audio en su lugar
                  </Button>
                )
              }
            >
              {error}
            </ErrorBox>
          </div>
        )}

        <div id="add-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'youtube' && (
            <SearchTab
              busy={busy}
              onPick={(r) => {
                const g = guessTitleArtist(r.title, r.channel)
                addFromVideo(r.url, { title: g.title || r.title, artist: g.artist, thumbnail: r.thumbnail, duration: r.duration })
              }}
            />
          )}
          {tab === 'link' && <LinkTab busy={busy} onSubmit={(url) => addFromVideo(url)} />}
          {tab === 'mp3' && (
            <UploadTab
              groupId={groupId}
              onBusy={setBusy}
              onFinished={(uploaded, total) => {
                qc.invalidateQueries({ queryKey: ['songs', groupId] })
                if (total === 1 && uploaded[0]) done(uploaded[0])
              }}
            />
          )}
          {tab === 'manual' && (
            <ManualTab
              busy={busy}
              onSubmit={async (title, artist) => {
                setBusy(true)
                setError(null)
                try {
                  done(await createSong(groupId, { title, artist: artist || null }))
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            />
          )}
        </div>
      </Page>
    </>
  )
}

function SearchTab({ busy, onPick }: { busy: boolean; onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      setResults(await searchYouTube(q.trim()))
    } catch (err) {
      setError(errorMessage(err))
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <Input aria-label="Buscar en YouTube" placeholder="Nombre de la canción y artista" value={q} onChange={(e) => setQ(e.target.value)} autoFocus enterKeyHint="search" />
        <Button type="submit" loading={loading} disabled={busy}>Buscar</Button>
      </form>
      <p className="mt-2 text-xs text-slate-400">
        {youtubeOnDevice
          ? 'Toca un resultado: el audio se descarga en tu celular, se guarda en el grupo y se busca la letra. La primera vez tarda un poco más.'
          : 'La primera búsqueda puede tardar ~1 minuto si el servidor estaba dormido.'}
      </p>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
      {loading && <PageSpinner />}
      {results && !loading && (
        <ul className="mt-3 space-y-2">
          {results.length === 0 && <Empty title="Sin resultados">Prueba con otras palabras o pega el link en la pestaña Link.</Empty>}
          {results.map((r) => (
            <li key={r.id}>
              <button
                disabled={busy}
                onClick={() => {
                  setPicked(r.id)
                  onPick(r)
                }}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-slate-800 disabled:opacity-50 ${picked === r.id && busy ? 'bg-indigo-500/15 ring-1 ring-indigo-500' : 'bg-slate-900'}`}
              >
                {r.thumbnail ? (
                  <img
                    src={r.thumbnail}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded-lg bg-slate-800 object-cover"
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                ) : (
                  <div className="h-16 w-28 shrink-0 rounded-lg bg-slate-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    {r.channel} {r.duration ? `· ${formatDuration(r.duration)}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LinkTab({ busy, onSubmit }: { busy: boolean; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim())
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(url.trim())
      }}
    >
      <Input label="Link del video o canción" type="url" inputMode="url" placeholder="https://youtu.be/…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <p className="text-xs text-slate-400">
        Se descarga solo el audio. Funciona con YouTube, SoundCloud, Facebook, Instagram y otros sitios de video. El título y el artista se completan solos y luego puedes editarlos.
      </p>
      <Button type="submit" className="w-full" disabled={!valid} loading={busy}>
        Descargar audio
      </Button>
    </form>
  )
}

interface UploadItem {
  key: string
  file: File
  title: string
  artist: string
  status: 'pending' | 'uploading' | 'lyrics' | 'done' | 'error'
  error?: string
  song?: Song
  lyricsFound?: boolean
}

function UploadTab({
  groupId,
  onBusy,
  onFinished,
}: {
  groupId: string
  onBusy: (busy: boolean) => void
  onFinished: (uploaded: Song[], total: number) => void
}) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [autoLyrics, setAutoLyrics] = useState(true)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const library = useQuery({ queryKey: ['songs', groupId], queryFn: () => listSongs(groupId) })
  const existing = useMemo(() => new Set((library.data ?? []).map((s) => normalizeTitle(s.title))), [library.data])

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  function addFiles(list: FileList | null) {
    const files = [...(list ?? [])]
    setFinished(false)
    setItems((cur) => [
      ...cur,
      ...files
        .filter((f) => !cur.some((it) => it.file.name === f.name && it.file.size === f.size))
        .map((file, i) => {
          const g = guessFromFileName(file.name)
          return { key: `${Date.now()}-${i}-${file.name}`, file, title: g.title, artist: g.artist, status: 'pending' as const }
        }),
    ])
  }

  const usable = (f: File) => f.size <= MAX_AUDIO_BYTES && audioExtension(f) !== null
  const ready = (it: UploadItem) => it.status !== 'done' && it.title.trim() && usable(it.file)
  const toUpload = items.filter(ready)
  const doneCount = items.filter((it) => it.status === 'done').length
  const errorCount = items.filter((it) => it.status === 'error').length

  async function uploadAll() {
    setRunning(true)
    setFinished(false)
    onBusy(true)
    const uploaded: Song[] = []
    for (const it of toUpload) {
      update(it.key, { status: 'uploading', error: undefined })
      try {
        const song = await createSong(groupId, { title: it.title.trim(), artist: it.artist.trim() || null })
        let saved: Song
        try {
          saved = await uploadSongAudio(song, it.file)
        } catch (e) {
          // Sin audio no sirve: no dejarla en la biblioteca.
          await deleteSong(song).catch(() => {})
          throw e
        }
        if (autoLyrics) {
          update(it.key, { status: 'lyrics' })
          const found = await findLyricsAuto(saved.title, saved.artist).catch(() => null)
          if (found) saved = await updateSong(song.id, { lyrics: found.lyrics }).catch(() => saved)
          update(it.key, { lyricsFound: Boolean(found) })
        }
        update(it.key, { status: 'done', song: saved })
        uploaded.push(saved)
      } catch (e) {
        update(it.key, { status: 'error', error: errorMessage(e) })
      }
    }
    setRunning(false)
    setFinished(true)
    onBusy(false)
    onFinished(uploaded, items.length)
  }

  return (
    <div className="space-y-3">
      <Card className="border border-dashed border-slate-700 text-center focus-within:ring-2 focus-within:ring-indigo-400">
        <label className={`block ${running ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="file"
            multiple
            accept={AUDIO_ACCEPT}
            className="sr-only"
            disabled={running}
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="text-3xl" aria-hidden>🎵</p>
          <p className="mt-1 text-sm font-medium">{items.length ? 'Agregar más canciones' : 'Toca para elegir una o varias canciones'}</p>
          <p className="text-xs text-slate-400">MP3 o M4A (también OGG y WAV), varias a la vez, hasta 50 MB cada una.</p>
        </label>
      </Card>

      {items.map((it) => {
        const tooBig = it.file.size > MAX_AUDIO_BYTES
        const notAudio = audioExtension(it.file) === null
        const locked = running || it.status === 'done'
        return (
          <Card key={it.key} className="p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-5 shrink-0 text-center">
                {it.status === 'uploading' || it.status === 'lyrics' ? (
                  <Spinner small />
                ) : it.status === 'done' ? (
                  <span className="text-emerald-400">✓</span>
                ) : it.status === 'error' ? (
                  <span className="text-red-400">!</span>
                ) : (
                  '♪'
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {it.file.name} · {(it.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              {!locked && (
                <button
                  className="h-10 w-10 shrink-0 rounded-full text-lg text-slate-400 active:bg-slate-800"
                  aria-label={`Quitar ${it.file.name} de la lista`}
                  onClick={() => setItems((cur) => cur.filter((x) => x.key !== it.key))}
                >
                  ×
                </button>
              )}
            </div>
            {it.status === 'done' ? (
              <p className="mt-1 text-sm">
                <span className="font-medium">{it.song?.title ?? it.title}</span>
                {(it.song?.artist ?? it.artist) && <span className="text-slate-400"> · {it.song?.artist ?? it.artist}</span>}
                {autoLyrics && it.lyricsFound !== undefined && (
                  <span className={`ml-2 text-xs ${it.lyricsFound ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {it.lyricsFound ? 'con letra' : 'sin letra'}
                  </span>
                )}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  placeholder="Título"
                  aria-label={`Título de ${it.file.name}`}
                  value={it.title}
                  disabled={locked}
                  onChange={(e) => update(it.key, { title: e.target.value })}
                />
                <Input
                  placeholder="Artista"
                  aria-label={`Artista de ${it.file.name}`}
                  value={it.artist}
                  disabled={locked}
                  onChange={(e) => update(it.key, { artist: e.target.value })}
                />
              </div>
            )}
            {it.status === 'uploading' && <p className="mt-1 text-xs text-indigo-300">Subiendo…</p>}
            {it.status === 'lyrics' && <p className="mt-1 text-xs text-indigo-300">Buscando la letra…</p>}
            {notAudio && <p className="mt-1 text-xs text-red-300">No es un archivo de audio (usa MP3 o M4A). Quítalo de la lista.</p>}
            {!notAudio && tooBig && <p className="mt-1 text-xs text-red-300">Pesa más de 50 MB. Usa un audio más liviano.</p>}
            {it.status === 'pending' && existing.has(normalizeTitle(it.title)) && (
              <p className="mt-1 text-xs text-amber-300">Ya hay una canción con este título en la biblioteca.</p>
            )}
            {it.error && <p className="mt-1 text-xs text-red-300">{it.error}</p>}
          </Card>
        )
      })}

      {items.length > 0 && (
        <>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-5 w-5 accent-indigo-500"
              checked={autoLyrics}
              disabled={running}
              onChange={(e) => setAutoLyrics(e.target.checked)}
            />
            Buscar la letra de cada una (letras.com y LRCLIB)
          </label>
          {toUpload.length > 0 && (
            <Button className="w-full" onClick={uploadAll} loading={running}>
              {running
                ? `Subiendo… (${doneCount} de ${doneCount + toUpload.length})`
                : toUpload.length === 1
                  ? errorCount ? 'Reintentar' : 'Subir canción'
                  : `${errorCount ? 'Reintentar y subir' : 'Subir'} ${toUpload.length} canciones`}
            </Button>
          )}
        </>
      )}

      {finished && items.length > 1 && (
        <Card className="text-center">
          <p className="font-semibold">
            ✓ {doneCount} de {items.length} {items.length === 1 ? 'canción subida' : 'canciones subidas'}
          </p>
          {errorCount > 0 && <p className="mt-1 text-xs text-red-300">{errorCount} con error: revisa el mensaje y toca "Reintentar".</p>}
          <Link to={`/g/${groupId}/canciones`} replace>
            <Button className="mt-3 w-full">Ver canciones</Button>
          </Link>
        </Card>
      )}
    </div>
  )
}

function ManualTab({ busy, onSubmit }: { busy: boolean; onSubmit: (title: string, artist: string) => void }) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) onSubmit(title.trim(), artist.trim())
      }}
    >
      <p className="text-sm text-slate-400">Crea la canción sin audio. Buscaremos la letra automáticamente y podrás agregar el audio después.</p>
      <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      <Input label="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
      <Button type="submit" className="w-full" disabled={!title.trim()} loading={busy}>
        Crear canción
      </Button>
    </form>
  )
}
