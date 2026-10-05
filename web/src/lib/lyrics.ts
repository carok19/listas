// Búsqueda de letras en varias fuentes: letras.com, LRCLIB, una página que el
// usuario encontró (link) o el texto que copió del navegador.
import { Browser } from '@capacitor/browser'
import { Clipboard } from '@capacitor/clipboard'
import { normalizeTitle } from './format'
import { getText } from './http'
import { letrasGuessUrl, searchLetras } from './letras'
import { extractLyrics } from './lyricsPage'
import { searchLyrics as searchLrclib } from './lrclib'
import { isNative } from './platform'

export type LyricsSource = 'letras' | 'lrclib'

export const SOURCE_LABEL: Record<LyricsSource, string> = { letras: 'letras.com', lrclib: 'LRCLIB' }

export interface LyricsOption {
  id: string
  source: LyricsSource
  title: string
  artist: string
  /** Página de la canción; la letra se lee al abrir la opción. */
  url?: string
  lyrics?: string
}

export type FoundLyrics = LyricsOption & { lyrics: string }

/** Mismo nombre, tolerando "(En vivo)", acentos o un subtítulo de más. */
function similar(a: string, b: string) {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return false
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))
}

/** Lee la letra de una página (letras.com, Genius, etc.). */
export async function lyricsFromUrl(url: string): Promise<string> {
  let html: string
  try {
    html = await getText(url)
  } catch (e) {
    throw new Error(`No se pudo abrir la página. ${(e as Error).message ?? ''}`.trim())
  }
  const lyrics = extractLyrics(html)
  if (!lyrics) throw new Error('No pudimos leer la letra en esa página. Ábrela en el navegador y copia la letra.')
  return lyrics
}

export async function loadOption(option: LyricsOption): Promise<string> {
  return option.lyrics ?? lyricsFromUrl(option.url!)
}

/** Busca en letras.com y LRCLIB a la vez. */
export async function searchAllLyrics(title: string, artist?: string | null) {
  const [letras, lrclib] = await Promise.allSettled([searchLetras(title, artist), searchLrclib(title, artist)])
  const options: LyricsOption[] = []
  if (letras.status === 'fulfilled') {
    letras.value.forEach((h, i) => options.push({ id: `letras-${i}`, source: 'letras', ...h }))
  }
  if (!options.length) {
    // Si el buscador de letras.com no respondió, probar el link probable de la canción.
    const guess = letrasGuessUrl(title, artist)
    if (guess) {
      const lyrics = await lyricsFromUrl(guess).catch(() => null)
      if (lyrics) options.push({ id: 'letras-link', source: 'letras', title, artist: artist ?? '', url: guess, lyrics })
    }
  }
  if (lrclib.status === 'fulfilled') {
    lrclib.value.forEach((m, i) => options.push({ id: `lrclib-${i}`, source: 'lrclib', ...m }))
  }
  return { options, failed: letras.status === 'rejected' && lrclib.status === 'rejected' }
}

/** Para llenar la letra sola: solo acepta resultados con el mismo título. */
export async function findLyricsAuto(title: string, artist?: string | null): Promise<FoundLyrics | null> {
  const lrclib = await searchLrclib(title, artist).catch(() => [])
  const fromLrclib = lrclib.find((m) => similar(title, m.title))
  if (fromLrclib) return { id: 'lrclib', source: 'lrclib', ...fromLrclib }

  const hits = await searchLetras(title, artist).catch(() => [])
  const sameTitle = hits.filter((h) => similar(title, h.title))
  const hit = sameTitle.find((h) => !artist || similar(artist, h.artist)) ?? sameTitle[0]
  const url = hit?.url ?? letrasGuessUrl(title, artist)
  if (!url) return null
  const lyrics = await lyricsFromUrl(url).catch(() => null)
  return lyrics ? { id: 'letras', source: 'letras', title: hit?.title ?? title, artist: hit?.artist ?? artist ?? '', url, lyrics } : null
}

/** Abre una búsqueda en el navegador (dentro de la app en Android). */
export function openLyricsSearch(title: string, artist: string | null | undefined, site?: string) {
  const q = [site ? `site:${site}` : 'letra', title, artist].filter(Boolean).join(' ')
  return Browser.open({ url: `https://www.google.com/search?q=${encodeURIComponent(q)}` })
}

export function openPage(url: string) {
  return Browser.open({ url })
}

/** Lo que el usuario copió: la letra, o el link de una página con la letra. */
export async function lyricsFromClipboard(): Promise<{ lyrics: string; fromUrl?: string }> {
  let text = ''
  try {
    text = isNative ? (await Clipboard.read()).value : await navigator.clipboard.readText()
  } catch {
    throw new Error('No se pudo leer lo copiado. Pégalo a mano con "Editar".')
  }
  text = (text ?? '').replace(/\r/g, '').trim()
  if (!text) throw new Error('No hay nada copiado. En el navegador, mantén presionada la letra, selecciónala y toca "Copiar".')
  if (/^https?:\/\/\S+$/i.test(text)) return { lyrics: await lyricsFromUrl(text), fromUrl: text }
  if (text.length < 20) throw new Error('Lo copiado es muy corto para ser una letra. Copia la letra completa e inténtalo otra vez.')
  return { lyrics: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') }
}
