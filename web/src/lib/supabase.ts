import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const AUDIO_BUCKET = 'audio'

/** Convierte errores de Supabase/Postgres en un mensaje legible en español. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Ocurrió un error desconocido.'
  if (typeof err === 'string') return err
  const e = err as { message?: string; code?: string }
  const msg = e.message ?? String(err)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.'
  if (e.code === '42501' || /row-level security/i.test(msg)) return 'No tienes permiso para hacer esto. Solo el administrador del grupo puede editar.'
  if (/JWT expired/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  return msg
}

export function audioPathFor(groupId: string, songId: string) {
  return `${groupId}/${songId}.mp3`
}
