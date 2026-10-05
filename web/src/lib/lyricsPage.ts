// Sacar la letra del HTML de una página de letras: primero selectores de sitios
// conocidos, luego datos estructurados (JSON-LD) y al final el bloque con más
// saltos de línea cuya clase o id mencione "lyric" o "letra".

const KNOWN: { selector: string; all?: boolean }[] = [
  { selector: '.lyric-original' }, // letras.com / letras.mus.br
  { selector: '.cnt-letra' }, // letras.com (diseño anterior)
  { selector: '[data-lyrics-container="true"]', all: true }, // Genius: la letra viene en varias partes
  { selector: '#lyric-body-text' }, // lyrics.com
]

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'BUTTON', 'SVG', 'FORM', 'NAV', 'ASIDE', 'FOOTER', 'HEADER', 'SELECT'])
const BLOCK = new Set(['DIV', 'P', 'LI', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TR'])

function tidy(s: string) {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textOf(root: Element): string {
  const out: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (SKIP.has(tag) || el.getAttribute('data-exclude-from-selection') === 'true') return
    if (tag === 'BR') {
      out.push('\n')
      return
    }
    const block = BLOCK.has(tag)
    if (block) out.push('\n')
    el.childNodes.forEach(walk)
    if (block) out.push(tag === 'P' ? '\n\n' : '\n')
  }
  walk(root)
  return tidy(out.join(''))
}

export function looksLikeLyrics(text: string) {
  const lines = text.split('\n').filter((l) => l.trim()).length
  return lines >= 4 && text.length >= 60 && text.length <= 15_000
}

function htmlToText(html: string) {
  return textOf(new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body)
}

function lyricsField(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 6) return null
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = lyricsField(v, depth + 1)
      if (found) return found
    }
    return null
  }
  const obj = value as Record<string, unknown>
  const lyr = obj.lyrics
  const text = typeof lyr === 'string' ? lyr : lyr && typeof lyr === 'object' ? (lyr as { text?: unknown }).text : null
  if (typeof text === 'string' && text.trim()) return htmlToText(text)
  for (const v of Object.values(obj)) {
    const found = lyricsField(v, depth + 1)
    if (found) return found
  }
  return null
}

function fromJsonLd(doc: Document) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const text = lyricsField(JSON.parse(script.textContent ?? ''))
      if (text && looksLikeLyrics(text)) return text
    } catch {
      /* JSON inválido: seguir */
    }
  }
  return null
}

function guess(doc: Document) {
  let best: { text: string; score: number } | null = null
  for (const el of doc.querySelectorAll('[class*="lyric" i], [id*="lyric" i], [class*="letra" i], [id*="letra" i]')) {
    const breaks = el.querySelectorAll('br').length
    if (breaks < 4) continue
    const text = textOf(el)
    if (!looksLikeLyrics(text)) continue
    const linkChars = [...el.querySelectorAll('a')].reduce((n, a) => n + (a.textContent?.length ?? 0), 0)
    if (linkChars > text.length * 0.3) continue
    // Más líneas gana; si empatan, el bloque más interno (menos texto extra).
    const score = breaks * 10_000 - text.length
    if (!best || score > best.score) best = { text, score }
  }
  return best?.text ?? null
}

/** Devuelve la letra encontrada en la página, o null si no se reconoce. */
export function extractLyrics(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const { selector, all } of KNOWN) {
    const found = [...doc.querySelectorAll(selector)]
    if (!found.length) continue
    const text = tidy((all ? found : found.slice(0, 1)).map(textOf).join('\n\n'))
    if (looksLikeLyrics(text)) return text
  }
  return fromJsonLd(doc) ?? guess(doc)
}
