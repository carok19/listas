import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { rememberNext, useAuth } from './hooks/useAuth'
import { useGroupId } from './hooks/useGroup'
import { supabaseConfigured } from './lib/supabase'
import { setupNative } from './lib/native'
import { GroupNav, OfflineBanner } from './components/Layout'
import { PageSpinner } from './components/ui'
import Login from './pages/Login'
import Groups from './pages/Groups'
import JoinGroup from './pages/JoinGroup'
import GroupHome from './pages/GroupHome'
import Setlists from './pages/Setlists'
import SetlistDetail from './pages/SetlistDetail'
import Songs from './pages/Songs'
import AddSong from './pages/AddSong'
import SongDetail from './pages/SongDetail'
import GroupSettings from './pages/GroupSettings'
import Presentation from './pages/Presentation'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageSpinner />
  if (!session) {
    rememberNext(location.pathname + location.search)
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function GroupLayout() {
  const groupId = useGroupId()
  return (
    <>
      <Outlet />
      <GroupNav groupId={groupId} />
    </>
  )
}

export default function App() {
  const navigate = useNavigate()
  useEffect(() => setupNative((p) => navigate(p)), [navigate])

  if (!supabaseConfigured) {
    return (
      <div className="p-6 text-sm text-slate-300">
        Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Revisa el README.
      </div>
    )
  }
  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unirse/:code" element={<JoinGroup />} />
        <Route path="/" element={<RequireAuth><Groups /></RequireAuth>} />
        <Route path="/g/:groupId/listas/:setlistId/presentar" element={<RequireAuth><Presentation /></RequireAuth>} />
        <Route path="/g/:groupId" element={<RequireAuth><GroupLayout /></RequireAuth>}>
          <Route index element={<GroupHome />} />
          <Route path="listas" element={<Setlists />} />
          <Route path="listas/:setlistId" element={<SetlistDetail />} />
          <Route path="canciones" element={<Songs />} />
          <Route path="canciones/nueva" element={<AddSong />} />
          <Route path="canciones/:songId" element={<SongDetail />} />
          <Route path="ajustes" element={<GroupSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
