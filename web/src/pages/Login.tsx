import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { authRedirectUrl, isNative } from '../lib/platform'
import { openOAuthInBrowser } from '../lib/native'
import { takeNext, useAuth } from '../hooks/useAuth'
import { Button, ErrorBox, Input } from '../components/ui'

type Mode = 'password' | 'link'

function authError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos. Si es tu primera vez, toca "Crear cuenta".'
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada (y spam).'
  if (/already registered|already exists/i.test(msg)) return 'Ese correo ya tiene cuenta. Toca "Entrar".'
  if (/rate limit/i.test(msg)) return 'Se enviaron demasiados correos. Espera unos minutos o entra con contraseña.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/provider is not enabled/i.test(msg)) return 'El inicio con Google aún no está activado. Usa correo y contraseña.'
  return errorMessage(msg)
}

export default function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [loading, setLoading] = useState<'in' | 'up' | 'link' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(params.get('error'))

  useEffect(() => {
    if (session) navigate(takeNext() ?? '/', { replace: true })
  }, [session, navigate])

  async function run(kind: typeof loading, fn: () => Promise<void>) {
    setError(null)
    setLoading(kind)
    try {
      await fn()
    } catch (e) {
      setError(authError((e as Error).message ?? String(e)))
    } finally {
      setLoading(null)
    }
  }

  const signIn = () =>
    run('in', async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    })

  const signUp = () =>
    run('up', async () => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: authRedirectUrl() },
      })
      if (error) throw error
      if (!data.session) setSent(`Te enviamos un correo a ${email.trim()} para confirmar tu cuenta. Después vuelve aquí y toca "Entrar".`)
    })

  const sendLink = () =>
    run('link', async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: authRedirectUrl() } })
      if (error) throw error
      setSent(`Te enviamos un enlace a ${email.trim()}. Ábrelo en este mismo celular para entrar.`)
    })

  const google = () =>
    run('google', async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: isNative },
      })
      if (error) throw error
      if (isNative && data.url) await openOAuthInBrowser(data.url)
    })

  const validEmail = /\S+@\S+\.\S+/.test(email)

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/pwa-192x192.png" alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl" />
        <h1 className="text-3xl font-extrabold">Alabanza</h1>
        <p className="mt-2 text-slate-400">Canciones, letras y listas para tu grupo</p>
      </div>

      {sent ? (
        <div className="rounded-2xl bg-slate-900 p-5 text-center">
          <p className="text-lg font-semibold">Revisa tu correo 📬</p>
          <p className="mt-2 text-sm text-slate-400">{sent}</p>
          <Button variant="ghost" className="mt-4" onClick={() => setSent(null)}>
            Volver
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === 'password') signIn()
              else sendLink()
            }}
          >
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {mode === 'password' ? (
              <>
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="Contraseña (mínimo 6)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="submit" loading={loading === 'in'} disabled={!validEmail || password.length < 6}>
                    Entrar
                  </Button>
                  <Button type="button" variant="secondary" loading={loading === 'up'} disabled={!validEmail || password.length < 6} onClick={signUp}>
                    Crear cuenta
                  </Button>
                </div>
              </>
            ) : (
              <Button type="submit" className="w-full" loading={loading === 'link'} disabled={!validEmail}>
                Enviarme un enlace para entrar
              </Button>
            )}
          </form>
          <button
            className="w-full text-center text-sm text-slate-400 underline"
            onClick={() => {
              setMode(mode === 'password' ? 'link' : 'password')
              setError(null)
            }}
          >
            {mode === 'password' ? '¿Olvidaste tu contraseña? Entra con un enlace por correo' : 'Entrar con contraseña'}
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-slate-800" /> o <div className="h-px flex-1 bg-slate-800" />
          </div>
          <Button variant="secondary" className="w-full bg-white text-slate-900 active:bg-slate-200" onClick={google} loading={loading === 'google'}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
            </svg>
            Entrar con Google
          </Button>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </div>
  )
}
