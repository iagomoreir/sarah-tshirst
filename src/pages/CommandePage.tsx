import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, WhatsappLogo } from '@phosphor-icons/react'
import { formatMoney } from '../lib/format'
import { whatsappSummary } from '../lib/orderSheet'
import { useCatalog } from '../lib/useCatalog'
import { STORE_WHATSAPP, whatsappLink } from '../lib/whatsapp'
import { IslandNav } from '../components/IslandNav'
import { OrderForm, type OrderResult } from '../components/OrderForm'
import { PillLink, WordsReveal } from '../components/motion'
import { ease } from '../components/ease'

export function CommandePage() {
  const { catalog, loading, error } = useCatalog()
  const [result, setResult] = useState<OrderResult | null>(null)

  return (
    <div className="store commande">
      <IslandNav showCta={false} />
      <div className="commande-inner">
        <header className="commande-head">
          <h1 className="display">
            <WordsReveal text="Bon de commande" />
          </h1>
          <p className="muted">
            Une ligne par personne. Vous avez déjà le tableau sur Excel ? Copiez les lignes et collez-les directement dans le tableau.
          </p>
        </header>

        {error && <p className="notice error">{error}</p>}
        {loading && <div className="sk sheet-sk" aria-hidden />}

        <AnimatePresence mode="wait">
          {!loading && !error && !result && (
            <motion.div key="form" exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }}>
              <OrderForm catalog={catalog} mode="site" onDone={(r) => { setResult(r); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
            </motion.div>
          )}
          {result && <Success key="ok" result={result} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Success({ result }: { result: OrderResult }) {
  const text = whatsappSummary({
    orderNumber: result.orderNumber,
    contactName: result.contactName,
    unit: result.unit,
    pieces: result.pieces,
    totalCents: result.totalCents,
    summary: result.summary,
  })
  return (
    <motion.section className="success" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
      <motion.span className="success-check" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.2 }}>
        <Check size={36} weight="bold" />
      </motion.span>
      <h2 className="display">Commande n° {result.orderNumber} enregistrée</h2>
      <p>
        {result.pieces} pièce{result.pieces > 1 ? 's' : ''}, total {formatMoney(result.totalCents)}. Dernière étape : prévenez Sarah sur WhatsApp pour valider le
        paiement et la livraison.
      </p>
      <PillLink href={whatsappLink(STORE_WHATSAPP, text)} target="_blank" rel="noreferrer" icon={<WhatsappLogo size={16} weight="bold" />}>
        Envoyer sur WhatsApp
      </PillLink>
      <Link to="/" className="link-button">Retour à l’accueil</Link>
    </motion.section>
  )
}
