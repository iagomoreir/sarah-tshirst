import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../../auth/AuthProvider'
import { ProtectedRoute } from '../../auth/ProtectedRoute'
import { PanelLayout } from './PanelLayout'
import { LoginPage } from './LoginPage'
import { OrdersPage } from './OrdersPage'
import { NewOrderPage } from './NewOrderPage'
import { ProductsPage } from './ProductsPage'
import { UsersPage } from './UsersPage'

export default function PanelApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<PanelLayout />}>
            <Route index element={<OrdersPage />} />
            <Route path="novo" element={<NewOrderPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route element={<ProtectedRoute webmasterOnly />}>
              <Route path="cadastro" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
