import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, DownloadSimple, Plus, Printer, WhatsappLogo, X } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatMoney } from '../../lib/format'
import { STATUS_FLOW, STATUS_LABELS, type Order, type OrderStatus } from '../../lib/types'
import { whatsappLink } from '../../lib/whatsapp'
import { downloadText, itemsToCsv, productionSummary } from '../../lib/orderSheet'
import { TECHNIQUES } from '../../lib/types'
import { ease } from '../../components/ease'

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('position', { referencedTable: 'order_items' })
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setError('Impossible de charger les commandes.')
    else setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Pedido novo ou alterado em outro aparelho: recarrega
    const channel = supabase
      .channel('orders-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  async function update(order: Order, patch: Partial<Pick<Order, 'status' | 'internal_note'>>) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)))
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
    if (error) {
      setError('Enregistrement impossible. Rechargement...')
      load()
    }
  }

  function move(order: Order, dir: 1 | -1) {
    const next = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + dir]
    if (next) update(order, { status: next })
  }

  const columns: OrderStatus[] = showCancelled ? [...STATUS_FLOW, 'cancelado'] : STATUS_FLOW
  const openOrder = orders.find((o) => o.id === openId) ?? null

  return (
    <div>
      <header className="panel-head">
        <h1>Commandes</h1>
        <Link to="/painel/novo" className="pill pill-solid">
          <span>Nouvelle commande</span>
          <span className="pill-icon"><Plus size={16} weight="bold" /></span>
        </Link>
        <label className="toggle">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          <span>Afficher les annulées</span>
        </label>
      </header>
      {error && <p className="notice error">{error}</p>}

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

      <AnimatePresence>
        {openOrder && <OrderDetail key={openOrder.id} order={openOrder} onClose={() => setOpenId(null)} onUpdate={(patch) => update(openOrder, patch)} />}
      </AnimatePresence>
    </div>
  )
}

function OrderDetail({
  order,
  onClose,
  onUpdate,
}: {
  order: Order
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Order, 'status' | 'internal_note'>>) => void
}) {
  const [note, setNote] = useState(order.internal_note)
  const summary = productionSummary(order.order_items, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'])
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
        aria-label={`Commande ${order.number}`}
      >
        <header className="drawer-head">
          <h2>Commande n° {order.number}</h2>
          <div className="head-actions no-print">
            <button className="icon-button" onClick={() => downloadText(`commande-${order.number}.csv`, itemsToCsv(order.order_items))} aria-label="Télécharger le tableau CSV" title="Télécharger le tableau (CSV)">
              <DownloadSimple size={20} weight="light" />
            </button>
            <button className="icon-button" onClick={() => window.print()} aria-label="Imprimer" title="Imprimer la fiche de production">
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

          <div className="lines-wrap">
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
                {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
