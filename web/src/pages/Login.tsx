import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { takeNext, useAuth } from '../hooks/useAuth'
import { Button, ErrorBox, Input } from '../components/ui'

export default function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState<'email' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session) navigate(takeNext() ?? '/', { replace: true })
  }, [session, navigate])

  const redirectTo = `${window.location.origin}/login`

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading('email')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setLoading(null)
    if (error) {
      setError(
        /rate limit/i.test(error.message)
          ? 'Se enviaron demasiados correos. Espera unos minutos o entra con Google.'
          : errorMessage(error),
      )
    } else setSent(true)
  }

  async function google() {
    setError(null)
    setLoading('google')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) {
      setLoading(null)
      setError(errorMessage(error))
    }
  }

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
          <p className="mt-2 text-sm text-slate-400">
            Te enviamos un enlace a <b className="text-slate-200">{email}</b>. Ábrelo en este mismo celular para entrar.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => setSent(false)}>
            Usar otro correo
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button variant="secondary" className="w-full bg-white text-slate-900 active:bg-slate-200" onClick={google} loading={loading === 'google'}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
            </svg>
            Entrar con Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-slate-800" /> o con tu correo <div className="h-px flex-1 bg-slate-800" />
          </div>
          <form onSubmit={sendLink} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" loading={loading === 'email'}>
              Enviarme un enlace para entrar
            </Button>
          </form>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </div>
  )
}
