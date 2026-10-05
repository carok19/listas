import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addSongsToSetlist,
  deleteSetlist,
  getSetlist,
  listSongs,
  removeSetlistItem,
  reorderSetlist,
  updateSetlist,
  updateSetlistItem,
} from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { formatServiceDate } from '../lib/format'
import { getSavedSetlist, offlineSupported, removeSavedSetlist, saveSetlistOffline } from '../lib/offline'
import { downloadSetlistSongs, hasAudio } from '../lib/files'
import { isNative } from '../lib/platform'
import type { SetlistItem } from '../lib/types'
import { useGroup } from '../hooks/useGroup'
import { Header, Page } from '../components/Layout'
import { Badge, Button, Card, Empty, ErrorBox, Input, Modal, PageSpinner, Textarea } from '../components/ui'
import { SongRowInfo } from '../components/SetlistSongs'

function SortableRow({
  item,
  index,
  isAdmin,
  onRemove,
  onKey,
}: {
  item: SetlistItem
  index: number
  isAdmin: boolean
  onRemove: () => void
  onKey: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-xl bg-slate-900 p-2 ${isDragging ? 'relative z-10 shadow-xl ring-2 ring-indigo-500' : ''}`}
    >
      {isAdmin && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex h-10 w-8 shrink-0 touch-none items-center justify-center text-xl text-slate-400"
          aria-label="Arrastrar para reordenar"
        >
          ≡
        </button>
      )}
      <Link to={`../../canciones/${item.song_id}`} relative="path" className="flex min-w-0 flex-1">
        <SongRowInfo item={item} index={index} />
      </Link>
      {isAdmin && (
        <>
          <button onClick={onKey} className="h-10 rounded-lg px-2 text-xs text-slate-400 active:bg-slate-800" aria-label="Cambiar tono">
            {item.key_override ? `♯ ${item.key_override}` : 'Tono'}
          </button>
          <button onClick={onRemove} className="h-10 w-9 rounded-lg text-lg text-slate-400 active:bg-slate-800" aria-label="Quitar">
            ×
          </button>
        </>
      )}
    </li>
  )
}

export default function SetlistDetail() {
  const { setlistId = '' } = useParams()
  const { groupId, group, isAdmin } = useGroup()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const key = ['setlist', setlistId]
  const setlist = useQuery({ queryKey: key, queryFn: () => getSetlist(setlistId) })
  const [items, setItems] = useState<SetlistItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [keyItem, setKeyItem] = useState<SetlistItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (setlist.data) setItems(setlist.data.setlist_songs)
  }, [setlist.data])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['next-setlist', groupId] })
    qc.invalidateQueries({ queryKey: ['setlists', groupId] })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)
    try {
      await reorderSetlist(setlistId, next.map((i) => i.id))
      invalidate()
    } catch (err) {
      setError(errorMessage(err))
      setItems(items)
    }
  }

  const remove = useMutation({
    mutationFn: (itemId: string) => removeSetlistItem(itemId),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  })

  // ---- Offline ----
  const saved = useQuery({ queryKey: ['saved', setlistId], queryFn: () => getSavedSetlist(setlistId) })
  const [progress, setProgress] = useState<string | null>(null)
  const refreshSaved = () => {
    qc.invalidateQueries({ queryKey: ['saved', setlistId] })
    qc.invalidateQueries({ queryKey: ['saved-setlists'] })
  }
  // Guarda o actualiza la copia (lo ya descargado no se vuelve a bajar).
  async function saveOffline() {
    if (!setlist.data) return
    setError(null)
    try {
      await saveSetlistOffline({ ...setlist.data, setlist_songs: items }, group?.name ?? '', (d, t) => setProgress(`${d}/${t}`))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setProgress(null)
      refreshSaved()
    }
  }
  async function removeOffline() {
    if (!confirm('¿Quitar esta lista del celular? Con internet la sigues viendo igual.')) return
    setError(null)
    try {
      await removeSavedSetlist(setlistId)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      refreshSaved()
    }
  }

  // ---- MP3 al celular ----
  const [mp3Progress, setMp3Progress] = useState<string | null>(null)
  const [mp3Saved, setMp3Saved] = useState<string | null>(null)
  async function downloadMp3s() {
    if (!setlist.data) return
    setError(null)
    setMp3Saved(null)
    try {
      const where = await downloadSetlistSongs(setlist.data.title, setlist.data.service_date, items.map((i) => i.songs), (d, t) =>
        setMp3Progress(`${d}/${t}`),
      )
      setMp3Saved(where)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setMp3Progress(null)
    }
  }

  if (setlist.isLoading) return <PageSpinner />
  if (setlist.error || !setlist.data) {
    return (
      <>
        <Header title="Lista" back={`/g/${groupId}/listas`} />
        <Page>
          <ErrorBox>{errorMessage(setlist.error ?? 'Lista no encontrada.')}</ErrorBox>
        </Page>
      </>
    )
  }
  const s = setlist.data
  const mp3Count = items.filter((i) => hasAudio(i.songs)).length
  const outdated = saved.data && JSON.stringify(saved.data.setlist.setlist_songs.map((i) => [i.id, i.songs.updated_at])) !== JSON.stringify(items.map((i) => [i.id, i.songs.updated_at]))

  return (
    <>
      <Header
        title={s.title}
        back={`/g/${groupId}/listas`}
        right={isAdmin && <Button variant="ghost" className="min-h-9 py-1" onClick={() => setEditOpen(true)}>Editar</Button>}
      />
      <Page>
        <p className="text-sm text-indigo-300 first-letter:uppercase">{formatServiceDate(s.service_date)}</p>
        {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-400">{s.notes}</p>}

        <div className="my-4">
          <Link to="presentar" className="block">
            <Button className="w-full" disabled={!items.length}>▶ Ensayar / Presentar</Button>
          </Link>
          {(offlineSupported || mp3Count > 0) && items.length > 0 && (
            <>
              <div className="mt-2 flex gap-2">
                {offlineSupported && (
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={saved.data && !outdated ? removeOffline : saveOffline}
                    loading={progress !== null}
                    aria-label={saved.data && !outdated && progress === null ? 'Guardada sin internet. Toca para quitarla del celular' : undefined}
                  >
                    {progress !== null ? `Guardando ${progress}…` : saved.data ? (outdated ? '↻ Actualizar' : '✓ Sin internet') : '📥 Guardar sin internet'}
                  </Button>
                )}
                {mp3Count > 0 && (
                  <Button variant="secondary" className="flex-1" onClick={downloadMp3s} loading={mp3Progress !== null}>
                    {mp3Progress !== null ? `Descargando ${mp3Progress}…` : `⬇ Descargar audios (${mp3Count})`}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {saved.data && !progress ? (
                  outdated ? (
                    <span className="text-amber-300">La lista cambió desde que la guardaste: toca ↻ Actualizar para tener la última versión sin internet.</span>
                  ) : (
                    <>
                      Guardada en este celular: se puede ensayar sin internet. Se borra sola un mes después del servicio.{' '}
                      <button className="min-h-6 text-slate-200 underline" onClick={removeOffline}>Quitar ahora</button>
                    </>
                  )
                ) : (
                  <>
                    <b className="font-semibold text-slate-300">Guardar sin internet</b> deja letras y audios dentro de la app para ensayar sin conexión.
                    {mp3Count > 0 && <> <b className="font-semibold text-slate-300">Descargar audios</b> copia los archivos a tu celular.</>}
                  </>
                )}
              </p>
              {mp3Saved && (
                <p className="mt-1 text-xs text-emerald-400">
                  {isNative ? `✓ Audios guardados en ${mp3Saved}` : '✓ Listo. Revisa tu carpeta de Descargas.'}
                </p>
              )}
            </>
          )}
        </div>
        {error && <div className="mb-3"><ErrorBox>{error}</ErrorBox></div>}

        {items.length === 0 ? (
          <Empty title="La lista está vacía">{isAdmin ? 'Agrega canciones de la biblioteca.' : 'El director aún no agregó canciones.'}</Empty>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    index={i}
                    isAdmin={isAdmin}
                    onRemove={() => remove.mutate(item.id)}
                    onKey={() => setKeyItem(item)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {isAdmin && (
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setPickerOpen(true)}>
            + Agregar canciones
          </Button>
        )}
      </Page>

      {isAdmin && (
        <>
          <SongPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            groupId={groupId}
            excluded={items.map((i) => i.song_id)}
            onAdd={async (ids) => {
              await addSongsToSetlist(setlistId, ids, items.length)
              invalidate()
            }}
          />
          <EditSetlist
            open={editOpen}
            onClose={() => setEditOpen(false)}
            initial={{ title: s.title, service_date: s.service_date, notes: s.notes ?? '' }}
            onSave={async (v) => {
              await updateSetlist(setlistId, { ...v, notes: v.notes || null })
              invalidate()
            }}
            onDelete={async () => {
              await deleteSetlist(setlistId)
              await removeSavedSetlist(setlistId)
              invalidate()
              navigate(`/g/${groupId}/listas`, { replace: true })
            }}
          />
          <KeyModal
            item={keyItem}
            onClose={() => setKeyItem(null)}
            onSave={async (k) => {
              await updateSetlistItem(keyItem!.id, { key_override: k || null })
              invalidate()
            }}
          />
        </>
      )}
    </>
  )
}

function SongPicker({
  open,
  onClose,
  groupId,
  excluded,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  excluded: string[]
  onAdd: (ids: string[]) => Promise<void>
}) {
  const songs = useQuery({ queryKey: ['songs', groupId], queryFn: () => listSongs(groupId), enabled: open })
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSel([])
      setQ('')
      setErr(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (songs.data ?? []).filter((s) => !n || s.title.toLowerCase().includes(n) || s.artist?.toLowerCase().includes(n))
  }, [songs.data, q])

  return (
    <Modal open={open} onClose={onClose} title="Agregar canciones">
      <Input type="search" aria-label="Buscar en la biblioteca" placeholder="Buscar en la biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 max-h-[50dvh] space-y-1 overflow-y-auto">
        {songs.isLoading && <PageSpinner />}
        {songs.data?.length === 0 && (
          <Empty title="La biblioteca está vacía">
            <Link to={`/g/${groupId}/canciones/nueva`} className="text-indigo-400 underline">Agrega tu primera canción</Link>
          </Empty>
        )}
        {filtered.map((s) => {
          const already = excluded.includes(s.id)
          const checked = sel.includes(s.id)
          return (
            <label key={s.id} className={`flex items-center gap-3 rounded-xl p-2 ${checked ? 'bg-indigo-500/15' : 'active:bg-slate-800'}`}>
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-500"
                checked={checked}
                onChange={() => setSel((v) => (checked ? v.filter((x) => x !== s.id) : [...v, s.id]))}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <p className="truncate text-xs text-slate-400">{[s.artist, s.song_key].filter(Boolean).join(' · ')}</p>
              </div>
              {already && <Badge>ya está</Badge>}
            </label>
          )
        })}
      </div>
      {err && <div className="mt-2"><ErrorBox>{err}</ErrorBox></div>}
      <Button
        className="mt-3 w-full"
        disabled={!sel.length}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onAdd(sel)
            onClose()
          } catch (e) {
            setErr(errorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Agregar {sel.length || ''} {sel.length === 1 ? 'canción' : 'canciones'}
      </Button>
    </Modal>
  )
}

function EditSetlist({
  open,
  onClose,
  initial,
  onSave,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  initial: { title: string; service_date: string; notes: string }
  onSave: (v: { title: string; service_date: string; notes: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (open) setV(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar lista">
      <div className="space-y-3">
        <Input label="Nombre" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <Input label="Fecha" type="date" value={v.service_date} onChange={(e) => setV({ ...v, service_date: e.target.value })} />
        <Textarea label="Notas" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        {err && <ErrorBox>{err}</ErrorBox>}
        <Button className="w-full" loading={busy} disabled={!v.title.trim() || !v.service_date} onClick={() => run(() => onSave(v))}>
          Guardar
        </Button>
        <Button
          variant="danger"
          className="w-full"
          disabled={busy}
          onClick={() => confirm('¿Borrar esta lista? Las canciones siguen en la biblioteca.') && run(onDelete)}
        >
          Borrar lista
        </Button>
      </div>
    </Modal>
  )
}

const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

function KeyModal({ item, onClose, onSave }: { item: SetlistItem | null; onClose: () => void; onSave: (k: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  if (!item) return null
  const pick = async (k: string) => {
    setBusy(true)
    try {
      await onSave(k)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Tono para este servicio`}>
      <p className="mb-3 text-sm text-slate-400">
        {item.songs.title} · tono original: <b>{item.songs.song_key || 'sin definir'}</b>
      </p>
      <div className="grid grid-cols-5 gap-2">
        {KEYS.flatMap((k) => [k, `${k}m`]).map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => pick(k)}
            className={`h-11 rounded-lg text-sm font-semibold ${item.key_override === k ? 'bg-indigo-600' : 'bg-slate-800 active:bg-slate-700'}`}
          >
            {k}
          </button>
        ))}
      </div>
      <Card className="mt-3 bg-transparent p-0">
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => pick('')}>
          Usar el tono original
        </Button>
      </Card>
    </Modal>
  )
}
