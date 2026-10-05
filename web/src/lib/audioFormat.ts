// Formatos de audio aceptados (deben coincidir con el bucket "audio" de Supabase).
const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  wav: 'audio/wav',
}

/** Para `<input type="file" accept>`. */
export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.ogg,.opus,.webm,.wav'

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024

const BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

/** Extensión del archivo de audio, o null si no es un formato aceptado. */
export function audioExtension(file: Pick<File, 'name' | 'type'>): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext in TYPES) return ext
  return BY_MIME[file.type.toLowerCase()] ?? null
}

export function audioMime(ext: string) {
  return TYPES[ext] ?? 'audio/mpeg'
}

/** Extensión de una ruta de Storage ("grupo/cancion.m4a" → "m4a"). */
export function pathExtension(path: string | null | undefined) {
  const ext = path?.split('.').pop()?.toLowerCase() ?? ''
  return ext in TYPES ? ext : 'mp3'
}

/** Quita la extensión de audio de un nombre de archivo. */
export function stripAudioExtension(name: string) {
  return name.replace(/\.(mp3|m4a|mp4|aac|ogg|opus|webm|wav)$/i, '')
}
