import { useState, type ClipboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ClipboardText, Copy, Plus, Trash, X } from '@phosphor-icons/react'
import { formatMoney } from '../lib/format'
import {
  duplicateLine,
  emptyLine,
  fixLine,
  lineErrors,
  parsePaste,
  productionSummary,
  sheetToSummaryInput,
  techniquesOf,
  totals,
  unitPrice,
  type Catalog,
  type SheetLine,
} from '../lib/orderSheet'
import { TECHNIQUES, type Technique } from '../lib/types'
import { ease } from './ease'

type Props = {
  catalog: Catalog
  lines: SheetLine[]
  onChange: (lines: SheetLine[]) => void
  showErrors?: boolean
}

export function OrderSheet({ catalog, lines, onChange, showErrors = false }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const first = lines[0] ?? emptyLine(catalog)
  const [bulk, setBulk] = useState({ product_id: first.product_id, technique: first.technique, color: first.color })

  const update = (key: string, patch: Partial<SheetLine>) =>
    onChange(lines.map((l) => (l.key === key ? fixLine({ ...l, ...patch }, catalog) : l)))

  const setOption = (line: SheetLine, code: string, patch: Partial<{ on: boolean; detail: string }>) => {
    const current = line.options[code] ?? { on: false, detail: '' }
    update(line.key, { options: { ...line.options, [code]: { ...current, ...patch } } })
  }

  const addLines = (n: number) => {
    const last = lines[lines.length - 1]
    const fresh = Array.from({ length: n }, () =>
      emptyLine(catalog, last ? { product_id: last.product_id, technique: last.technique, color: last.color, size: last.size } : undefined),
    )
    onChange([...lines, ...fresh])
  }

  const applyBulk = () => {
    onChange(lines.map((l) => fixLine({ ...l, product_id: bulk.product_id, technique: bulk.technique, color: bulk.color }, catalog)))
    setNotice(`Appliqué aux ${lines.length} lignes.`)
  }

  function importText(text: string) {
    const defaults = lines[lines.length - 1] ?? emptyLine(catalog)
    const { lines: parsed, warnings } = parsePaste(text, catalog, defaults)
    if (parsed.length === 0) {
      setNotice('Aucune ligne reconnue. Copiez les cellules du tableau (avec ou sans en-têtes).')
      return false
    }
    // Substitui as linhas ainda vazias em vez de somar depois delas
    const kept = lines.filter((l) => l.person_name || l.grade || l.remarks || l.quantity !== 1)
    onChange([...kept, ...parsed])
    setNotice(`${parsed.length} ligne(s) importée(s).${warnings.length ? ` À vérifier : ${warnings.slice(0, 3).join(' · ')}${warnings.length > 3 ? '…' : ''}` : ''}`)
    return true
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
    const text = e.clipboardData.getData('text/plain')
    // Colar várias células (Excel) em qualquer campo importa como linhas
    if (text.includes('\t') || text.trim().includes('\n')) {
      e.preventDefault()
      importText(text)
    }
  }

  const { cents, pieces } = totals(lines, catalog)
  const bulkProduct = catalog.products.find((p) => p.id === bulk.product_id)
  const sizeOrder = catalog.products[0]?.sizes ?? []
  const summary = productionSummary(sheetToSummaryInput(lines, catalog), sizeOrder)

  return (
    <div className="sheet" onPaste={onPaste}>
      <div className="sheet-tools">
        <div className="bulk">
          <span className="bulk-label">Pour toutes les lignes</span>
          <select value={bulk.product_id} onChange={(e) => {
            const p = catalog.products.find((x) => x.id === e.target.value)
            const techs = techniquesOf(p)
            setBulk({ product_id: e.target.value, technique: techs.includes(bulk.technique) ? bulk.technique : techs[0], color: p?.colors[0]?.name ?? '' })
          }} aria-label="Modèle">
            {catalog.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={bulk.technique} onChange={(e) => setBulk({ ...bulk, technique: e.target.value as Technique })} aria-label="Technique">
            {techniquesOf(bulkProduct).map((t) => <option key={t} value={t}>{TECHNIQUES[t]}</option>)}
          </select>
          {bulkProduct && bulkProduct.colors.length > 0 && (
            <select value={bulk.color} onChange={(e) => setBulk({ ...bulk, color: e.target.value })} aria-label="Couleur">
              {bulkProduct.colors.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          )}
          <button type="button" className="chip-button" onClick={applyBulk}>Appliquer</button>
        </div>
        <button type="button" className="chip-button accent" onClick={() => setPasteOpen(true)}>
          <ClipboardText size={18} weight="light" /> Coller depuis Excel
        </button>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.p className="sheet-notice" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {notice}
            <button type="button" className="icon-button small" onClick={() => setNotice(null)} aria-label="Fermer">
              <X size={14} />
            </button>
          </motion.p>
        )}
      </AnimatePresence>

      <div className="sheet-scroll">
        <div className="sheet-grid" role="table" aria-label="Bon de commande">
          <div className="sheet-row sheet-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Grade</span>
            <span role="columnheader">Nom</span>
            <span role="columnheader">Modèle</span>
            <span role="columnheader">Technique</span>
            <span role="columnheader">Taille</span>
            <span role="columnheader">Couleur</span>
            <span role="columnheader">Qté</span>
            <span role="columnheader">Options (+1€)</span>
            <span role="columnheader">Remarques</span>
            <span role="columnheader" className="num">Prix</span>
            <span role="columnheader" aria-label="Actions" />
          </div>

          <AnimatePresence initial={false}>
            {lines.map((line, i) => {
              const product = catalog.products.find((p) => p.id === line.product_id)
              const errors = showErrors ? lineErrors(line, catalog) : []
              return (
                <motion.div
                  key={line.key}
                  className={errors.length ? 'sheet-row has-error' : 'sheet-row'}
                  role="row"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.35, ease }}
                >
                  <span className="cell-num" role="cell">{i + 1}</span>
                  <label className="cell" role="cell" data-label="Grade">
                    <input value={line.grade} onChange={(e) => update(line.key, { grade: e.target.value })} maxLength={40} placeholder="SGT" />
                  </label>
                  <label className="cell cell-name" role="cell" data-label="Nom">
                    <input value={line.person_name} onChange={(e) => update(line.key, { person_name: e.target.value.toUpperCase() })} maxLength={80} placeholder="NOM" />
                  </label>
                  <label className="cell cell-model" role="cell" data-label="Modèle">
                    <select value={line.product_id} onChange={(e) => update(line.key, { product_id: e.target.value })}>
                      {catalog.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="cell" role="cell" data-label="Technique">
                    <select value={line.technique} onChange={(e) => update(line.key, { technique: e.target.value as Technique })}>
                      {techniquesOf(product).map((t) => <option key={t} value={t}>{TECHNIQUES[t]}</option>)}
                    </select>
                  </label>
                  <label className="cell" role="cell" data-label="Taille">
                    <select value={line.size} onChange={(e) => update(line.key, { size: e.target.value })}>
                      {product?.sizes.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="cell" role="cell" data-label="Couleur">
                    {product && product.colors.length > 0 ? (
                      <select value={line.color} onChange={(e) => update(line.key, { color: e.target.value })}>
                        {product.colors.map((c) => <option key={c.name}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input value={line.color} onChange={(e) => update(line.key, { color: e.target.value })} />
                    )}
                  </label>
                  <label className="cell cell-qty" role="cell" data-label="Qté">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      inputMode="numeric"
                      value={line.quantity || ''}
                      onChange={(e) => update(line.key, { quantity: Math.min(500, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                    />
                  </label>
                  <div className="cell cell-options" role="cell" data-label="Options">
                    {catalog.options.map((o) => {
                      const chosen = line.options[o.code]
                      return (
                        <div key={o.code} className="opt">
                          <label className={chosen?.on ? 'opt-toggle on' : 'opt-toggle'} title={o.description}>
                            <input type="checkbox" checked={!!chosen?.on} onChange={(e) => setOption(line, o.code, { on: e.target.checked })} />
                            <span>{shortOption(o.code, o.name)}</span>
                          </label>
                          {chosen?.on && o.needs_detail && (
                            <input
                              className="opt-detail"
                              value={chosen.detail}
                              onChange={(e) => setOption(line, o.code, { detail: e.target.value })}
                              placeholder={o.detail_label}
                              aria-label={`${o.name} : ${o.detail_label}`}
                              maxLength={80}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <label className="cell cell-remarks" role="cell" data-label="Remarques">
                    <input value={line.remarks} onChange={(e) => update(line.key, { remarks: e.target.value })} maxLength={300} />
                  </label>
                  <span className="cell-price num" role="cell">{formatMoney(unitPrice(line, catalog) * (line.quantity || 0))}</span>
                  <span className="cell-actions" role="cell">
                    <button type="button" className="icon-button small" onClick={() => {
                      const copy = duplicateLine(line)
                      onChange([...lines.slice(0, i + 1), copy, ...lines.slice(i + 1)])
                    }} aria-label={`Dupliquer la ligne ${i + 1}`} title="Dupliquer">
                      <Copy size={16} weight="light" />
                    </button>
                    <button type="button" className="icon-button small" onClick={() => onChange(lines.filter((l) => l.key !== line.key))} disabled={lines.length === 1} aria-label={`Supprimer la ligne ${i + 1}`} title="Supprimer">
                      <Trash size={16} weight="light" />
                    </button>
                  </span>
                  {errors.length > 0 && <span className="row-error">À compléter : {errors.join(', ')}</span>}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="sheet-add">
        <button type="button" className="chip-button" onClick={() => addLines(1)}>
          <Plus size={16} /> Ajouter une ligne
        </button>
        <button type="button" className="chip-button" onClick={() => addLines(10)}>
          <Plus size={16} /> 10 lignes
        </button>
      </div>

      <div className="sheet-summary">
        <div className="summary-table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Récapitulatif</th>
                {summary.sizes.map((s) => <th key={s}>{s}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {summary.sizes.map((s) => <td key={s}>{r.bySize[s] ?? ''}</td>)}
                  <td><strong>{r.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.options.length > 0 && (
            <p className="summary-options">
              {summary.options.map((o) => (
                <span key={o.name}>
                  {o.name} ×{o.total}
                  {o.details.length > 0 && <small> ({o.details.map(([d, n]) => `${d} ${n}`).join(', ')})</small>}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="sheet-total">
          <span>{pieces} pièce{pieces > 1 ? 's' : ''}</span>
          <motion.strong key={cents} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
            {formatMoney(cents)}
          </motion.strong>
        </div>
      </div>

      <AnimatePresence>
        {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onImport={(t) => importText(t) && setPasteOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

function shortOption(code: string, name: string) {
  if (code === 'drapeau_fr') return 'Drapeau FR'
  if (code === 'drapeau_nat') return 'Nationalité'
  if (code === 'insigne') return 'Insigne / logo'
  return name
}

function PasteDialog({ onClose, onImport }: { onClose: () => void; onImport: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="paste-dialog glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-title"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.45, ease }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="paste-head">
          <h2 id="paste-title">Coller depuis Excel</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><X size={20} weight="light" /></button>
        </div>
        <p className="muted">
          Sélectionnez les lignes de votre bon de commande (Excel, Google Sheets, Numbers), copiez, puis collez ici.
          Ordre attendu sans en-têtes : Grade, Nom, Taille, Couleur, Quantité, Drapeau FR, Drapeau nationalité, Autres options, Remarques.
        </p>
        <textarea
          autoFocus
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'SGT\tDUPONT\tL\tSable\t1\tOUI\tMaroc\tNON\t\nCPL\tMARTIN\tXL\tVert armée\t2\tNON\tNON\tOUI\t'}
        />
        <div className="paste-actions">
          <button type="button" className="link-button" onClick={onClose}>Annuler</button>
          <button type="button" className="btn" onClick={() => onImport(text)} disabled={!text.trim()}>Importer les lignes</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
