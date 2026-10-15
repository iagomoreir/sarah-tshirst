import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FilePdf, ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react'
import {
  ACCEPT,
  analyseFile,
  formatBytes,
  MAX_VISUELS,
  PLACEMENTS,
  QUALITY_INFO,
  withPlacement,
  type PickedVisuel,
  type Placement,
} from '../lib/visuels'
import { ease } from './ease'

/** Conselhos de qualidade, mostrados antes do botão de envio */
export function VisuelsGuide() {
  return (
    <div className="visuels-guide">
      <p className="small">
        <strong>Pour une impression nette</strong>
      </p>
      <ul className="small">
        <li>
          <span className="q-dot ok" aria-hidden /> <strong>Idéal :</strong> fichier vectoriel (PDF, SVG, AI ou EPS), net à toutes les tailles.
        </li>
        <li>
          <span className="q-dot ok" aria-hidden /> <strong>Très bien :</strong> PNG à fond transparent en haute définition, environ 3 500 px de large pour un devant ou un dos,
          1 100 px pour une manche.
        </li>
        <li>
          <span className="q-dot bad" aria-hidden /> <strong>À éviter :</strong> captures d’écran, images reçues par WhatsApp ou Facebook (elles sont compressées), photo d’un
          écran.
        </li>
      </ul>
      <p className="small muted">La qualité de chaque fichier est vérifiée dès que vous le choisissez. 50 Mo maximum par fichier.</p>
    </div>
  )
}

export function QualityBadge({ quality }: { quality: PickedVisuel['quality'] }) {
  const info = QUALITY_INFO[quality]
  return (
    <span className={`q-badge ${info.tone}`}>
      <span className={`q-dot ${info.tone}`} aria-hidden /> {info.label}
    </span>
  )
}

export function VisuelsPicker({
  items,
  onChange,
  disabled = false,
  max = MAX_VISUELS,
}: {
  items: PickedVisuel[]
  onChange: (items: PickedVisuel[]) => void
  disabled?: boolean
  max?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const [placement, setPlacement] = useState<Placement>('devant')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])

  // Libera as miniaturas da memória ao sair
  useEffect(() => () => latest.current.forEach((v) => v.preview && URL.revokeObjectURL(v.preview)), [])

  async function pick(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const added: PickedVisuel[] = []
    const problems: string[] = []
    for (const file of Array.from(files)) {
      if (items.length + added.length >= max) {
        problems.push(`${file.name} : ${max} fichiers maximum`)
        continue
      }
      const r = await analyseFile(file, placement)
      if ('reason' in r) problems.push(`${r.name} : ${r.reason}`)
      else added.push(r)
    }
    setErrors(problems)
    onChange([...items, ...added])
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  function remove(key: string) {
    const v = items.find((i) => i.key === key)
    if (v?.preview) URL.revokeObjectURL(v.preview)
    onChange(items.filter((i) => i.key !== key))
  }

  return (
    <div className="visuels-picker">
      <div className="visuels-add">
        <label className="field">
          <span>Emplacement</span>
          <select value={placement} onChange={(e) => setPlacement(e.target.value as Placement)} disabled={disabled}>
            {PLACEMENTS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="chip-button accent" onClick={() => input.current?.click()} disabled={disabled || busy || items.length >= max}>
          <UploadSimple size={16} weight="bold" /> {busy ? 'Vérification...' : 'Choisir des fichiers'}
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} />
      </div>

      {errors.length > 0 && (
        <ul className="field-error small visuels-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <ul className="visuels-list">
        <AnimatePresence initial={false}>
          {items.map((v) => (
            <motion.li
              key={v.key}
              className="visuel-item"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease }}
            >
              <div className="visuel-thumb">
                {v.preview ? <img src={v.preview} alt="" /> : v.ext === 'pdf' ? <FilePdf size={28} weight="light" /> : <ImageSquare size={28} weight="light" />}
              </div>
              <div className="visuel-info">
                <p className="visuel-name" title={v.file.name}>
                  {v.file.name}
                </p>
                <p className="small muted">
                  {formatBytes(v.file.size)}
                  {v.width && v.height ? ` · ${v.width} × ${v.height} px` : ''}
                </p>
                <QualityBadge quality={v.quality} />
                {v.quality === 'faible' && <p className="small muted">Le visuel risque d’être flou. Envoyez une version plus grande si vous l’avez.</p>}
                {v.note && <p className="small muted">{v.note}</p>}
              </div>
              <div className="visuel-side">
                <select
                  aria-label={`Emplacement de ${v.file.name}`}
                  value={v.placement}
                  disabled={disabled}
                  onChange={(e) => onChange(items.map((i) => (i.key === v.key ? withPlacement(i, e.target.value as Placement) : i)))}
                >
                  {PLACEMENTS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-button small" onClick={() => remove(v.key)} disabled={disabled} aria-label={`Retirer ${v.file.name}`}>
                  <Trash size={16} />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}
