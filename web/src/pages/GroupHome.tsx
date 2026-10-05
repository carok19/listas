import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getNextSetlist } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { formatServiceDate } from '../lib/format'
import { shareInvite } from '../lib/invite'
import { WEB_URL } from '../lib/platform'
import { useGroup } from '../hooks/useGroup'
import { GroupsLink, Header, Page } from '../components/Layout'
import { Button, Card, Empty, ErrorBox, PageSpinner } from '../components/ui'
import { SongRowInfo } from '../components/SetlistSongs'

export default function GroupHome() {
  const { groupId, group, isAdmin, error } = useGroup()
  const next = useQuery({ queryKey: ['next-setlist', groupId], queryFn: () => getNextSetlist(groupId) })

  return (
    <>
      <Header title={group?.name ?? 'Grupo'} right={<GroupsLink />} />
      <Page>
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Próxima lista</h2>
        {next.isLoading ? (
          <PageSpinner />
        ) : next.error ? (
          <ErrorBox>{errorMessage(next.error)}</ErrorBox>
        ) : !next.data ? (
          <Empty title="No hay listas próximas">
            {isAdmin ? (
              <Link to={`/g/${groupId}/listas?nueva=1`}>
                <Button className="mt-2">Crear lista</Button>
              </Link>
            ) : (
              'Cuando el director cree la lista del próximo servicio aparecerá aquí.'
            )}
          </Empty>
        ) : (
          <Card>
            <p className="text-xs capitalize text-indigo-300">{formatServiceDate(next.data.service_date)}</p>
            <p className="text-xl font-bold">{next.data.title}</p>
            {next.data.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-400">{next.data.notes}</p>}
            <ul className="mt-3 space-y-2">
              {next.data.setlist_songs.map((item, i) => (
                <li key={item.id}>
                  <Link to={`/g/${groupId}/canciones/${item.song_id}`} className="flex rounded-xl bg-slate-950/50 p-2 active:bg-slate-800">
                    <SongRowInfo item={item} index={i} />
                  </Link>
                </li>
              ))}
              {next.data.setlist_songs.length === 0 && <li className="text-sm text-slate-500">Aún no tiene canciones.</li>}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link to={`/g/${groupId}/listas/${next.data.id}/presentar`}>
                <Button className="w-full" disabled={!next.data.setlist_songs.length}>▶ Ensayar</Button>
              </Link>
              <Link to={`/g/${groupId}/listas/${next.data.id}`}>
                <Button variant="secondary" className="w-full">Ver lista</Button>
              </Link>
            </div>
          </Card>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link to={`/g/${groupId}/canciones`}>
            <Card className="text-center active:bg-slate-800">
              <p className="text-2xl">♪</p>
              <p className="text-sm font-medium">Canciones</p>
            </Card>
          </Link>
          <Link to={`/g/${groupId}/listas`}>
            <Card className="text-center active:bg-slate-800">
              <p className="text-2xl">☰</p>
              <p className="text-sm font-medium">Todas las listas</p>
            </Card>
          </Link>
        </div>

        {isAdmin && group && (
          <Card className="mt-6">
            <p className="font-semibold">Invita a tu equipo</p>
            <p className="mt-1 text-xs text-slate-400">
              Les llega {WEB_URL ? 'el link de la app' : 'el link para descargar la app (Android)'} y el código{' '}
              <span className="font-mono font-bold text-indigo-300">{group.invite_code}</span>. Así ven las canciones y listas, y descargan los MP3.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="bg-emerald-600! active:bg-emerald-700!" onClick={() => shareInvite(group)}>
                WhatsApp
              </Button>
              <Link to={`/g/${groupId}/ajustes`}>
                <Button variant="secondary" className="w-full">QR y más</Button>
              </Link>
            </div>
          </Card>
        )}
      </Page>
    </>
  )
}
