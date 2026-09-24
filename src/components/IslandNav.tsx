import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'motion/react'
import { ease } from './ease'
import { Wordmark } from './Wordmark'

export function IslandNav({ showCta = true }: { showCta?: boolean }) {
  const { scrollY } = useScroll()
  const shadow = useTransform(scrollY, [0, 80], ['0 0 0 rgba(0,0,0,0)', '0 12px 40px -12px var(--shadow)'])
  return (
    <motion.header
      className="island"
      style={{ boxShadow: shadow }}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease }}
    >
      <Link to="/" aria-label="Accueil">
        <Wordmark compact />
      </Link>
      <nav className="island-links" aria-label="Sections">
        <a href="/#tarifs">Tarifs</a>
        <a href="/#options">Options</a>
        <a href="/#modeles">Modèles</a>
      </nav>
      {showCta && (
        <Link to="/commande" className="island-cta">
          Commander
        </Link>
      )}
    </motion.header>
  )
}
