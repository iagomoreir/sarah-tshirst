import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { DownloadSimple, EnvelopeSimple, Eraser, FilePdf, PenNib, SealCheck } from '@phosphor-icons/react'
import { callContrat, type ClientView } from '../lib/contrat'
import { formatDate, formatMoney } from '../lib/format'
import { IslandNav } from '../components/IslandNav'
import { PillButton, WordsReveal } from '../components/motion'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'
import { ease } from '../components/ease'

const CONSENT =
  'Lu et approuvé, bon pour accord. Je confirme avoir pris connaissance du contrat, des prix TTC et des conditions, et je le signe électroniquement.'

/** Página pública onde o cliente lê e assina o contrato (link enviado pela Sarah) */
export function SignerPage() {
  const { token = '' } = useParams()
  const [view, setView] = useState<ClientView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setView(await callContrat<ClientView>({ action: 'client-view', token }))
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="store signer">
      <IslandNav showCta={false} />
      <div className="signer-inner">
        <header className="commande-head">
          <h1 className="display">
            <WordsReveal text="Signature du contrat" />
          </h1>
        </header>

        {loadError && <p className="notice error">{loadError}</p>}
        {!view && !loadError && <div className="sk sheet-sk" aria-hidden />}
        {view && <Contract view={view} token={token} onSigned={load} />}

        <p className="muted small signer-foot">
          Vous pouvez vérifier à tout moment un contrat signé sur <Link to="/verifier">la page de vérification</Link>.
        </p>
      </div>
    </div>
  )
}

