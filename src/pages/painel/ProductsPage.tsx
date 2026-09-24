import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Image as ImageIcon, Plus, Trash, X } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../lib/format'
import { TECHNIQUES, type OrderOption, type Product, type ProductColor, type Technique } from '../../lib/types'
import { PillButton } from '../../components/motion'
import { ease } from '../../components/ease'

type Draft = Omit<Product, 'id'> & { id?: string }

const EMPTY: Draft = {
  kind: 'textile',
  price_from: null,
  name: '',
  description: '',
  prices: { dtf: 2500, sublimation: 1600 },
  sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  colors: [],
  image_url: null,
  active: true,
  sort: 0,
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)

  async function load() {
    const { data } = await supabase.from('products').select('*').order('sort').order('created_at')
    setProducts((data as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <header className="panel-head">
        <h1>Produits</h1>
        <PillButton onClick={() => setDraft({ ...EMPTY, sort: products.length + 1 })} icon={<Plus size={16} weight="bold" />}>
          Nouveau produit
        </PillButton>
      </header>

      {loading && <div className="sk sk-order" aria-hidden />}
      {!loading && products.length === 0 && <p className="column-empty">Aucun modèle pour l’instant. Ajoutez le premier.</p>}

      <ul className="product-list">
        {products.map((p, i) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease, delay: i * 0.03 }}
          >
            <button className="product-row" onClick={() => setDraft(p)}>
              <div className="thumb">{p.image_url ? <img src={p.image_url} alt="" /> : <span>{p.name.charAt(0)}</span>}</div>
              <div>
                <p>{p.name}</p>
                <p className="muted small">{p.kind === 'objet' ? 'Objet / cadeau (sur devis)' : `Textile · ${p.sizes.join(' ')}`}</p>
              </div>
              <span className="small">
                {p.kind === 'objet'
                  ? p.price_from != null
                    ? `À partir de ${formatMoney(p.price_from)}`
                    : 'Sur devis'
                  : (Object.keys(TECHNIQUES) as Technique[])
                      .filter((t) => p.prices[t] != null)
                      .map((t) => `${TECHNIQUES[t]} ${formatMoney(p.prices[t]!)}`)
                      .join(' · ')}
              </span>
              <span className={p.active ? 'badge on' : 'badge'}>{p.active ? 'En ligne' : 'Masqué'}</span>
            </button>
          </motion.li>
        ))}
      </ul>

      <OptionsEditor />

      <AnimatePresence>
        {draft && (
          <ProductEditor
            key={draft.id ?? 'new'}
            initial={draft}
            onClose={() => setDraft(null)}
            onSaved={() => {
              setDraft(null)
              load()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ProductEditor({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial)
  const toText = (c?: number) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))
  const [prices, setPrices] = useState<Record<Technique, string>>({ dtf: toText(initial.prices.dtf), sublimation: toText(initial.prices.sublimation) })
  const [sizes, setSizes] = useState(initial.sizes.join(', '))
  const [priceFrom, setPriceFrom] = useState(toText(initial.price_from ?? undefined))
  const isTextile = draft.kind === 'textile'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function upload(file: File) {
    setBusy(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('products').upload(path, file, { cacheControl: '31536000' })
    setBusy(false)
    if (error) return setError('Échec de l’envoi de la photo.')
    set('image_url', supabase.storage.from('products').getPublicUrl(path).data.publicUrl)
  }

  function setColor(i: number, patch: Partial<ProductColor>) {
    set(
      'colors',
      draft.colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed: Partial<Record<Technique, number>> = {}
    for (const t of Object.keys(TECHNIQUES) as Technique[]) {
      const raw = prices[t].replace(/\s|€/g, '').replace(',', '.')
      if (!raw) continue
      const cents = Math.round(Number(raw) * 100)
      if (!Number.isFinite(cents) || cents <= 0) return setError(`Prix ${TECHNIQUES[t]} invalide.`)
      parsed[t] = cents
    }
    const sizeList = sizes.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (!draft.name.trim()) return setError('Donnez un nom au produit.')
    if (isTextile && Object.keys(parsed).length === 0) return setError('Indiquez le prix d’au moins une technique.')
    if (isTextile && sizeList.length === 0) return setError('Indiquez au moins une taille.')
    const colors = draft.colors.filter((c) => c.name.trim())
    const fromRaw = priceFrom.replace(/\s|€/g, '').replace(',', '.')
    const fromCents = fromRaw ? Math.round(Number(fromRaw) * 100) : null
    if (fromCents != null && (!Number.isFinite(fromCents) || fromCents < 0)) return setError('Prix « à partir de » invalide.')

    const { id: _id, ...base } = draft
    const row: Omit<Draft, 'id'> = isTextile
      ? { ...base, name: draft.name.trim(), prices: parsed, sizes: sizeList, colors, price_from: null }
      : { ...base, name: draft.name.trim(), prices: {}, sizes: [], colors: [], price_from: fromCents }
    setBusy(true)
    const { error } = draft.id
      ? await supabase.from('products').update(row).eq('id', draft.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setError('Enregistrement impossible.')
    onSaved()
  }

  async function remove() {
    if (!draft.id || !confirm(`Supprimer "${draft.name}"? Les anciennes commandes gardent le nom enregistré.`)) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('id', draft.id)
    setBusy(false)
    if (error) return setError('Suppression impossible. Masquez-le plutôt du site.')
    onSaved()
  }

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside
        className="drawer glass wide"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.5, ease }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier le produit"
      >
        <header className="drawer-head">
          <h2>{draft.id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={20} weight="light" />
          </button>
        </header>
        <form className="detail" onSubmit={save}>
          <label className="upload">
            {draft.image_url ? <img src={draft.image_url} alt="" /> : <ImageIcon size={32} weight="thin" />}
            <span>{draft.image_url ? 'Changer la photo' : 'Ajouter une photo'}</span>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} hidden />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={draft.kind} onChange={(e) => set('kind', e.target.value as Draft['kind'])}>
              <option value="textile">Textile (dans le bon de commande)</option>
              <option value="objet">Objet / cadeau (vitrine, devis sur WhatsApp)</option>
            </select>
          </label>
          <label className="field">
            <span>Nom</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          {!isTextile && (
            <label className="field">
              <span>Prix « à partir de » (€)</span>
              <input value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} inputMode="decimal" placeholder="vide = sur devis" />
            </label>
          )}
          {isTextile && <div className="field-row">
            {(Object.keys(TECHNIQUES) as Technique[]).map((t) => (
              <label className="field" key={t}>
                <span>Prix {TECHNIQUES[t]} (€)</span>
                <input value={prices[t]} onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))} inputMode="decimal" placeholder="vide = indisponible" />
              </label>
            ))}
          </div>}
          <label className="field">
            <span>Description</span>
            <textarea rows={3} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          {isTextile && <>
          <label className="field">
            <span>Tailles</span>
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} />
            <small className="muted">Séparées par des virgules. Ex. : S, M, L, XL, 2XL, 3XL</small>
          </label>
          <fieldset className="field">
            <legend>Couleurs</legend>
            {draft.colors.map((c, i) => (
              <div className="color-row" key={i}>
                <input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} aria-label="Teinte" />
                <input value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Nom de la couleur" aria-label="Nom de la couleur" />
                <button type="button" className="icon-button small" onClick={() => set('colors', draft.colors.filter((_, idx) => idx !== i))} aria-label="Retirer la couleur">
                  <Trash size={16} weight="light" />
                </button>
              </div>
            ))}
            <button type="button" className="link-button" onClick={() => set('colors', [...draft.colors, { name: '', hex: '#ffffff' }])}>
              + Ajouter une couleur
            </button>
          </fieldset>
          </>}
          <div className="field-row">
            <label className="toggle">
              <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
              <span>Afficher sur le site</span>
            </label>
            <label className="field">
              <span>Ordre</span>
              <input type="number" value={draft.sort} onChange={(e) => set('sort', Number(e.target.value))} />
            </label>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="drawer-foot">
            <PillButton type="submit" className="full" disabled={busy}>
              {busy ? 'Enregistrement...' : 'Enregistrer'}
            </PillButton>
            {draft.id && (
              <button type="button" className="link-button danger" onClick={remove} disabled={busy}>
                Supprimer le produit
              </button>
            )}
          </div>
        </form>
      </motion.aside>
    </motion.div>
  )
}

