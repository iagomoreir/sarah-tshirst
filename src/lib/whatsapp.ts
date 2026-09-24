import { formatMoney, phoneDigits } from './format'
import type { CartItem } from '../store/cart'

export const STORE_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '33695671640'

export function whatsappLink(number: string, text: string) {
  return `https://wa.me/${phoneDigits(number)}?text=${encodeURIComponent(text)}`
}

export function orderMessage(opts: {
  orderNumber: number
  totalCents: number
  customerName: string
  notes: string
  items: CartItem[]
}) {
  const lines = [
    `Olá, Sarah! Acabei de fazer o pedido *#${opts.orderNumber}* pelo site.`,
    '',
    ...opts.items.map(
      (item) =>
        `• ${item.quantity}x ${item.name} — ${item.size}${item.color ? ` / ${item.color}` : ''} (${formatMoney(item.priceCents * item.quantity)})`,
    ),
    '',
    `*Total: ${formatMoney(opts.totalCents)}*`,
    `Nome: ${opts.customerName}`,
  ]
  if (opts.notes.trim()) lines.push(`Obs.: ${opts.notes.trim()}`)
  return lines.join('\n')
}
