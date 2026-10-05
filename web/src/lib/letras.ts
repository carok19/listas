// letras.com: búsqueda con el autocompletado del propio sitio y lectura de la
// página de la canción. No es una API oficial: si el sitio cambia, la app sigue
// ofreciendo abrir la página o buscar en Google y pegar la letra.
import { getText } from './http'

export const LETRAS_SITE = 'https://www.letras.com'
const SUGGEST_URL = 'https://solr.sscdn.co/letras/m1/'

export interface LetrasHit {
  title: string
  artist: string
  url: string
}

interface SuggestDoc {
  t?: string | number
  txt?: string
  art?: string
  dns?: string
  url?: string
}

function parseJsonp(text: string): unknown {
  const t = text.trim()
  const m = /^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/.exec(t)
  return JSON.parse(m ? m[1] : t)
}

export async function searchLetras(title: string, artist?: string | null): Promise<LetrasHit[]> {
  const q = [title, artist].map((s) => s?.trim()).filter(Boolean).join(' ')
  if (!q) return []
  const url = `${SUGGEST_URL}?${new URLSearchParams({ q, wt: 'json', callback: 'LetrasSug' })}`
  const data = parseJsonp(await getText(url)) as { response?: { docs?: SuggestDoc[] } }
  const docs = (data.response?.docs ?? []).filter((d) => d.dns && d.url && d.txt)
  // t=2 son canciones; si el sitio deja de mandarlo, usar todo lo que tenga link.
  const songs = docs.filter((d) => String(d.t) === '2')
  return (songs.length ? songs : docs).slice(0, 6).map((d) => ({
    title: d.txt!,
    artist: d.art ?? '',
    url: `${LETRAS_SITE}/${encodeURIComponent(d.dns!)}/${encodeURIComponent(d.url!)}/`,
  }))
}

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Link probable de la canción (letras.com usa /artista/cancion/ para muchas). */
export function letrasGuessUrl(title: string, artist?: string | null) {
  const a = slug(artist ?? '')
  const t = slug(title)
  return a && t ? `${LETRAS_SITE}/${a}/${t}/` : null
}
