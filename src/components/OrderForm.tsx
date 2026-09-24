import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { emptyLine, lineErrors, productionSummary, sheetToSummaryInput, toPayload, type Catalog, type SheetLine } from '../lib/orderSheet'
import { OrderSheet } from './OrderSheet'
import { PillButton } from './motion'

export type OrderResult = {
  orderNumber: number
  totalCents: number
  pieces: number
  contactName: string
  unit: string
  summary: ReturnType<typeof productionSummary>
}

type Contact = { name: string; phone: string; email: string; unit: string; notes: string }

const DRAFT_KEY = 'sarah-bon-de-commande-v1'
const EMPTY_CONTACT: Contact = { name: '', phone: '', email: '', unit: '', notes: '' }

function loadDraft(): { contact: Contact; lines: SheetLine[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(value: { contact: Contact; lines: SheetLine[] } | null) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // navegação privada / storage bloqueado: segue só em memória
  }
}

export function OrderForm({ catalog, mode, onDone }: { catalog: Catalog; mode: 'site' | 'painel'; onDone: (r: OrderResult) => void }) {
  const draft = mode === 'site' ? loadDraft() : null
  const [contact, setContact] = useState<Contact>(draft?.contact ?? EMPTY_CONTACT)
  const [lines, setLines] = useState<SheetLine[]>(() => {
    const valid = draft?.lines.filter((l) => catalog.products.some((p) => p.id === l.product_id))
    return valid?.length ? valid : Array.from({ length: 3 }, () => emptyLine(catalog))
  })
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rascunho local: um bon de commande de 40 linhas não pode se perder num F5
  useEffect(() => {
    if (mode !== 'site') return
    const t = setTimeout(() => saveDraft({ contact, lines }), 400)
    return () => clearTimeout(t)
  }, [contact, lines, mode])

  const set = (key: keyof Contact) => (e: { target: { value: string } }) => setContact((c) => ({ ...c, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (contact.name.trim().length < 2) return setError('Indiquez le nom du responsable de la commande.')
    if (contact.phone.replace(/\D/g, '').length < 8) return setError('Indiquez un numéro de téléphone valide.')
    const filled = lines.filter((l) => l.quantity > 0)
    if (filled.length === 0) return setError('Ajoutez au moins une ligne.')
    const bad = filled.findIndex((l) => lineErrors(l, catalog).length > 0)
    if (bad >= 0) return setError(`Ligne ${lines.indexOf(filled[bad]) + 1} incomplète.`)

    setSending(true)
    const { data, error: rpcError } = await supabase.rpc('create_order', {
      p_contact: contact,
      p_lines: toPayload(filled, catalog),
      p_source: mode,
    })
    setSending(false)
    const row = Array.isArray(data) ? data[0] : data
    if (rpcError || !row) {
      setError(rpcError?.message?.startsWith('Ligne') ? rpcError.message : 'La commande n’a pas pu être enregistrée. Réessayez dans un instant.')
      return
    }

    if (mode === 'site') saveDraft(null)
    onDone({
      orderNumber: row.order_number,
      totalCents: row.total_cents,
      pieces: row.pieces,
      contactName: contact.name.trim(),
      unit: contact.unit.trim(),
      summary: productionSummary(sheetToSummaryInput(filled, catalog), catalog.products[0]?.sizes ?? []),
    })
  }

  function reset() {
    if (!confirm('Effacer tout le bon de commande ?')) return
    setContact(EMPTY_CONTACT)
    setLines(Array.from({ length: 3 }, () => emptyLine(catalog)))
    setTried(false)
    saveDraft(null)
  }

  return (
    <form className="order-form" onSubmit={submit} noValidate>
      <fieldset className="contact-card">
        <legend className="display">{mode === 'site' ? 'Responsable de la commande' : 'Client'}</legend>
        <div className="contact-grid">
          <label className="field">
            <span>Nom et prénom</span>
            <input value={contact.name} onChange={set('name')} autoComplete="name" maxLength={120} aria-invalid={tried && contact.name.trim().length < 2} />
          </label>
          <label className="field">
            <span>Téléphone (WhatsApp)</span>
            <input value={contact.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" maxLength={30} placeholder="06 12 34 56 78" aria-invalid={tried && contact.phone.replace(/\D/g, '').length < 8} />
          </label>
          <label className="field">
            <span>E-mail (optionnel)</span>
            <input type="email" value={contact.email} onChange={set('email')} autoComplete="email" maxLength={200} />
          </label>
          <label className="field">
            <span>Unité / régiment (optionnel)</span>
            <input value={contact.unit} onChange={set('unit')} maxLength={200} placeholder="4e RE, 2e compagnie" />
          </label>
          <label className="field span-2">
            <span>Remarques générales (optionnel)</span>
            <textarea value={contact.notes} onChange={set('notes')} rows={2} maxLength={2000} placeholder="Date souhaitée, livraison, visuel à fournir..." />
          </label>
        </div>
      </fieldset>

      <OrderSheet catalog={catalog} lines={lines} onChange={setLines} showErrors={tried} />

      <motion.div className="submit-bar glass" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {error ? <p className="field-error" role="alert">{error}</p> : <p className="muted small">Merci de vérifier les tailles avant validation.</p>}
        <div className="submit-actions">
          <button type="button" className="link-button" onClick={reset}>Tout effacer</button>
          <PillButton type="submit" disabled={sending} icon={<PaperPlaneTilt size={16} weight="bold" />}>
            {sending ? 'Envoi...' : mode === 'site' ? 'Envoyer la commande' : 'Enregistrer'}
          </PillButton>
        </div>
      </motion.div>
    </form>
  )
}
