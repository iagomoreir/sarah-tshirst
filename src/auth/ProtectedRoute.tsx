import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth'

export function ProtectedRoute({ webmasterOnly = false }: { webmasterOnly?: boolean }) {
  const { session, staff, loading, signOut } = useAuth()

  if (loading) return <p className="muted center-page">Chargement…</p>
  if (!session) return <Navigate to="/painel/login" replace />
  if (!staff) {
    return (
      <div className="center-page">
        <p>Ce compte n’a pas accès au panneau.</p>
        <button className="btn" onClick={signOut}>Se déconnecter</button>
      </div>
    )
  }
  if (webmasterOnly && staff.role !== 'webmaster') return <Navigate to="/painel" replace />

  return <Outlet />
}
