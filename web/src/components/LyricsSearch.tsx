import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/supabase'
import { loadOption, lyricsFromClipboard, openLyricsSearch, openPage, searchAllLyrics, SOURCE_LABEL, type LyricsOption } from '../lib/lyrics'
import { Badge, Button, Card, ErrorBox, Input, Modal, Spinner } from './ui'

type Loaded = { loading?: boolean; lyrics?: string; error?: string }

export function LyricsSearch({
  open,
  onClose,
  title: initialTitle,
  artist: initialArtist,
  onPick,
}: {
  open: boolean
  onClose: () => void
  title: string
  artist: string | null
  onPick: (lyrics: string) => Promise<void>
}) {
  const [title, setTitle] = useState(initialTitle)
  const [artist, setArtist] = useState(initialArtist ?? '')
  const [results, setResults] = useState<LyricsOption[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const [pasted, setPasted] = useState<{ lyrics?: string; error?: string; loading?: boolean; fromUrl?: string }>({})
  const [saving, setSaving] = useState(false)
  const searchId = useRef(0)

  async function search(t = title, a = artist) {
    if (!t.trim()) return
    const id = ++searchId.current
    setSearching(true)
    setError(null)
    setExpanded(null)
    try {
      const { options, failed } = await searchAllLyrics(t.trim(), a.trim() || null)
      if (id !== searchId.current) return
      setResults(options)
      if (failed) setError('No se pudo buscar ahora (¿sin internet?). Prueba con Google y pega la letra.')
    } catch (e) {
      if (id === searchId.current) setError(errorMessage(e))
    } finally {
      if (id === searchId.current) setSearching(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle)
    setArtist(initialArtist ?? '')
    setResults(null)
    setLoaded({})
    setPasted({})
    search(initialTitle, initialArtist ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function toggle(option: LyricsOption) {
    if (expanded === option.id) return setExpanded(null)
    setExpanded(option.id)
    if (option.lyrics || loaded[option.id]?.lyrics || loaded[option.id]?.loading) return
    setLoaded((l) => ({ ...l, [option.id]: { loading: true } }))
    try {
      const lyrics = await loadOption(option)
      setLoaded((l) => ({ ...l, [option.id]: { lyrics } }))
    } catch (e) {
      setLoaded((l) => ({ ...l, [option.id]: { error: errorMessage(e) } }))
    }
  }

  async function paste() {
    setPasted({ loading: true })
    try {
      setPasted(await lyricsFromClipboard())
    } catch (e) {
      setPasted({ error: errorMessage(e) })
    }
  }

  async function use(lyrics: string) {
    setSaving(true)
    try {
      await onPick(lyrics)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Buscar letra">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <Input aria-label="Título" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input aria-label="Artista" placeholder="Artista (ayuda a encontrarla)" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <Button type="submit" className="w-full" loading={searching} disabled={!title.trim()}>
          Buscar en letras.com y LRCLIB
        </Button>
      </form>

      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}

      {results && !searching && (
        <div className="mt-3 space-y-2">
          {results.length === 0 && <p className="text-sm text-slate-400">No la encontramos. Prueba otro título, o búscala en Google y pégala.</p>}
          {results.map((r) => {
            const state = loaded[r.id] ?? {}
            const lyrics = r.lyrics ?? state.lyrics
            const isOpen = expanded === r.id
            return (
              <Card key={r.id} className="bg-slate-950 p-3">
                <button className="flex w-full items-start gap-2 text-left" onClick={() => toggle(r)} aria-expanded={isOpen}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-slate-400">{r.artist || 'Artista desconocido'}</p>
                  </div>
                  <Badge tone={r.source === 'letras' ? 'indigo' : 'slate'}>{SOURCE_LABEL[r.source]}</Badge>
                  <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className="mt-2">
                    {state.loading && (
                      <p className="flex items-center gap-2 text-sm text-slate-400"><Spinner small /> Leyendo la letra…</p>
                    )}
                    {state.error && (
                      <ErrorBox action={r.url && <Button variant="secondary" onClick={() => openPage(r.url!)}>Abrir la página</Button>}>
                        {state.error}
                      </ErrorBox>
                    )}
                    {lyrics && (
                      <>
                        <p className="max-h-56 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-900 p-2 text-sm text-slate-300">{lyrics}</p>
                        <Button className="mt-2 w-full" variant="secondary" loading={saving} onClick={() => use(lyrics)}>
                          Usar esta letra
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="text-sm font-semibold">¿No aparece? Búscala en internet</p>
        <p className="mt-1 text-xs text-slate-400">
          Se abre el navegador: copia la letra (o el link de la página), vuelve aquí y toca "Pegar lo copiado".
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!title.trim()} onClick={() => openLyricsSearch(title.trim(), artist.trim())}>
            🔎 Google
          </Button>
          <Button variant="secondary" disabled={!title.trim()} onClick={() => openLyricsSearch(title.trim(), artist.trim(), 'letras.com')}>
            🔎 letras.com
          </Button>
        </div>
        <Button className="mt-2 w-full" loading={pasted.loading} onClick={paste}>
          📋 Pegar lo copiado
        </Button>
        {pasted.error && <div className="mt-2"><ErrorBox>{pasted.error}</ErrorBox></div>}
        {pasted.lyrics && (
          <Card className="mt-2 bg-slate-950 p-3">
            {pasted.fromUrl && <p className="mb-1 truncate text-xs text-slate-400">Leída de {pasted.fromUrl}</p>}
            <p className="max-h-56 overflow-y-auto whitespace-pre-line text-sm text-slate-300">{pasted.lyrics}</p>
            <Button className="mt-2 w-full" variant="secondary" loading={saving} onClick={() => use(pasted.lyrics!)}>
              Usar esta letra
            </Button>
          </Card>
        )}
      </div>
    </Modal>
  )
}
