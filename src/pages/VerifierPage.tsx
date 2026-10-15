import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle, DownloadSimple, FileArrowUp, Question, WarningCircle } from '@phosphor-icons/react'
import { callContrat, sha256OfFile, type VerifyResult, type VerifySigner } from '../lib/contrat'
import { formatDate, formatMoney } from '../lib/format'
import { IslandNav } from '../components/IslandNav'
import { WordsReveal } from '../components/motion'
import { ease } from '../components/ease'

/** Verificação pública: o PDF não sai do navegador, só a impressão digital SHA-256 */
export function VerifierPage() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check(f: File) {
    setFile(f)
    setResult(null)
    setError(null)
    setBusy(true)
    try {
      const h = await sha256OfFile(f)
      setHash(h)
      setResult(await callContrat<VerifyResult>({ action: 'verify', sha256: h }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="store signer">
      <IslandNav showCta={false} />
      <div className="signer-inner verifier">
        <header className="commande-head">
          <h1 className="display">
            <WordsReveal text="Vérifier un document" />
          </h1>
          <p className="muted">
            Déposez un contrat de Sarah Nani Créations au format PDF. Le fichier reste sur votre appareil : seule son empreinte SHA-256 est comparée au registre des
            signatures.
          </p>
        </header>

        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) check(f)
          }}
        >
          <FileArrowUp size={32} weight="light" />
          <span>{file ? file.name : 'Choisir ou déposer le PDF'}</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
        </label>

        {busy && <div className="sk sk-order" aria-hidden />}
        {error && <p className="notice error">{error}</p>}

        <AnimatePresence mode="wait">
          {result && (
            <motion.section
              key={hash}
              className="verify-result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              {!result.found ? (
                <div className="verify-head bad">
                  <Question size={32} weight="fill" />
                  <div>
                    <h2>Document non reconnu</h2>
                    <p className="muted">
                      Ce fichier ne correspond à aucun document émis. S’il s’agit d’un contrat de Sarah Nani Créations, il a pu être modifié après sa signature.
                    </p>
                  </div>
                </div>
              ) : (
                <Found result={result} />
              )}
              <p className="muted small verify-hash">Empreinte SHA-256 du fichier : {hash}</p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Found({ result }: { result: Extract<VerifyResult, { found: true }> }) {
  const allOk = result.signers.length > 0 && result.signers.every((s) => s.integrity_ok && s.seal_ok && s.chain_ok)
  const signedByClient = result.signers.some((s) => s.role === 'client')
  const title = !allOk
    ? 'Preuves incohérentes'
    : result.matched === 'final'
      ? 'Contrat authentique, signé par les deux parties'
      : signedByClient
        ? 'Contrat authentique (version avant signature du client)'
        : 'Contrat authentique, en attente de la signature du client'
  return (
    <>
      <div className={allOk ? 'verify-head ok' : 'verify-head bad'}>
        {allOk ? <CheckCircle size={32} weight="fill" /> : <WarningCircle size={32} weight="fill" />}
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {result.company}, devis n° {result.order_number} (version {result.version}), {result.client}, {formatMoney(result.total_cents)} TTC, émis le{' '}
            {formatDate(result.issued_at)}.
          </p>
        </div>
      </div>
      <ul className="verify-signers">
        {result.signers.map((s) => (
          <Signer key={s.event_hash} s={s} orderNumber={result.order_number} />
        ))}
      </ul>
    </>
  )
}

function Signer({ s, orderNumber }: { s: VerifySigner; orderNumber: number }) {
  const checks: [string, boolean][] = [
    ['Contenu intact', s.integrity_ok],
    ['Cachet électronique valide', s.seal_ok],
    ['Chaîne des preuves continue', s.chain_ok],
  ]
  const tsr = s.tsa_token ? `data:application/timestamp-reply;base64,${s.tsa_token}` : null
  return (
    <li>
      <p className="eyebrow">{s.role === 'sarah' ? 'Émetteur' : 'Client'}</p>
      <p>
        <strong>{s.nom}</strong>
        {s.unite && <span className="muted">, {s.unite}</span>}
      </p>
      <p className="muted small">
        Signé le {formatDate(s.date)}
        {s.email && `, e-mail ${s.email} vérifié par code`}
      </p>
      <ul className="verify-checks">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? 'ok' : 'bad'}>
            {ok ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />} {label}
          </li>
        ))}
        <li className={s.tsa_time ? 'ok' : 'none'}>
          {s.tsa_time ? <CheckCircle size={16} weight="fill" /> : <Question size={16} weight="fill" />}{' '}
          {s.tsa_time ? `Horodatage tiers : ${formatDate(s.tsa_time)}` : 'Horodatage tiers indisponible'}
          {tsr && (
            <a className="link-button" href={tsr} download={`devis-${orderNumber}-${s.role}.tsr`}>
              <DownloadSimple size={14} /> .tsr
            </a>
          )}
        </li>
      </ul>
    </li>
  )
}
