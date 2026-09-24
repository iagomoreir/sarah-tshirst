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
        <h1>Modelos</h1>
        <PillButton onClick={() => setDraft({ ...EMPTY, sort: products.length + 1 })} icon={<Plus size={16} weight="bold" />}>
          Novo modelo
        </PillButton>
      </header>

      {loading && <div className="sk sk-order" aria-hidden />}
      {!loading && products.length === 0 && <p className="column-empty">Nenhum produto ainda. Cadastre o primeiro.</p>}

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
                <p className="muted small">{p.sizes.join(' ')}</p>
              </div>
              <span className="small">
                {(Object.keys(TECHNIQUES) as Technique[])
                  .filter((t) => p.prices[t] != null)
                  .map((t) => `${TECHNIQUES[t]} ${formatMoney(p.prices[t]!)}`)
                  .join(' · ')}
              </span>
              <span className={p.active ? 'badge on' : 'badge'}>{p.active ? 'No site' : 'Oculto'}</span>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function upload(file: File) {
    setBusy(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('products').upload(path, file, { cacheControl: '31536000' })
    setBusy(false)
    if (error) return setError('Falha no envio da foto.')
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
      if (!Number.isFinite(cents) || cents <= 0) return setError(`Preço ${TECHNIQUES[t]} inválido.`)
      parsed[t] = cents
    }
    const sizeList = sizes.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (!draft.name.trim()) return setError('Dê um nome ao produto.')
    if (Object.keys(parsed).length === 0) return setError('Informe o preço de ao menos uma técnica.')
    if (sizeList.length === 0) return setError('Informe ao menos um tamanho.')
    const colors = draft.colors.filter((c) => c.name.trim())

    const row = { ...draft, name: draft.name.trim(), prices: parsed, sizes: sizeList, colors }
    delete row.id
    setBusy(true)
    const { error } = draft.id
      ? await supabase.from('products').update(row).eq('id', draft.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setError('Não foi possível salvar.')
    onSaved()
  }

  async function remove() {
    if (!draft.id || !confirm(`Excluir "${draft.name}"? Pedidos antigos continuam com o nome salvo.`)) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('id', draft.id)
    setBusy(false)
    if (error) return setError('Não foi possível excluir. Tente só ocultar do site.')
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
        aria-label="Editar produto"
      >
        <header className="drawer-head">
          <h2>{draft.id ? 'Editar produto' : 'Novo produto'}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} weight="light" />
          </button>
        </header>
        <form className="detail" onSubmit={save}>
          <label className="upload">
            {draft.image_url ? <img src={draft.image_url} alt="" /> : <ImageIcon size={32} weight="thin" />}
            <span>{draft.image_url ? 'Trocar foto' : 'Enviar foto'}</span>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} hidden />
          </label>
          <label className="field">
            <span>Nome</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <div className="field-row">
            {(Object.keys(TECHNIQUES) as Technique[]).map((t) => (
              <label className="field" key={t}>
                <span>Preço {TECHNIQUES[t]} (€)</span>
                <input value={prices[t]} onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))} inputMode="decimal" placeholder="vazio = indisponível" />
              </label>
            ))}
          </div>
          <label className="field">
            <span>Descrição</span>
            <textarea rows={3} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <label className="field">
            <span>Tamanhos</span>
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} />
            <small className="muted">Separados por vírgula. Ex.: S, M, L, XL, 2XL, 3XL</small>
          </label>
          <fieldset className="field">
            <legend>Cores</legend>
            {draft.colors.map((c, i) => (
              <div className="color-row" key={i}>
                <input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} aria-label="Tom" />
                <input value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Nome da cor" aria-label="Nome da cor" />
                <button type="button" className="icon-button small" onClick={() => set('colors', draft.colors.filter((_, idx) => idx !== i))} aria-label="Remover cor">
                  <Trash size={16} weight="light" />
                </button>
              </div>
            ))}
            <button type="button" className="link-button" onClick={() => set('colors', [...draft.colors, { name: '', hex: '#ffffff' }])}>
              + Adicionar cor
            </button>
          </fieldset>
          <div className="field-row">
            <label className="toggle">
              <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
              <span>Mostrar no site</span>
            </label>
            <label className="field">
              <span>Ordem</span>
              <input type="number" value={draft.sort} onChange={(e) => set('sort', Number(e.target.value))} />
            </label>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="drawer-foot">
            <PillButton type="submit" className="full" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar'}
            </PillButton>
            {draft.id && (
              <button type="button" className="link-button danger" onClick={remove} disabled={busy}>
                Excluir produto
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
      <h2 className="subhead">Opções (por peça)</h2>
      <ul className="product-list">
        {options.map((o) => (
          <li key={o.id} className="option-row">
            <input className="plain-input" defaultValue={o.name} onBlur={(e) => e.target.value !== o.name && save(o, { name: e.target.value })} aria-label="Nome da opção" />
            <label className="price-input">
              <input
                defaultValue={(o.price_cents / 100).toFixed(2).replace('.', ',')}
                inputMode="decimal"
                onBlur={(e) => {
                  const cents = Math.round(Number(e.target.value.replace(',', '.')) * 100)
                  if (Number.isFinite(cents) && cents >= 0 && cents !== o.price_cents) save(o, { price_cents: cents })
                }}
                aria-label="Preço"
              />
              <span>€</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={o.active} onChange={(e) => save(o, { active: e.target.checked })} />
              <span>{saving === o.id ? 'Salvando...' : 'Ativa'}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
