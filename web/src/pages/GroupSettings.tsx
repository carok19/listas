import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { deleteGroup, listMembers, regenerateInviteCode, removeMember, renameGroup, setMemberRole } from '../lib/api'
import { errorMessage, supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { APK_DOWNLOAD_URL, APP_SCHEME, WEB_URL } from '../lib/platform'
import { useGroup } from '../hooks/useGroup'
import { GroupsLink, Header, Page } from '../components/Layout'
import { Badge, Button, Card, ErrorBox, Input, Modal, PageSpinner } from '../components/ui'

export default function GroupSettings() {
  const { groupId, group, isAdmin } = useGroup()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)

  const members = useQuery({ queryKey: ['members', groupId], queryFn: () => listMembers(groupId) })

  // En la web el link abre la app directamente; en la APK compartimos el
  // link de descarga + el código, y el QR abre la app si ya está instalada.
  const inviteLink = group ? (WEB_URL ? `${WEB_URL}/unirse/${group.invite_code}` : `${APP_SCHEME}://unirse/${group.invite_code}`) : ''
  const shareText = group
    ? WEB_URL
      ? `Únete a "${group.name}" en la app de Alabanza para ver las canciones y listas 🎶\n${inviteLink}\nCódigo: ${group.invite_code}`
      : `Únete a "${group.name}" en la app de Alabanza 🎶\n1) Descarga la app (Android): ${APK_DOWNLOAD_URL}\n2) Crea tu cuenta y toca "Unirme con código": ${group.invite_code}`
    : ''

  const invalidateGroup = () => {
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    qc.invalidateQueries({ queryKey: ['groups'] })
  }
  const onErr = (e: unknown) => setError(errorMessage(e))

  const regen = useMutation({ mutationFn: () => regenerateInviteCode(groupId), onSuccess: invalidateGroup, onError: onErr })
  const rename = useMutation({
    mutationFn: () => renameGroup(groupId, name!.trim()),
    onSuccess: () => {
      setName(null)
      invalidateGroup()
    },
    onError: onErr,
  })
  const role = useMutation({
    mutationFn: (v: { userId: string; role: 'admin' | 'member' }) => setMemberRole(groupId, v.userId, v.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', groupId] })
      qc.invalidateQueries({ queryKey: ['role', groupId] })
    },
    onError: onErr,
  })
  const kick = useMutation({
    mutationFn: (userId: string) => removeMember(groupId, userId),
    onSuccess: (_d, userId) => {
      if (userId === user?.id) {
        qc.invalidateQueries({ queryKey: ['groups'] })
        navigate('/', { replace: true })
      } else qc.invalidateQueries({ queryKey: ['members', groupId] })
    },
    onError: onErr,
  })
  const del = useMutation({
    mutationFn: () => deleteGroup(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate('/', { replace: true })
    },
    onError: onErr,
  })

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('No se pudo copiar. Mantén presionado el texto para copiarlo.')
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: group?.name, text: shareText })
        return
      } catch {
        /* cancelado: usar WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  if (!group) return <PageSpinner />

  return (
    <>
      <Header title="Grupo" right={<GroupsLink />} />
      <Page>
        {error && <div className="mb-3"><ErrorBox action={<Button variant="ghost" onClick={() => setError(null)}>Cerrar</Button>}>{error}</ErrorBox></div>}

        <Card>
          {name === null ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-bold">{group.name}</p>
              {isAdmin && <Button variant="ghost" onClick={() => setName(group.name)}>Renombrar</Button>}
            </div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate() }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <Button type="submit" loading={rename.isPending} disabled={!name.trim()}>OK</Button>
            </form>
          )}
        </Card>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">Invitar</h2>
        <Card>
          <p className="text-center text-xs text-slate-400">Código de invitación</p>
          <button onClick={() => copy(group.invite_code, 'code')} className="mx-auto mt-1 block font-mono text-4xl font-bold tracking-[0.3em] text-indigo-300">
            {group.invite_code}
          </button>
          <p className="h-4 text-center text-xs text-emerald-400">{copied === 'code' ? '¡Código copiado!' : copied === 'link' ? '¡Link copiado!' : ''}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button className="bg-emerald-600 active:bg-emerald-700" onClick={share}>WhatsApp</Button>
            <Button variant="secondary" onClick={() => setQrOpen(true)}>QR</Button>
            <Button variant="secondary" onClick={() => copy(WEB_URL ? inviteLink : shareText, 'link')}>Copiar link</Button>
          </div>
          {isAdmin && (
            <button
              className="mt-3 w-full text-center text-xs text-slate-500 underline"
              onClick={() => confirm('El código y link anteriores dejarán de funcionar. ¿Continuar?') && regen.mutate()}
            >
              {regen.isPending ? 'Generando…' : 'Generar un código nuevo'}
            </button>
          )}
        </Card>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Miembros {members.data && `(${members.data.length})`}
        </h2>
        {members.isLoading ? (
          <PageSpinner />
        ) : (
          <ul className="space-y-2">
            {members.data?.map((m) => {
              const me = m.user_id === user?.id
              return (
                <li key={m.user_id}>
                  <Card className="flex items-center gap-3 py-3">
                    {m.profiles?.avatar_url ? (
                      <img src={m.profiles.avatar_url} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-bold">
                        {(m.profiles?.display_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {m.profiles?.display_name ?? 'Sin nombre'} {me && <span className="text-xs text-slate-500">(tú)</span>}
                      </p>
                      <Badge tone={m.role === 'admin' ? 'indigo' : 'slate'}>{m.role === 'admin' ? 'Admin / director' : 'Miembro'}</Badge>
                    </div>
                    {isAdmin && !me && (
                      <div className="flex flex-col gap-1">
                        <button
                          className="rounded-lg px-2 py-1 text-xs text-indigo-300 active:bg-slate-800"
                          onClick={() => role.mutate({ userId: m.user_id, role: m.role === 'admin' ? 'member' : 'admin' })}
                        >
                          {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 text-xs text-red-300 active:bg-slate-800"
                          onClick={() => confirm(`¿Quitar a ${m.profiles?.display_name ?? 'este miembro'} del grupo?`) && kick.mutate(m.user_id)}
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-8 space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => confirm('¿Salir de este grupo?') && kick.mutate(user!.id)}>
            Salir del grupo
          </Button>
          {isAdmin && (
            <Button
              variant="danger"
              className="w-full"
              loading={del.isPending}
              onClick={() =>
                prompt(`Esto borra el grupo con TODAS sus canciones y listas. Escribe el nombre del grupo para confirmar:`) === group.name &&
                del.mutate()
              }
            >
              Borrar grupo
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </Page>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Escanea para unirte">
        <div className="flex flex-col items-center">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={inviteLink} size={240} />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tracking-[0.3em]">{group.invite_code}</p>
          <p className="mt-1 text-center text-xs text-slate-400">
            {WEB_URL ? 'Abre la cámara del celular y apunta al código.' : 'Si ya tiene la app instalada, el QR la abre. Si no, que la descargue y escriba el código.'}
          </p>
        </div>
      </Modal>
    </>
  )
}
