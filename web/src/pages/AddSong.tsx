import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createSong, listSongs, updateSong, uploadSongAudio } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { downloaderConfigured, searchVideos, startDownload, wakeDownloader, type SearchResult } from '../lib/downloader'
import { findLyricsAuto } from '../lib/lyrics'
import { formatDuration, guessFromFileName, guessTitleArtist, normalizeTitle } from '../lib/format'
import type { Song } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Button, Card, Empty, ErrorBox, Input, PageSpinner, Spinner } from '../components/ui'

type Tab = 'buscar' | 'link' | 'mp3' | 'manual'

export default function AddSong() {
  const { groupId, isAdmin } = useGroup()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>(downloaderConfigured ? 'buscar' : 'mp3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => wakeDownloader(), [])

  const done = (song: Song, job?: string) => {
    qc.invalidateQueries({ queryKey: ['songs', groupId] })
    navigate(`/g/${groupId}/canciones/${song.id}${job ? `?job=${job}` : ''}`, { replace: true })
  }

  /** Crea la canción y pide la descarga. Si el servicio falla, la canción queda creada con el error. */
  async function createAndDownload(url: string, meta: { title: string; artist?: string; thumbnail?: string | null; duration?: number | null }, fill: boolean) {
    setBusy(true)
    setError(null)
    let song: Song | null = null
    try {
      song = await createSong(groupId, {
        title: meta.title,
        artist: meta.artist || null,
        source_url: url,
        thumbnail_url: meta.thumbnail ?? null,
        duration_sec: meta.duration ? Math.round(meta.duration) : null,
        audio_status: 'processing',
      })
      const job = await startDownload(url, song.id, fill)
      done(song, job.id)
    } catch (e) {
      if (song) {
        await updateSong(song.id, { audio_status: 'error', audio_error: errorMessage(e) }).catch(() => {})
        done(song)
      } else {
        setError(errorMessage(e))
        setBusy(false)
      }
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
    { id: 'buscar', label: 'Buscar', disabled: !downloaderConfigured },
    { id: 'link', label: 'Link', disabled: !downloaderConfigured },
    { id: 'mp3', label: 'Subir MP3' },
    { id: 'manual', label: 'Solo letra' },
  ]

  return (
    <>
      <Header title="Agregar canción" back={`/g/${groupId}/canciones`} />
      <Page>
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-900 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              disabled={t.disabled || busy}
              onClick={() => {
                setTab(t.id)
                setError(null)
              }}
              className={`rounded-lg py-2 text-xs font-semibold disabled:opacity-30 ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!downloaderConfigured && (
          <p className="mb-3 text-xs text-amber-300">El servicio de descarga no está configurado; por ahora solo puedes subir MP3.</p>
        )}
        {error && <div className="mb-3"><ErrorBox>{error}</ErrorBox></div>}

        {tab === 'buscar' && <SearchTab busy={busy} onPick={(r) => {
          const g = guessTitleArtist(r.title, r.channel)
          createAndDownload(r.url, { title: g.title || r.title, artist: g.artist, thumbnail: r.thumbnail, duration: r.duration }, false)
        }} />}
        {tab === 'link' && <LinkTab busy={busy} onSubmit={(url) => createAndDownload(url, { title: 'Descargando…' }, true)} />}
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
      setResults(await searchVideos(q.trim()))
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
        <Input placeholder="Nombre de la canción y artista" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Button type="submit" loading={loading} disabled={busy}>Buscar</Button>
      </form>
      <p className="mt-2 text-xs text-slate-500">La primera búsqueda puede tardar ~1 minuto si el servidor estaba dormido.</p>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
      {loading && <PageSpinner />}
      {results && !loading && (
        <div className="mt-3 space-y-2">
          {results.length === 0 && <Empty title="Sin resultados">Prueba con otras palabras o pega el link directamente.</Empty>}
          {results.map((r) => (
            <button
              key={r.id}
              disabled={busy}
              onClick={() => {
                setPicked(r.id)
                onPick(r)
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-slate-900 p-2 text-left active:bg-slate-800 disabled:opacity-50"
            >
              {r.thumbnail ? (
                <img src={r.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="h-16 w-28 shrink-0 rounded-lg bg-slate-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {r.channel} {r.duration ? `· ${formatDuration(r.duration)}` : ''}
                </p>
                {picked === r.id && busy && <p className="text-xs text-indigo-300">Enviando a descargar…</p>}
              </div>
            </button>
          ))}
        </div>
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
      <Input label="Link de YouTube u otro sitio" type="url" inputMode="url" placeholder="https://youtu.be/…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <p className="text-xs text-slate-400">Se descarga solo el audio en MP3. El título y artista se completan solos; luego puedes editarlos.</p>
      <Button type="submit" className="w-full" disabled={!valid} loading={busy}>
        Descargar audio
      </Button>
    </form>
  )
}

const MAX_MP3_BYTES = 50 * 1024 * 1024

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

  const ready = (it: UploadItem) => it.status !== 'done' && it.title.trim() && it.file.size <= MAX_MP3_BYTES
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
        const song = it.song ?? (await createSong(groupId, { title: it.title.trim(), artist: it.artist.trim() || null }))
        update(it.key, { song })
        let saved = await uploadSongAudio(song, it.file)
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
      <Card className="border border-dashed border-slate-700 text-center">
        <label className={`block ${running ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="file"
            multiple
            accept="audio/mpeg,audio/mp3,.mp3"
            className="hidden"
            disabled={running}
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="text-3xl">🎵</p>
          <p className="mt-1 text-sm font-medium">{items.length ? 'Agregar más MP3' : 'Toca para elegir uno o varios MP3'}</p>
          <p className="text-xs text-slate-500">Puedes seleccionar varias canciones a la vez (máximo 50 MB cada una).</p>
        </label>
      </Card>

      {items.map((it) => {
        const tooBig = it.file.size > MAX_MP3_BYTES
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
                  className="h-8 w-8 shrink-0 rounded-full text-lg text-slate-500 active:bg-slate-800"
                  aria-label="Quitar de la lista"
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
                  <span className={`ml-2 text-xs ${it.lyricsFound ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {it.lyricsFound ? 'con letra' : 'sin letra'}
                  </span>
                )}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  placeholder="Título"
                  aria-label="Título"
                  value={it.title}
                  disabled={locked}
                  onChange={(e) => update(it.key, { title: e.target.value })}
                />
                <Input
                  placeholder="Artista"
                  aria-label="Artista"
                  value={it.artist}
                  disabled={locked}
                  onChange={(e) => update(it.key, { artist: e.target.value })}
                />
              </div>
            )}
            {it.status === 'uploading' && <p className="mt-1 text-xs text-indigo-300">Subiendo…</p>}
            {it.status === 'lyrics' && <p className="mt-1 text-xs text-indigo-300">Buscando la letra…</p>}
            {tooBig && <p className="mt-1 text-xs text-red-300">Pesa más de 50 MB. Usa un MP3 más liviano.</p>}
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