function OptionsEditor() {
  const [options, setOptions] = useState<OrderOption[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('options').select('*').order('sort').then(({ data }) => setOptions((data as OrderOption[]) ?? []))
  }, [])

  async function save(o: OrderOption, patch: Partial<OrderOption>) {
    const next = { ...o, ...patch }
    setOptions((list) => list.map((x) => (x.id === o.id ? next : x)))
    setSaving(o.id)
    await supabase.from('options').update(patch).eq('id', o.id)
    setSaving(null)
  }

  return (
    <section className="options-editor">
      <h2 className="subhead">Options (par pièce)</h2>
      <ul className="product-list">
        {options.map((o) => (
          <li key={o.id} className="option-row">
            <input className="plain-input" defaultValue={o.name} onBlur={(e) => e.target.value !== o.name && save(o, { name: e.target.value })} aria-label="Nom de l’option" />
            <label className="price-input">
              <input
                defaultValue={(o.price_cents / 100).toFixed(2).replace('.', ',')}
                inputMode="decimal"
                onBlur={(e) => {
                  const cents = Math.round(Number(e.target.value.replace(',', '.')) * 100)
                  if (Number.isFinite(cents) && cents >= 0 && cents !== o.price_cents) save(o, { price_cents: cents })
                }}
                aria-label="Prix"
              />
              <span>€</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={o.active} onChange={(e) => save(o, { active: e.target.checked })} />
              <span>{saving === o.id ? 'Enregistrement...' : 'Active'}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
