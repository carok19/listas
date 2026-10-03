import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { groupPreview, joinGroup } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { rememberNext, useAuth } from '../hooks/useAuth'
import { Button, Card, ErrorBox, PageSpinner } from '../components/ui'

export default function JoinGroup() {
  const { code = '' } = useParams()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (!loading && !session) rememberNext(`/unirse/${code}`)
  }, [loading, session, code])

  const preview = useQuery({ queryKey: ['preview', code], queryFn: () => groupPreview(code), enabled: !!session })
  const join = useMutation({
    mutationFn: () => joinGroup(code),
    onSuccess: (gid) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/g/${gid}`, { replace: true })
    },
  })

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {preview.isLoading ? (
        <PageSpinner />
      ) : !preview.data ? (
        <ErrorBox action={<Button variant="secondary" onClick={() => navigate('/')}>Ir a mis grupos</Button>}>
          {preview.error ? errorMessage(preview.error) : 'Este link de invitación no es válido o el código cambió. Pide uno nuevo al administrador.'}
        </ErrorBox>
      ) : (
        <Card className="text-center">
          <p className="text-sm text-slate-400">Te invitaron a unirte a</p>
          <p className="mt-1 text-2xl font-bold">{preview.data.name}</p>
          <p className="mt-1 text-xs text-slate-500">{preview.data.member_count} miembro(s)</p>
          {join.error && <div className="mt-3"><ErrorBox>{errorMessage(join.error)}</ErrorBox></div>}
          <Button className="mt-5 w-full" onClick={() => join.mutate()} loading={join.isPending}>
            Unirme al grupo
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/')}>
            Ahora no
          </Button>
        </Card>
      )}
    </div>
  )
}
