import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { CommandePage } from './pages/CommandePage'

// Painel carrega à parte: quem só compra não baixa esse código
const PanelApp = lazy(() => import('./pages/painel/PanelApp'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/commande" element={<CommandePage />} />
      <Route
        path="/painel/*"
        element={
          <Suspense fallback={<p className="muted center-page">Carregando…</p>}>
            <PanelApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
