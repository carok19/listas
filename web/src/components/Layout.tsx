import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useOnline } from '../hooks/useOnline'

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
            ‹
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
    <div className="bg-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-200">
      Sin conexión. Solo están disponibles las listas descargadas.
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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
            <span className="text-xl leading-none">{it.icon}</span>
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
