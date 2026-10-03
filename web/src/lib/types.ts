export type Role = 'admin' | 'member'
export type AudioStatus = 'none' | 'processing' | 'ready' | 'error'

export interface Group {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  created_at: string
}

export interface GroupWithRole extends Group {
  role: Role
}

export interface Member {
  group_id: string
  user_id: string
  role: Role
  joined_at: string
  profiles: { display_name: string | null; avatar_url: string | null } | null
}

export interface Song {
  id: string
  group_id: string
  title: string
  artist: string | null
  song_key: string | null
  bpm: number | null
  lyrics: string | null
  notes: string | null
  audio_path: string | null
  audio_status: AudioStatus
  audio_error: string | null
  source_url: string | null
  thumbnail_url: string | null
  duration_sec: number | null
  multitrack_ref: string | null
  created_at: string
  updated_at: string
}

export interface Setlist {
  id: string
  group_id: string
  title: string
  service_date: string
  notes: string | null
  created_at: string
}

export interface SetlistItem {
  id: string
  setlist_id: string
  song_id: string
  position: number
  key_override: string | null
  songs: Song
}

export interface SetlistWithItems extends Setlist {
  setlist_songs: SetlistItem[]
}
