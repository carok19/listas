import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createGroup, joinGroup, listMyGroups } from '../lib/api'
import { errorMessage, supabase } from '../lib/supabase'
import { listSavedSetlists, removeExpiredSetlists, removeSavedSetlist } from '../lib/offline'
import { formatServiceDate } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { Header, Page, UpdateNotice } from '../components/Layout'
import { Badge, Button, Card, Empty, ErrorBox, Input, Modal, PageSpinner } from '../components/ui'

export default function Groups() {
  const { user } = useAuth()
  const online = useOnline()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const groups = useQuery({ queryKey: ['groups', user?.id], queryFn: () => listMyGroups(user!.id), enabled: !!user })
  const saved = useQuery({
    queryKey: ['saved-setlists'],
    queryFn: async () => {
      await removeExpiredSetlists()
      return listSavedSetlists()
    },
  })
  const unsave = useMutation({
    mutationFn: removeSavedSetlist,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['saved-setlists'] })
      qc.invalidateQueries({ queryKey: ['saved', id] })
    },
  })

  const create = useMutation({
    mutationFn: () => createGroup(name.trim()),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/g/${g.id}`)
    },
  })
  const join = useMutation({
    mutationFn: () => joinGroup(code.trim()),
    onSuccess: (gid) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/g/${gid}`)
    },
  })

  return (
    <>
      <Header
        title="Mis grupos"
        right={
          <button onClick={() => supabase.auth.signOut()} className="rounded-full px-3 py-1.5 text-sm text-slate-400 active:bg-slate-800">
            Salir
          </button>
        }
      />
      <Page>
        <UpdateNotice />
        {groups.isLoading && online ? (
          <PageSpinner />
        ) : groups.error && online ? (
          <ErrorBox>{errorMessage(groups.error)}</ErrorBox>
        ) : (
          <div className="space-y-3">
            {groups.data?.length === 0 && (
              <Empty title="Aún no estás en ningún grupo">Crea uno para tu ministerio o únete con el código que te compartieron.</Empty>
            )}
            {groups.data?.map((g) => (
              <Link key={g.id} to={`/g/${g.id}`} className="block">
                <Card className="flex items-center justify-between active:bg-slate-800">
                  <div>
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-slate-400">Código: {g.invite_code}</p>
                  </div>
                  <Badge tone={g.role === 'admin' ? 'indigo' : 'slate'}>{g.role === 'admin' ? 'Admin' : 'Miembro'}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {online && (
          <div className="mt-6 space-y-4">
            <Card>
              <p className="mb-2 font-semibold">Unirme con código</p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  join.mutate()
                }}
              >
                <Input
                  aria-label="Código del grupo (6 letras o números)"
                  placeholder="ABC123"
                  value={code}
                  maxLength={6}
                  autoCapitalize="characters"
                  className="text-center font-mono text-lg uppercase tracking-widest"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <Button type="submit" disabled={code.trim().length < 6} loading={join.isPending}>
                  Unirme
                </Button>
              </form>
              {join.error && <div className="mt-2"><ErrorBox>{errorMessage(join.error)}</ErrorBox></div>}
            </Card>
            <Button variant="secondary" className="w-full" onClick={() => setCreateOpen(true)}>
              + Crear un grupo nuevo
            </Button>
          </div>
        )}

        {!!saved.data?.length && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Disponibles sin internet</h2>
            <p className="mb-2 mt-1 text-xs text-slate-400">Guardadas en este celular. Se borran solas un mes después del servicio.</p>
            <ul className="space-y-2">
              {saved.data.map((s) => (
                <li key={s.setlist.id}>
                  <Card className="flex items-center gap-2 p-0!">
                    <Link to={`/g/${s.setlist.group_id}/listas/${s.setlist.id}/presentar`} className="min-w-0 flex-1 rounded-2xl p-4 active:bg-slate-800">
                      <p className="truncate font-semibold">{s.setlist.title}</p>
                      <p className="text-xs text-slate-400">
                        {s.groupName} · {formatServiceDate(s.setlist.service_date)} · {s.setlist.setlist_songs.length} canciones
                      </p>
                    </Link>
                    <button
                      className="mr-2 min-h-11 shrink-0 rounded-xl px-3 text-sm text-slate-300 active:bg-slate-800"
                      aria-label={`Quitar «${s.setlist.title}» del celular`}
                      disabled={unsave.isPending}
                      onClick={() => confirm(`¿Quitar «${s.setlist.title}» del celular? Con internet la sigues viendo igual.`) && unsave.mutate(s.setlist.id)}
                    >
                      Quitar
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Page>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo grupo">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Input label="Nombre del grupo" placeholder="Alabanza Iglesia Central" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <p className="text-xs text-slate-400">Serás el administrador. Después podrás invitar a los demás con un código, QR o link.</p>
          {create.error && <ErrorBox>{errorMessage(create.error)}</ErrorBox>}
          <Button type="submit" className="w-full" disabled={!name.trim()} loading={create.isPending}>
            Crear grupo
          </Button>
        </form>
      </Modal>
    </>
  )
}
