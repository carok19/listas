import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getGroup, getMyRole } from '../lib/api'
import { useAuth } from './useAuth'

export function useGroupId() {
  const { groupId } = useParams()
  return groupId!
}

export function useGroup() {
  const groupId = useGroupId()
  const { user } = useAuth()
  const group = useQuery({ queryKey: ['group', groupId], queryFn: () => getGroup(groupId) })
  const role = useQuery({
    queryKey: ['role', groupId, user?.id],
    queryFn: () => getMyRole(groupId, user!.id),
    enabled: Boolean(user),
  })
  return {
    groupId,
    group: group.data,
    isLoading: group.isLoading || role.isLoading,
    error: group.error,
    role: role.data ?? null,
    isAdmin: role.data === 'admin',
  }
}
