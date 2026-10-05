import type { SetlistItem } from '../lib/types'

export function SongRowInfo({ item, index }: { item: SetlistItem; index: number }) {
  const s = item.songs
  const key = item.key_override || s.song_key
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.title}</p>
        <p className="truncate text-xs text-slate-400">
          {[s.artist, key && `Tono ${key}`, s.bpm && `${s.bpm} BPM`].filter(Boolean).join(' · ')}
          {s.audio_status !== 'ready' && <span className="text-amber-400"> · sin audio</span>}
        </p>
      </div>
    </div>
  )
}
