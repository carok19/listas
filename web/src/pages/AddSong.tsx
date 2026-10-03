import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createSong, updateSong, uploadSongAudio } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { downloaderConfigured, searchVideos, startDownload, wakeDownloader, type SearchResult } from '../lib/downloader'
import { formatDuration, guessTitleArtist } from '../lib/format'
import type { Song } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Button, Card, Empty, ErrorBox, Input, PageSpinner } from '../components/ui'

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
            busy={busy}
            onSubmit={async (file, title, artist) => {
              setBusy(true)
              setError(null)
              try {
                const song = await createSong(groupId, { title, artist: artist || null })
                await uploadSongAudio(song, file)
                done(song)
              } catch (e) {
                setError(errorMessage(e))
                setBusy(false)
              }
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

function UploadTab({ busy, onSubmit }: { busy: boolean; onSubmit: (file: File, title: string, artist: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (file && title.trim()) onSubmit(file, title.trim(), artist.trim())
      }}
    >
      <Card className="border border-dashed border-slate-700 text-center">
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,.mp3"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              if (f && !title) {
                const g = guessTitleArtist(f.name.replace(/\.mp3$/i, ''))
                setTitle(g.title)
                if (g.artist) setArtist(g.artist)
              }
            }}
          />
          <p className="text-3xl">🎵</p>
          <p className="mt-1 text-sm font-medium">{file ? file.name : 'Toca para elegir un MP3'}</p>
          {file && <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </label>
      </Card>
      {file && file.size > 50 * 1024 * 1024 && <ErrorBox>El archivo pesa más de 50 MB. Usa un MP3 más liviano.</ErrorBox>}
      <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Input label="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
      <Button type="submit" className="w-full" disabled={!file || !title.trim() || file.size > 50 * 1024 * 1024} loading={busy}>
        Subir canción
      </Button>
    </form>
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
