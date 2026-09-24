import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Package, SignOut, TShirt, Users } from '@phosphor-icons/react'
import { useAuth } from '../../auth/auth'
import { ease } from '../../components/ease'
import { Wordmark } from '../../components/Wordmark'

export function PanelLayout() {
  const { staff, signOut } = useAuth()
  const location = useLocation()

  const links = [
    { to: '/painel', label: 'Commandes', icon: Package, end: true },
    { to: '/painel/produtos', label: 'Produits', icon: TShirt, end: false },
    ...(staff?.role === 'webmaster' ? [{ to: '/painel/cadastro', label: 'Utilisateurs', icon: Users, end: false }] : []),
  ]

  return (
    <div className="panel">
      <aside className="panel-nav glass">
        <Wordmark compact />
        <nav>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'panel-link active' : 'panel-link')}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="panel-link-bg" className="panel-link-bg" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <Icon size={20} weight={isActive ? 'regular' : 'light'} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="panel-user">
          <p>
            {staff?.name}
            <small className="muted">{staff?.role === 'webmaster' ? 'Webmaster' : 'Boutique'}</small>
          </p>
          <button className="icon-button" onClick={signOut} aria-label="Se déconnecter">
            <SignOut size={20} weight="light" />
          </button>
        </div>
      </aside>
      <main className="panel-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