function Contract({ view, token, onSigned }: { view: ClientView; token: string; onSigned: () => void }) {
  const s = view.snapshot
  const [showLines, setShowLines] = useState(false)

  return (
    <div className="signer-grid">
      <section className="signer-summary">
        <p className="eyebrow">Devis n° {s.order_number}, version {s.version}</p>
        <h2>{s.client.unit || s.client.name}</h2>
        <dl className="signer-figures">
          <div>
            <dt>Total TTC</dt>
            <dd>{formatMoney(s.total_cents)}</dd>
          </div>
          <div>
            <dt>Acompte ({s.acompte_pct} %)</dt>
            <dd>{formatMoney(s.acompte_cents)}</dd>
          </div>
          <div>
            <dt>Pièces</dt>
            <dd>{s.pieces}</dd>
          </div>
        </dl>
        {view.sarah && (
          <p className="small muted">
            <SealCheck size={16} weight="fill" className="accent-icon" /> Signé par {view.sarah.nom} pour {s.company.company_name} le {formatDate(view.sarah.date)}
          </p>
        )}
        <div className="contrat-actions">
          {view.pdf_url && (
            <a className="chip-button accent" href={view.pdf_url} target="_blank" rel="noreferrer">
              <FilePdf size={16} weight="bold" /> {view.status === 'signe' ? 'Contrat signé (PDF)' : 'Lire le contrat (PDF)'}
            </a>
          )}
          <button className="chip-button" onClick={() => setShowLines((v) => !v)} aria-expanded={showLines}>
            {showLines ? 'Masquer le détail' : `Voir les ${s.lines.length} lignes`}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {showLines && (
            <motion.div
              className="lines-wrap"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease }}
            >
              <table className="lines-table">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Nom</th>
                    <th>Modèle</th>
                    <th>Taille</th>
                    <th>Couleur</th>
                    <th>Qté</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => (
                    <tr key={l.position}>
                      <td>{l.grade}</td>
                      <td>
                        <strong>{l.name}</strong>
                      </td>
                      <td>
                        {l.product} <small className="muted">{l.technique}</small>
                      </td>
                      <td>{l.size}</td>
                      <td>{l.color}</td>
                      <td>{l.quantity}</td>
                      <td className="num">{formatMoney(l.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
        <details className="signer-conditions">
          <summary>Conditions</summary>
          <p>{s.conditions}</p>
        </details>
      </section>

      {view.status === 'signe' ? (
        <section className="card-form signer-done">
          <SealCheck size={40} weight="fill" className="accent-icon" />
          <h2>Contrat signé</h2>
          <p>
            Signé par {view.client?.nom} le {view.client && formatDate(view.client.date)}. Merci ! Sarah reprend contact avec vous pour la suite.
          </p>
        </section>
      ) : (
        <SignForm token={token} onSigned={onSigned} defaultName={s.client.name} defaultUnit={s.client.unit} defaultEmail={s.client.email} />
      )}
    </div>
  )
}

function SignForm({
  token,
  onSigned,
  defaultName,
  defaultUnit,
  defaultEmail,
}: {
  token: string
  onSigned: () => void
  defaultName: string
  defaultUnit: string
  defaultEmail: string
}) {
  const pad = useRef<SignaturePadHandle>(null)
  const [nom, setNom] = useState(defaultName)
  const [grade, setGrade] = useState('')
  const [unite, setUnite] = useState(defaultUnit)
  const [email, setEmail] = useState(defaultEmail)
  const [consent, setConsent] = useState(false)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  async function sendCode() {
    setError(null)
    if (nom.trim().length < 2) return setError('Indiquez votre nom.')
    if (pad.current?.isEmpty() !== false) return setError('Dessinez votre signature.')
    if (!consent) return setError('Cochez « Lu et approuvé » pour continuer.')
    setBusy(true)
    try {
      const r = await callContrat<{ email: string }>({ action: 'client-otp', token, email })
      setCodeSentTo(r.email)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sign(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const signature = pad.current?.toPng()
    if (!signature) return setError('Dessinez votre signature.')
    setBusy(true)
    try {
      const r = await callContrat<{ pdf_url: string | null }>({ action: 'client-sign', token, code, nom, grade, unite, consent, signature })
      setPdfUrl(r.pdf_url)
      onSigned()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (pdfUrl !== null) {
    return (
      <section className="card-form signer-done">
        <SealCheck size={40} weight="fill" className="accent-icon" />
        <h2>Contrat signé</h2>
        {pdfUrl && (
          <a className="chip-button accent" href={pdfUrl} target="_blank" rel="noreferrer">
            <DownloadSimple size={16} weight="bold" /> Télécharger le contrat signé
          </a>
        )}
      </section>
    )
  }

  return (
    <form className="card-form signer-form" onSubmit={sign}>
      <h2 className="subhead">Vos informations</h2>
      <div className="field-row">
        <label className="field">
          <span>Grade</span>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Facultatif" autoComplete="honorific-prefix" />
        </label>
        <label className="field">
          <span>Nom et prénom</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} required minLength={2} autoComplete="name" />
        </label>
      </div>
      <label className="field">
        <span>Unité ou organisme</span>
        <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="Facultatif" autoComplete="organization" />
      </label>
      <label className="field">
        <span>E-mail (le code de confirmation y sera envoyé)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" disabled={!!codeSentTo} />
      </label>

      <div className="field">
        <span className="signature-label">
          <PenNib size={16} /> Votre signature
          <button type="button" className="link-button" onClick={() => pad.current?.clear()}>
            <Eraser size={14} /> Effacer
          </button>
        </span>
        <SignaturePad ref={pad} />
      </div>

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{CONSENT}</span>
      </label>

      <AnimatePresence initial={false} mode="wait">
        {!codeSentTo ? (
          <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PillButton type="button" className="full" onClick={sendCode} disabled={busy} icon={<EnvelopeSimple size={16} weight="bold" />}>
              {busy ? 'Envoi...' : 'Recevoir le code par e-mail'}
            </PillButton>
          </motion.div>
        ) : (
          <motion.div key="code" className="signer-code" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
            <label className="field">
              <span>Code reçu à {codeSentTo}</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
                placeholder="000000"
              />
            </label>
            <PillButton type="submit" className="full" disabled={busy || code.length !== 6} icon={<SealCheck size={16} weight="bold" />}>
              {busy ? 'Signature...' : 'Signer le contrat'}
            </PillButton>
            <button type="button" className="link-button" onClick={sendCode} disabled={busy}>
              Renvoyer un code
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">
        Votre signature, la date, l’adresse IP et la vérification de votre e-mail sont enregistrées comme preuve et horodatées par une autorité tierce.
      </p>
    </form>
  )
}
