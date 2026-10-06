import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth'
import { NoAccess } from './NoAccess'

export function ProtectedRoute({ webmasterOnly = false }: { webmasterOnly?: boolean }) {
  const { session, staff, loading } = useAuth()

  if (loading) return <p className="muted center-page">Chargement…</p>
  if (!session) return <Navigate to="/painel/login" replace />
  if (!staff) return <NoAccess />
  if (webmasterOnly && staff.role !== 'webmaster') return <Navigate to="/painel" replace />

  return <Outlet />
}
