import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listSongs } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { foldText } from '../lib/format'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Badge, Button, Empty, ErrorBox, Input, PageSpinner } from '../components/ui'

export default function Songs() {
  const { groupId, isAdmin } = useGroup()
  const [q, setQ] = useState('')
  const songs = useQuery({ queryKey: ['songs', groupId], queryFn: () => listSongs(groupId) })

  // Texto de búsqueda de cada canción, sin acentos, calculado una sola vez.
  const searchable = useMemo(
    () => (songs.data ?? []).map((s) => ({ song: s, text: foldText(`${s.title}\n${s.artist ?? ''}\n${s.lyrics ?? ''}`) })),
    [songs.data],
  )
  const filtered = useMemo(() => {
    const n = foldText(q.trim())
    return searchable.filter((x) => !n || x.text.includes(n)).map((x) => x.song)
  }, [searchable, q])

  return (
    <>
      <Header
        title="Canciones"
        right={
          isAdmin && (
            <Link to="nueva">
              <Button className="min-h-9 py-1">+ Agregar</Button>
            </Link>
          )
        }
      />
      <Page>
        <Input
          type="search"
          aria-label="Buscar canciones"
          placeholder="Buscar por título, artista o letra…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-3">
          {songs.isLoading ? (
            <PageSpinner />
          ) : songs.error ? (
            <ErrorBox>{errorMessage(songs.error)}</ErrorBox>
          ) : songs.data?.length === 0 ? (
            <Empty title="La biblioteca está vacía">
              {isAdmin ? 'Toca "+ Agregar" para buscarlas en YouTube o subir tus MP3 (varios a la vez). La letra se busca sola.' : 'El director aún no agregó canciones.'}
            </Empty>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Ninguna canción coincide con «{q.trim()}».</p>
          ) : (
            <ul className="divide-y divide-slate-800" aria-label={`${filtered.length} canciones`}>
              {filtered.map((s) => (
                <li key={s.id}>
                  <Link to={s.id} className="flex items-center gap-3 py-3 active:bg-slate-900">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg text-slate-400">♪</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.title}</p>
                      <p className="truncate text-xs text-slate-400">{s.artist || 'Sin artista'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {s.song_key && <Badge tone="indigo">{s.song_key}</Badge>}
                      {s.audio_status === 'processing' && <Badge tone="amber">descargando</Badge>}
                      {s.audio_status === 'error' && <Badge tone="red">sin audio</Badge>}
                      {!s.lyrics && <Badge>sin letra</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Page>
    </>
  )
}
