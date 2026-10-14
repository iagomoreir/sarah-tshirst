import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle, Circle, DownloadSimple, Plus, Printer, Trash, WhatsappLogo, X } from '@phosphor-icons/react'
import { DB_SCHEMA, supabase } from '../../lib/supabase'
import { formatDate, formatMoney } from '../../lib/format'
import { DEVIS_STEPS, devisProgress, STATUS_FLOW, STATUS_LABELS, type DevisStep, type Order, type OrderStatus } from '../../lib/types'
import { whatsappLink } from '../../lib/whatsapp'
import { downloadText, itemsByModel, itemsToCsv, productionSummary, SIZE_ORDER } from '../../lib/orderSheet'
import { TECHNIQUES } from '../../lib/types'
import { ease } from '../../components/ease'
import { useAuth } from '../../auth/auth'

type Mode = 'commandes' | 'devis'
type OrderPatch = Partial<Pick<Order, 'status' | 'internal_note' | `${DevisStep}_ok_at`>>

export function OrdersPage({ mode }: { mode: Mode }) {
  const isDevis = mode === 'devis'
  const { staff } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const base = supabase.from('orders').select('*, order_items(*)')
    const { data, error } = await (isDevis ? base.eq('status', 'devis') : base.neq('status', 'devis'))
      .order('position', { referencedTable: 'order_items' })
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setError(isDevis ? 'Impossible de charger les devis.' : 'Impossible de charger les commandes.')
    else setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [isDevis])

  useEffect(() => {
    load()
    // Pedido novo ou alterado em outro aparelho: recarrega
    const channel = supabase
      .channel(`orders-${mode}`)
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'orders' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, mode])

  async function update(order: Order, patch: OrderPatch) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)))
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
    if (error) {
      setError('Enregistrement impossible. Rechargement...')
      load()
      return
    }
    // Étape do devis: o banco grava hora e autor e pode converter em commande
    if (isDevis && Object.keys(patch).some((k) => k.endsWith('_ok_at'))) load()
  }

  async function remove(order: Order) {
    if (!confirm(`Supprimer définitivement la commande n° ${order.number} ? Cette action est irréversible.`)) return
    const { data, error } = await supabase.from('orders').delete().eq('id', order.id).select('id')
    if (error || !data?.length) return setError('Suppression impossible.')
    setOpenId(null)
    setOrders((prev) => prev.filter((o) => o.id !== order.id))
  }

  function move(order: Order, dir: 1 | -1) {
    const next = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + dir]
    if (next) update(order, { status: next })
  }

  const columns: OrderStatus[] = showCancelled ? [...STATUS_FLOW, 'cancelado'] : STATUS_FLOW
  const openOrder = orders.find((o) => o.id === openId) ?? null

  return (
    <div className="orders-page">
      <header className="panel-head">
        <h1>{isDevis ? 'Devis' : 'Commandes'}</h1>
        <Link to="/painel/novo" className="pill pill-solid">
          <span>Nouveau devis</span>
          <span className="pill-icon"><Plus size={16} weight="bold" /></span>
        </Link>
        {!isDevis && (
          <label className="toggle">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            <span>Afficher les annulées</span>
          </label>
        )}
      </header>
      {error && <p className="notice error">{error}</p>}

      {isDevis ? (
        <DevisList orders={orders} loading={loading} onOpen={setOpenId} />
      ) : (
      <LayoutGroup>
        <div className="board" style={{ ['--cols' as string]: columns.length }}>
          {columns.map((status) => {
            const list = orders.filter((o) => o.status === status)
            return (
              <section key={status} className={`column column-${status}`}>
                <h2>
                  {STATUS_LABELS[status]} <span className="count">{list.length}</span>
                </h2>
                {loading && <div className="sk sk-order" aria-hidden />}
                {!loading && list.length === 0 && <p className="column-empty">Rien ici.</p>}
                <AnimatePresence>
                  {list.map((order) => (
                    <motion.article
                      key={order.id}
                      layoutId={`order-${order.id}`}
                      className="order-card"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    >
                      <button className="order-open" onClick={() => setOpenId(order.id)}>
                        <div className="order-top">
                          <strong>#{order.number}</strong>
                          <span className="muted small">{formatDate(order.created_at)}</span>
                        </div>
                        <p>{order.unit || order.contact_name}</p>
                        {order.unit && <p className="muted small">{order.contact_name}</p>}
                        <p className="muted small">
                          {order.pieces} pièce(s), {formatMoney(order.total_cents)}
                        </p>
                      </button>
                      {status !== 'cancelado' && (
                        <div className="order-moves">
                          <button
                            className="icon-button small"
                            disabled={status === STATUS_FLOW[0]}
                            onClick={() => move(order, -1)}
                            aria-label="Étape précédente"
                          >
                            <ArrowLeft size={16} />
                          </button>
                          <button
                            className="icon-button small"
                            disabled={status === STATUS_FLOW[STATUS_FLOW.length - 1]}
                            onClick={() => move(order, 1)}
                            aria-label="Étape suivante"
                          >
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                    </motion.article>
                  ))}
                </AnimatePresence>
              </section>
            )
          })}
        </div>
      </LayoutGroup>
      )}

      <AnimatePresence>
        {openOrder && (
          <OrderDetail
            key={openOrder.id}
            order={openOrder}
            canDelete={staff?.role === 'webmaster'}
            onClose={() => setOpenId(null)}
            onUpdate={(patch) => update(openOrder, patch)}
            onDelete={() => remove(openOrder)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function DevisList({ orders, loading, onOpen }: { orders: Order[]; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) return <div className="devis-grid"><div className="sk sk-order" aria-hidden /></div>
  if (orders.length === 0) return <p className="column-empty">Aucun devis en cours.</p>
  return (
    <div className="devis-grid">
      <AnimatePresence>
        {orders.map((order) => {
          const done = devisProgress(order)
          return (
            <motion.button
              key={order.id}
              layout
              className="order-card devis-card"
              onClick={() => onOpen(order.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, ease }}
            >
              <div className="order-top">
                <strong>#{order.number}</strong>
                <span className="muted small">{formatDate(order.created_at)}</span>
              </div>
              <p>{order.unit || order.contact_name}</p>
              {order.unit && <p className="muted small">{order.contact_name}</p>}
              <p className="muted small">
                {order.pieces} pièce(s), {formatMoney(order.total_cents)}
              </p>
              <div className="devis-progress" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={done} aria-label="Étapes validées">
                <motion.span initial={false} animate={{ width: `${(done / DEVIS_STEPS.length) * 100}%` }} transition={{ duration: 0.5, ease }} />
              </div>
              <p className="small devis-count">{done}/{DEVIS_STEPS.length} étapes validées</p>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function OrderDetail({
  order,
  canDelete,
  onClose,
  onUpdate,
  onDelete,
}: {
  order: Order
  canDelete: boolean
  onClose: () => void
  onUpdate: (patch: OrderPatch) => void
  onDelete: () => void
}) {
  const isDevis = order.status === 'devis'
  const [note, setNote] = useState(order.internal_note)
  const summary = productionSummary(order.order_items, SIZE_ORDER)
  const byModel = itemsByModel(order.order_items)
  const optionText = (item: Order['order_items'][number]) =>
    item.options.map((o) => (o.detail ? `${o.name}: ${o.detail}` : o.name)).join(', ')

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside
        className="drawer glass extra-wide print-area"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.5, ease }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${isDevis ? 'Devis' : 'Commande'} ${order.number}`}
      >
        <header className="drawer-head">
          <h2>{isDevis ? 'Devis' : 'Commande'} n° {order.number}</h2>
          <div className="head-actions no-print">
            <button className="icon-button" onClick={() => downloadText(`commande-${order.number}.csv`, itemsToCsv(order.order_items))} aria-label="Télécharger le tableau CSV" title="Télécharger le tableau (CSV)">
              <DownloadSimple size={20} weight="light" />
            </button>
            <button className="icon-button" onClick={() => window.print()} aria-label="Imprimer" title="Imprimer la fiche de production (par modèle, tailles croissantes)">
              <Printer size={20} weight="light" />
            </button>
            <button className="icon-button" onClick={onClose} aria-label="Fermer">
              <X size={20} weight="light" />
            </button>
          </div>
        </header>
        <div className="detail">
          <div className="detail-meta">
            <p>
              <strong>{order.contact_name}</strong>
              {order.unit && <span className="muted"> · {order.unit}</span>}
              <br />
              <a href={whatsappLink(order.contact_phone, `Bonjour ${order.contact_name} ! C’est Sarah, au sujet de la commande n° ${order.number}.`)} target="_blank" rel="noreferrer" className="inline-link">
                <WhatsappLogo size={16} /> {order.contact_phone}
              </a>
              {order.contact_email && (
                <>
                  <br />
                  <a href={`mailto:${order.contact_email}`} className="inline-link">{order.contact_email}</a>
                </>
              )}
            </p>
            <p className="muted small">
              {formatDate(order.created_at)} · {order.source === 'painel' ? 'saisie dans le panneau' : 'via le site'}
            </p>
          </div>

          {isDevis && (
            <section className="devis-steps no-print" aria-label="Étapes du devis">
              <h3 className="subhead">
                Étapes du devis <span className="muted small">{devisProgress(order)}/{DEVIS_STEPS.length}</span>
              </h3>
              <ul>
                {DEVIS_STEPS.map(({ key, label }) => {
                  const at = order[`${key}_ok_at`]
                  const by = order[`${key}_ok_by`]
                  return (
                    <li key={key}>
                      <button
                        className={at ? 'devis-step done' : 'devis-step'}
                        onClick={() => onUpdate({ [`${key}_ok_at`]: at ? null : new Date().toISOString() })}
                        aria-pressed={!!at}
                      >
                        {at ? <CheckCircle size={22} weight="fill" /> : <Circle size={22} weight="light" />}
                        <span>
                          {label}
                          {at && (
                            <small className="muted">
                              Validé le {formatDate(at)}{by ? ` par ${by}` : ''}
                            </small>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="muted small">Quand les 4 étapes sont validées, le devis devient automatiquement une commande.</p>
            </section>
          )}

          <div className="summary-table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Production</th>
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

          {/* Só na impressão: um bloco por modelo, tamanhos em ordem crescente */}
          <div className="print-only print-models">
            {byModel.map((group) => (
              <section key={group.label} className="print-model">
                <h3>
                  {group.label} <small>({group.rows.reduce((n, r) => n + r.quantity, 0)} pièce(s))</small>
                </h3>
                <table className="lines-table">
                  <thead>
                    <tr>
                      <th>Grade</th>
                      <th>Nom</th>
                      <th>Taille</th>
                      <th>Modèle</th>
                      <th>Couleur</th>
                      <th>Qté</th>
                      <th>Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.grade}</td>
                        <td><strong>{item.person_name}</strong></td>
                        <td>{item.size}</td>
                        <td>{item.product_name}</td>
                        <td>{item.color}</td>
                        <td>{item.quantity}</td>
                        <td className="small">{optionText(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          <div className="lines-wrap no-print">
            <table className="lines-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Grade</th>
                  <th>Nom</th>
                  <th>Modèle</th>
                  <th>Taille</th>
                  <th>Couleur</th>
                  <th>Qté</th>
                  <th>Options</th>
                  <th>Remarques</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item) => (
                  <tr key={item.id}>
                    <td className="muted">{item.position}</td>
                    <td>{item.grade}</td>
                    <td><strong>{item.person_name}</strong></td>
                    <td>{item.product_name} <small className="muted">{TECHNIQUES[item.technique]}</small></td>
                    <td>{item.size}</td>
                    <td>{item.color}</td>
                    <td>{item.quantity}</td>
                    <td className="small">{optionText(item)}</td>
                    <td className="small">{item.remarks}</td>
                    <td className="num">{formatMoney(item.unit_price_cents * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="total">
            <span>{order.pieces} pièce(s)</span>
            <strong>{formatMoney(order.total_cents)}</strong>
          </p>
          {order.notes && (
            <div className="detail-notes">
              <p className="muted small">Remarque du client</p>
              <p>{order.notes}</p>
            </div>
          )}
          <div className="field-row no-print">
            <label className="field">
              <span>Étape</span>
              <select value={order.status} onChange={(e) => onUpdate({ status: e.target.value as OrderStatus })}>
                {/* Devis só vira commande pelas 4 étapes; daqui só dá para annuler */}
                {(isDevis ? (['devis', 'cancelado'] as OrderStatus[]) : (Object.keys(STATUS_LABELS) as OrderStatus[]).filter((s) => s !== 'devis')).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {canDelete && order.status === 'cancelado' && (
            <button className="link-button danger no-print delete-order" onClick={onDelete}>
              <Trash size={16} /> Supprimer définitivement
            </button>
          )}
          <label className="field no-print">
            <span>Note interne</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== order.internal_note && onUpdate({ internal_note: note })} />
            <small className="muted">Visible uniquement par l’équipe. Enregistrée en quittant le champ.</small>
          </label>
        </div>
      </motion.aside>
    </motion.div>
  )
}
