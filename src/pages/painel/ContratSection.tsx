import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwise, Copy, DownloadSimple, FileText, SealCheck, WhatsappLogo } from '@phosphor-icons/react'
import { DOCS_BUCKET, supabase } from '../../lib/supabase'
import { callContrat, type ContratDoc } from '../../lib/contrat'
import { formatDate } from '../../lib/format'
import { whatsappLink } from '../../lib/whatsapp'
import type { Order } from '../../lib/types'
import { ease } from '../../components/ease'

/** Contrato do devis: gerar (a Sarah assina na hora), enviar o link ao cliente, baixar o PDF */
export function ContratSection({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [docs, setDocs] = useState<ContratDoc[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [mailInfo, setMailInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, version, status, sha256, final_sha256, pdf_path, final_pdf_path, created_by, created_at, signed_at')
      .eq('order_id', order.id)
      .eq('kind', 'contrat')
      .order('version', { ascending: false })
    setDocs((data as ContratDoc[]) ?? [])
  }, [order.id])

  useEffect(() => {
    load()
  }, [load])

  const current = docs.find((d) => d.status !== 'remplace') ?? null

  type LinkResult = { link: string; emailed: string | null; email_error: string | null }

  async function run(action: () => Promise<LinkResult>) {
    setBusy(true)
    setError(null)
    try {
      const r = await action()
      setLink(r.link)
      setMailInfo(r.emailed ? `Lien envoyé par e-mail à ${r.emailed}.` : `E-mail non envoyé : ${r.email_error ?? 'erreur inconnue'} Envoyez le lien par WhatsApp.`)
      setCopied(false)
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const generate = () => run(() => callContrat<LinkResult>({ action: 'create', order_id: order.id }))
  const renew = (doc: ContratDoc) => run(() => callContrat<LinkResult>({ action: 'renew-link', document_id: doc.id }))

  async function download(path: string | null) {
    if (!path) return
    const { data } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 600, { download: true })
    if (data?.signedUrl) window.location.href = data.signedUrl
    else setError('Téléchargement impossible.')
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link).catch(() => undefined)
    setCopied(true)
  }

  const message = link
    ? `Bonjour ${order.contact_name}, voici le contrat du devis n° ${order.number} à signer en ligne (code de confirmation envoyé par e-mail) : ${link}`
    : ''

  return (
    <section className="contrat no-print" aria-label="Contrat">
      <h3 className="subhead">Contrat</h3>

      {!current && (
        <p className="muted small">
          Le contrat reprend les lignes et le prix de ce devis. Sarah le signe en le générant, le client le reçoit par e-mail et le signe en ligne :
          l’étape « Prix validé » se coche alors toute seule.
        </p>
      )}

      {current && (
        <div className={current.status === 'signe' ? 'contrat-card done' : 'contrat-card'}>
          <SealCheck size={24} weight={current.status === 'signe' ? 'fill' : 'light'} />
          <div>
            <p>
              <strong>Version {current.version}</strong>{' '}
              {current.status === 'signe' ? 'signée par le client' : 'en attente de la signature du client'}
            </p>
            <p className="muted small">
              Signé par {current.created_by} le {formatDate(current.created_at)}
              {current.signed_at && `, par le client le ${formatDate(current.signed_at)}`}
            </p>
          </div>
        </div>
      )}

      <div className="contrat-actions">
        {(!current || current.status === 'attente_client') && (
          <button className="chip-button accent" onClick={generate} disabled={busy}>
            <FileText size={16} weight="bold" />
            {busy ? 'Génération...' : current ? 'Régénérer le contrat' : 'Générer et signer le contrat'}
          </button>
        )}
        {current?.status === 'attente_client' && (
          <button className="chip-button" onClick={() => renew(current)} disabled={busy}>
            <ArrowsClockwise size={16} /> Nouveau lien client
          </button>
        )}
        {current && (
          <button className="chip-button" onClick={() => download(current.final_pdf_path ?? current.pdf_path)}>
            <DownloadSimple size={16} /> {current.status === 'signe' ? 'PDF signé' : 'PDF'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {link && (
          <motion.div
            className="contrat-link"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            {mailInfo && <p className="small">{mailInfo}</p>}
            <p className="small muted">Lien de signature pour le client (valable 30 jours, affiché une seule fois) :</p>
            <code>{link}</code>
            <div className="contrat-actions">
              <button className="chip-button" onClick={copy}>
                <Copy size={16} /> {copied ? 'Copié' : 'Copier le lien'}
              </button>
              <a className="chip-button" href={whatsappLink(order.contact_phone, message)} target="_blank" rel="noreferrer">
                <WhatsappLogo size={16} /> Envoyer sur WhatsApp
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {current && current.status === 'attente_client' && docs.length > 0 && (
        <p className="muted small">Si les lignes du devis changent, régénérez le contrat : l’ancien lien ne fonctionnera plus.</p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  )
}
