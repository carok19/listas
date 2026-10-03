import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSetlist } from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { getSavedSetlist } from '../lib/offline'
import { useWakeLock } from '../hooks/useWakeLock'
import { AudioPlayer } from '../components/AudioPlayer'
import { Button, ErrorBox, PageSpinner } from '../components/ui'

const PREFS_KEY = 'alabanza:presentacion'

function loadPrefs(): { size: number; light: boolean; wake: boolean } {
  try {
    return { size: 30, light: false, wake: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { size: 30, light: false, wake: true }
  }
}

export default function Presentation() {
  const { groupId = '', setlistId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(loadPrefs)
  const [offline, setOffline] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignorar */
    }
  }, [prefs])

  const wake = useWakeLock(prefs.wake)

  // Primero la red; si no hay conexión, la copia descargada.
  const data = useQuery({
    queryKey: ['present', setlistId],
    queryFn: async () => {
      try {
        if (!navigator.onLine) throw new Error('offline')
        const s = await getSetlist(setlistId)
        setOffline(false)
        return s
      } catch (e) {
        const saved = await getSavedSetlist(setlistId)
        if (saved) {
          setOffline(true)
          return saved.setlist
        }
        throw e
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  })

  const items = data.data?.setlist_songs ?? []
  const index = Math.min(Math.max(Number(params.get('i') ?? 0) || 0, 0), Math.max(items.length - 1, 0))
  const go = useCallback(
    (i: number) => {
      setParams({ i: String(i) }, { replace: true })
      scroller.current?.scrollTo({ top: 0 })
    },
    [setParams],
  )
  const prev = useCallback(() => index > 0 && go(index - 1), [index, go])
  const next = useCallback(() => index < items.length - 1 && go(index + 1), [index, items.length, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  // Deslizar a los lados para cambiar de canción.
  const touch = useRef<{ x: number; y: number } | null>(null)

  const light = prefs.light
  const theme = light ? 'bg-white text-slate-900' : 'bg-black text-slate-50'

  if (data.isLoading) return <div className={`min-h-dvh ${theme}`}><PageSpinner /></div>
  if (data.error || !data.data) {
    return (
      <div className="p-4">
        <ErrorBox action={<Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>}>
          {navigator.onLine ? errorMessage(data.error) : 'Sin conexión y esta lista no está descargada en el celular.'}
        </ErrorBox>
      </div>
    )
  }
  const item = items[index]
  const song = item?.songs
  const key = item?.key_override || song?.song_key
  const iconBtn = `flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-bold ${light ? 'active:bg-slate-200' : 'active:bg-slate-800'}`

  return (
    <div className={`flex h-dvh flex-col ${theme}`}>
      <header className={`flex items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] ${light ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex h-14 w-full items-center gap-1">
          <button className={iconBtn} onClick={() => navigate(`/g/${groupId}/listas/${setlistId}`)} aria-label="Salir">✕</button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-xs opacity-60">
              {data.data.title} · {index + 1}/{items.length} {offline && '· sin internet'}
            </p>
            <p className="truncate font-bold">{song?.title ?? 'Lista vacía'}</p>
          </div>
          <button className={iconBtn} onClick={() => setPrefs((p) => ({ ...p, size: Math.max(16, p.size - 3) }))} aria-label="Letra más pequeña">A−</button>
          <button className={iconBtn} onClick={() => setPrefs((p) => ({ ...p, size: Math.min(72, p.size + 3) }))} aria-label="Letra más grande">A+</button>
          <button className={iconBtn} onClick={() => setPrefs((p) => ({ ...p, light: !p.light }))} aria-label="Cambiar tema">
            {light ? '☾' : '☀'}
          </button>
          {wake.supported && (
            <button
              className={`${iconBtn} ${prefs.wake && wake.active ? 'text-amber-400' : 'opacity-40'}`}
              onClick={() => setPrefs((p) => ({ ...p, wake: !p.wake }))}
              aria-label="Pantalla siempre encendida"
              title="Pantalla siempre encendida"
            >
              💡
            </button>
          )}
        </div>
      </header>

      <div
        ref={scroller}
        className="flex-1 overflow-y-auto px-5 py-6"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current
          touch.current = null
          if (!t) return
          const dx = e.changedTouches[0].clientX - t.x
          const dy = e.changedTouches[0].clientY - t.y
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) (dx < 0 ? next : prev)()
        }}
      >
        {song && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2 text-sm opacity-70">
              {song.artist && <span>{song.artist}</span>}
              {key && <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 font-bold text-white">Tono {key}</span>}
              {song.bpm && <span>{song.bpm} BPM</span>}
            </div>
            {song.notes && <p className="mb-5 whitespace-pre-line rounded-xl bg-amber-400/15 p-3 text-sm">{song.notes}</p>}
            {song.lyrics?.trim() ? (
              <p className="whitespace-pre-line font-semibold leading-snug" style={{ fontSize: prefs.size }}>
                {song.lyrics}
              </p>
            ) : (
              <p className="opacity-50">Esta canción no tiene letra.</p>
            )}
            {index < items.length - 1 && (
              <button onClick={next} className="mt-10 w-full rounded-xl border border-current/20 p-4 text-left opacity-60">
                <span className="text-xs">Siguiente →</span>
                <span className="block font-semibold">{items[index + 1].songs.title}</span>
              </button>
            )}
          </>
        )}
      </div>

      {song && (
        <AudioPlayer song={song} hasPrev={index > 0} hasNext={index < items.length - 1} onPrev={prev} onNext={next} light={light} />
      )}
    </div>
  )
}
