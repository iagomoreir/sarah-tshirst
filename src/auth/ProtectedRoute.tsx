import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth'

export function ProtectedRoute({ webmasterOnly = false }: { webmasterOnly?: boolean }) {
  const { session, staff, loading, signOut } = useAuth()

  if (loading) return <p className="muted center-page">Carregando…</p>
  if (!session) return <Navigate to="/painel/login" replace />
  if (!staff) {
    return (
      <div className="center-page">
        <p>Esta conta não tem acesso ao painel.</p>
        <button className="btn" onClick={signOut}>Sair</button>
      </div>
    )
  }
  if (webmasterOnly && staff.role !== 'webmaster') return <Navigate to="/painel" replace />

  return <Outlet />
}
