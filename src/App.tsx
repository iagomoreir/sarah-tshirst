import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { CommandePage } from './pages/CommandePage'

// Painel carrega à parte: quem só compra não baixa esse código
const PanelApp = lazy(() => import('./pages/painel/PanelApp'))
// Assinatura e verificação de contratos: páginas públicas, também à parte
const SignerPage = lazy(() => import('./pages/SignerPage').then((m) => ({ default: m.SignerPage })))
const VerifierPage = lazy(() => import('./pages/VerifierPage').then((m) => ({ default: m.VerifierPage })))
const loading = <p className="muted center-page">Chargement…</p>

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/commande" element={<CommandePage />} />
      <Route path="/signer/:token" element={<Suspense fallback={loading}><SignerPage /></Suspense>} />
      <Route path="/verifier" element={<Suspense fallback={loading}><VerifierPage /></Suspense>} />
      <Route
        path="/painel/*"
        element={
          <Suspense fallback={loading}>
            <PanelApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
