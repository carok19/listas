import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, loading: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

const NEXT_KEY = 'alabanza:next'

/** Recordar a dónde volver después de iniciar sesión (ej. link de invitación). */
export function rememberNext(path: string) {
  try {
    localStorage.setItem(NEXT_KEY, path)
  } catch {
    /* sin almacenamiento */
  }
}

export function takeNext(): string | null {
  try {
    const v = localStorage.getItem(NEXT_KEY)
    localStorage.removeItem(NEXT_KEY)
    return v
  } catch {
    return null
  }
}
