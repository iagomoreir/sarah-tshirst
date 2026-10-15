import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { BookmarksSimple, FileText, Fingerprint, Package, SignOut, TShirt, Users } from '@phosphor-icons/react'
import { useAuth } from '../../auth/auth'
import { ease } from '../../components/ease'
import { Wordmark } from '../../components/Wordmark'
import { purgeExpiredVisuels } from '../../lib/visuels'

export function PanelLayout() {
  const { staff, signOut, registerPasskey } = useAuth()
  const location = useLocation()
  const [passkeyMsg, setPasskeyMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // Originais com prazo vencido (30 dias depois de « Livrée ») saem do Storage ao abrir o painel
  useEffect(() => {
    if (staff) purgeExpiredVisuels().catch(() => undefined)
  }, [staff])

  async function addPasskey() {
    setPasskeyMsg(null)
    const { error } = await registerPasskey()
    setPasskeyMsg(error ? { kind: 'error', text: error } : { kind: 'ok', text: 'Passkey ajoutée. Vous pourrez vous connecter sans mot de passe.' })
  }

  const links = [
    { to: '/painel/devis', label: 'Devis', icon: FileText, end: false },
    { to: '/painel', label: 'Commandes', icon: Package, end: true },
    { to: '/painel/produtos', label: 'Produits', icon: TShirt, end: false },
    { to: '/painel/bibliotheque', label: 'Bibliothèque', icon: BookmarksSimple, end: false },
    ...(staff?.role === 'webmaster' ? [{ to: '/painel/cadastro', label: 'Utilisateurs', icon: Users, end: false }] : []),
  ]

  const userActions = (
    <div className="panel-user">
      <p>
        {staff?.name}
        <small className="muted">{staff?.role === 'webmaster' ? 'Webmaster' : 'Boutique'}</small>
      </p>
      <button className="icon-button" onClick={addPasskey} aria-label="Ajouter une passkey" title="Ajouter une passkey">
        <Fingerprint size={20} weight="light" />
      </button>
      <button className="icon-button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter">
        <SignOut size={20} weight="light" />
      </button>
    </div>
  )

  return (
    <div className="panel">
      {/* Celular: faixa de cima com a marca e as ações; as abas vão para a barra de baixo */}
      <header className="panel-top glass">
        <Wordmark compact />
        {userActions}
      </header>
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
        {userActions}
      </aside>
      {passkeyMsg && (
        <p className={`${passkeyMsg.kind === 'ok' ? 'field-ok' : 'field-error'} small passkey-msg`} role="status">
          {passkeyMsg.text}
        </p>
      )}
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
