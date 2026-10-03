import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listSongs } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Badge, Button, Empty, ErrorBox, Input, PageSpinner } from '../components/ui'

export default function Songs() {
  const { groupId, isAdmin } = useGroup()
  const [q, setQ] = useState('')
  const songs = useQuery({ queryKey: ['songs', groupId], queryFn: () => listSongs(groupId) })

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (songs.data ?? []).filter(
      (s) => !n || s.title.toLowerCase().includes(n) || s.artist?.toLowerCase().includes(n) || s.lyrics?.toLowerCase().includes(n),
    )
  }, [songs.data, q])

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
        <Input placeholder="Buscar por título, artista o letra…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-3">
          {songs.isLoading ? (
            <PageSpinner />
          ) : songs.error ? (
            <ErrorBox>{errorMessage(songs.error)}</ErrorBox>
          ) : songs.data?.length === 0 ? (
            <Empty title="La biblioteca está vacía">
              {isAdmin ? 'Agrega canciones pegando un link de YouTube, buscándolas o subiendo un MP3.' : 'El director aún no agregó canciones.'}
            </Empty>
          ) : (
            <ul className="divide-y divide-slate-800">
              {filtered.map((s) => (
                <li key={s.id}>
                  <Link to={s.id} className="flex items-center gap-3 py-3 active:bg-slate-900">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg text-slate-500">♪</div>
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
