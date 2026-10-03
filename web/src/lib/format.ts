export function formatDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatServiceDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function defaultSetlistTitle(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wd = date.toLocaleDateString('es', { weekday: 'long' })
  const mon = date.toLocaleDateString('es', { month: 'short' }).replace('.', '')
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d} ${mon}`
}

/** Separa "Artista - Canción (Video Oficial)" en título y artista. */
export function guessTitleArtist(raw: string, channel?: string | null) {
  const clean = raw
    .replace(/\s*[([](?:official|oficial|video|lyric|letra|audio|en vivo|live|hd|4k)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim()
  const parts = clean.split(/\s+[-–—]\s+/)
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
  return { title: clean, artist: channel?.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim() || '' }
}
