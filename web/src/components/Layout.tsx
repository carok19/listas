import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useOnline } from '../hooks/useOnline'
import { APK_DOWNLOAD_URL } from '../lib/platform'
import { availableUpdate, dismissUpdate } from '../lib/update'

export function Header({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-800 bg-slate-950/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 w-full items-center gap-2">
        {back && (
          <button
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-2xl active:bg-slate-800"
            aria-label="Atrás"
          >
            <span aria-hidden>‹</span>
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
        {right}
      </div>
    </header>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="bg-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-200">
      Sin conexión. Solo están disponibles las listas descargadas.
    </div>
  )
}

/** Dentro de la APK: avisa cuando hay una versión nueva publicada (no en Presentar, para no tapar la letra). */
export function UpdateNotice() {
  const update = useQuery({ queryKey: ['app-update'], queryFn: availableUpdate, staleTime: Infinity, retry: false })
  const [hidden, setHidden] = useState(false)
  if (!update.data || hidden) return null
  return (
    <div role="status" className="mb-4 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-indigo-100">
      <p>
        <b>Hay una versión nueva de la app</b> ({update.data}). Descárgala e instálala encima: no se pierde nada.
      </p>
      <div className="mt-2 flex gap-2">
        <a href={APK_DOWNLOAD_URL} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 font-semibold text-white active:bg-indigo-700">
          Descargar
        </a>
        <button
          className="min-h-11 rounded-xl px-4 text-indigo-200 active:bg-indigo-900/50"
          onClick={() => {
            dismissUpdate(update.data!)
            setHidden(true)
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">{children}</main>
}

export function GroupNav({ groupId }: { groupId: string }) {
  const items = [
    { to: `/g/${groupId}`, label: 'Inicio', icon: '⌂', end: true },
    { to: `/g/${groupId}/listas`, label: 'Listas', icon: '☰' },
    { to: `/g/${groupId}/canciones`, label: 'Canciones', icon: '♪' },
    { to: `/g/${groupId}/ajustes`, label: 'Grupo', icon: '⚙' },
  ]
  return (
    <nav aria-label="Secciones del grupo" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-indigo-400' : 'text-slate-400'}`
            }
          >
            <span className="text-xl leading-none" aria-hidden>{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function GroupsLink() {
  return (
    <Link to="/" className="rounded-full px-3 py-1.5 text-sm text-slate-300 active:bg-slate-800">
      Mis grupos
    </Link>
  )
}
