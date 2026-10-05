import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSetlist, listSetlists, todayISO } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { defaultSetlistTitle, formatServiceDate } from '../lib/format'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Button, Card, Empty, ErrorBox, Input, Modal, PageSpinner, Textarea } from '../components/ui'

function nextSunday() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export default function Setlists() {
  const { groupId, isAdmin } = useGroup()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const open = params.get('nueva') === '1'
  const [date, setDate] = useState(nextSunday)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const lists = useQuery({ queryKey: ['setlists', groupId], queryFn: () => listSetlists(groupId) })
  const create = useMutation({
    mutationFn: () => createSetlist(groupId, { title: title.trim() || defaultSetlistTitle(date), service_date: date, notes: notes.trim() || undefined }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['setlists', groupId] })
      qc.invalidateQueries({ queryKey: ['next-setlist', groupId] })
      navigate(`/g/${groupId}/listas/${s.id}`, { replace: true })
    },
  })

  const today = todayISO()
  const upcoming = (lists.data ?? []).filter((s) => s.service_date >= today).reverse()
  const past = (lists.data ?? []).filter((s) => s.service_date < today)

  const renderList = (items: typeof upcoming) => (
    <div className="space-y-2">
      {items.map((s) => (
        <Link key={s.id} to={`/g/${groupId}/listas/${s.id}`} className="block">
          <Card className="active:bg-slate-800">
            <p className="font-semibold">{s.title}</p>
            <p className="text-xs text-slate-400 first-letter:uppercase">
              {formatServiceDate(s.service_date)} · {s.setlist_songs?.length ?? 0} canciones
            </p>
          </Card>
        </Link>
      ))}
    </div>
  )

  return (
    <>
      <Header
        title="Listas"
        right={isAdmin && <Button className="min-h-9 py-1" onClick={() => setParams({ nueva: '1' })}>+ Nueva</Button>}
      />
      <Page>
        {lists.isLoading ? (
          <PageSpinner />
        ) : lists.error ? (
          <ErrorBox>{errorMessage(lists.error)}</ErrorBox>
        ) : (
          <>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Próximas</h2>
            {upcoming.length ? renderList(upcoming) : <Empty title="No hay listas próximas" />}
            {past.length > 0 && (
              <>
                <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">Anteriores</h2>
                {renderList(past)}
              </>
            )}
          </>
        )}
      </Page>

      <Modal open={open && isAdmin} onClose={() => setParams({})} title="Nueva lista">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Input label="Fecha del servicio" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Nombre (opcional)" placeholder={date ? defaultSetlistTitle(date) : 'Domingo 5 oct'} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea label="Notas (opcional)" rows={2} placeholder="Servicio de la mañana, Santa Cena…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {create.error && <ErrorBox>{errorMessage(create.error)}</ErrorBox>}
          <Button type="submit" className="w-full" disabled={!date} loading={create.isPending}>
            Crear y agregar canciones
          </Button>
        </form>
      </Modal>
    </>
  )
}
