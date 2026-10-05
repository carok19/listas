import { supabase, AUDIO_BUCKET, audioPathFor } from './supabase'
import type { Group, GroupWithRole, Member, Role, Setlist, SetlistWithItems, Song } from './types'

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

// ---------- Grupos ----------

export async function listMyGroups(userId: string): Promise<GroupWithRole[]> {
  const data = check(
    await supabase
      .from('group_members')
      .select('role, groups(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true }),
  ) as unknown as { role: Role; groups: Group }[]
  return data.filter((r) => r.groups).map((r) => ({ ...r.groups, role: r.role }))
}

export async function getGroup(groupId: string): Promise<Group> {
  return check(await supabase.from('groups').select('*').eq('id', groupId).single()) as Group
}

export async function getMyRole(groupId: string, userId: string): Promise<Role | null> {
  const data = check(
    await supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  ) as { role: Role } | null
  return data?.role ?? null
}

export async function createGroup(name: string): Promise<Group> {
  return check(await supabase.rpc('create_group', { p_name: name })) as Group
}

export async function groupPreview(code: string) {
  const rows = check(await supabase.rpc('group_preview', { p_code: code })) as
    | { id: string; name: string; member_count: number }[]
    | null
  return rows?.[0] ?? null
}

export async function joinGroup(code: string): Promise<string> {
  return check(await supabase.rpc('join_group', { p_code: code })) as string
}

export async function regenerateInviteCode(groupId: string): Promise<string> {
  return check(await supabase.rpc('regenerate_invite_code', { p_group: groupId })) as string
}

export async function renameGroup(groupId: string, name: string) {
  check(await supabase.from('groups').update({ name }).eq('id', groupId))
}

export async function deleteGroup(groupId: string) {
  // Borrar primero los MP3 del grupo en Storage (la base de datos borra el resto en cascada).
  const { data: files } = await supabase.storage.from(AUDIO_BUCKET).list(groupId, { limit: 1000 })
  if (files?.length) await supabase.storage.from(AUDIO_BUCKET).remove(files.map((f) => `${groupId}/${f.name}`))
  check(await supabase.from('groups').delete().eq('id', groupId))
}

export async function listMembers(groupId: string): Promise<Member[]> {
  return check(
    await supabase
      .from('group_members')
      .select('*, profiles(display_name, avatar_url)')
      .eq('group_id', groupId)
      .order('joined_at'),
  ) as unknown as Member[]
}

export async function setMemberRole(groupId: string, userId: string, role: Role) {
  check(await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId))
}

export async function removeMember(groupId: string, userId: string) {
  check(await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId))
}

// ---------- Canciones ----------

export async function listSongs(groupId: string): Promise<Song[]> {
  return check(await supabase.from('songs').select('*').eq('group_id', groupId).order('title')) as Song[]
}

export async function getSong(songId: string): Promise<Song> {
  return check(await supabase.from('songs').select('*').eq('id', songId).single()) as Song
}

export type SongInput = Partial<Omit<Song, 'id' | 'group_id' | 'created_at' | 'updated_at'>> & { title: string }

export async function createSong(groupId: string, input: SongInput): Promise<Song> {
  return check(await supabase.from('songs').insert({ ...input, group_id: groupId }).select().single()) as Song
}

export async function updateSong(songId: string, patch: Partial<Song>): Promise<Song> {
  return check(await supabase.from('songs').update(patch).eq('id', songId).select().single()) as Song
}

export async function deleteSong(song: Song) {
  if (song.audio_path) await supabase.storage.from(AUDIO_BUCKET).remove([song.audio_path])
  check(await supabase.from('songs').delete().eq('id', song.id))
}

/** Sube un MP3 manualmente y marca la canción como lista. */
export async function uploadSongAudio(song: Song, file: File): Promise<Song> {
  const path = audioPathFor(song.group_id, song.id)
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'audio/mpeg', cacheControl: '31536000' })
  if (error) throw error
  const duration = await readDuration(file).catch(() => null)
  return updateSong(song.id, {
    audio_path: path,
    audio_status: 'ready',
    audio_error: null,
    duration_sec: duration ?? song.duration_sec,
  })
}

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    audio.src = url
  })
}

/** URL temporal del MP3. Con `downloadAs`, el navegador lo descarga con ese nombre en vez de reproducirlo. */
export async function signedAudioUrl(path: string, downloadAs?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 60 * 60 * 6)
  if (error) throw error
  // A mano: la opción `download` de supabase-js codifica dos veces el nombre ("Oc%C3%A9anos").
  return downloadAs ? `${data.signedUrl}&download=${encodeURIComponent(downloadAs)}` : data.signedUrl
}

// ---------- Listas ----------

const SETLIST_SELECT = '*, setlist_songs(*, songs(*))'

function sortItems(s: SetlistWithItems): SetlistWithItems {
  s.setlist_songs = [...(s.setlist_songs ?? [])].filter((i) => i.songs).sort((a, b) => a.position - b.position)
  return s
}

export async function listSetlists(groupId: string): Promise<SetlistWithItems[]> {
  const data = check(
    await supabase
      .from('setlists')
      .select('*, setlist_songs(id)')
      .eq('group_id', groupId)
      .order('service_date', { ascending: false }),
  ) as unknown as SetlistWithItems[]
  return data
}

export async function getSetlist(setlistId: string): Promise<SetlistWithItems> {
  const data = check(
    await supabase.from('setlists').select(SETLIST_SELECT).eq('id', setlistId).single(),
  ) as unknown as SetlistWithItems
  return sortItems(data)
}

export function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export async function getNextSetlist(groupId: string): Promise<SetlistWithItems | null> {
  const data = check(
    await supabase
      .from('setlists')
      .select(SETLIST_SELECT)
      .eq('group_id', groupId)
      .gte('service_date', todayISO())
      .order('service_date', { ascending: true })
      .limit(1),
  ) as unknown as SetlistWithItems[]
  return data[0] ? sortItems(data[0]) : null
}

export async function createSetlist(groupId: string, input: { title: string; service_date: string; notes?: string }) {
  return check(await supabase.from('setlists').insert({ ...input, group_id: groupId }).select().single()) as Setlist
}

export async function updateSetlist(id: string, patch: Partial<Setlist>) {
  check(await supabase.from('setlists').update(patch).eq('id', id))
}

export async function deleteSetlist(id: string) {
  check(await supabase.from('setlists').delete().eq('id', id))
}

export async function addSongsToSetlist(setlistId: string, songIds: string[], startPosition: number) {
  if (!songIds.length) return
  check(
    await supabase
      .from('setlist_songs')
      .insert(songIds.map((song_id, i) => ({ setlist_id: setlistId, song_id, position: startPosition + i }))),
  )
}

export async function removeSetlistItem(itemId: string) {
  check(await supabase.from('setlist_songs').delete().eq('id', itemId))
}

export async function updateSetlistItem(itemId: string, patch: { key_override: string | null }) {
  check(await supabase.from('setlist_songs').update(patch).eq('id', itemId))
}

export async function reorderSetlist(setlistId: string, itemIds: string[]) {
  check(await supabase.rpc('reorder_setlist', { p_setlist: setlistId, p_item_ids: itemIds }))
}
