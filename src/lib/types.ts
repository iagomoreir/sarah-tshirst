export type ProductColor = { name: string; hex: string }

export type Product = {
  id: string
  name: string
  description: string
  category: string
  price_cents: number
  sizes: string[]
  colors: ProductColor[]
  image_url: string | null
  active: boolean
  sort: number
}

export type OrderStatus = 'novo' | 'em_producao' | 'pronto' | 'entregue' | 'cancelado'

export type OrderItem = {
  id: string
  product_name: string
  size: string
  color: string
  quantity: number
  unit_price_cents: number
}

export type Order = {
  id: string
  number: number
  customer_name: string
  customer_phone: string
  notes: string
  internal_note: string
  status: OrderStatus
  total_cents: number
  created_at: string
  order_items: OrderItem[]
}

export type StaffRole = 'webmaster' | 'loja'

export type StaffMember = {
  user_id: string
  name: string
  email: string
  role: StaffRole
  created_at: string
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export const STATUS_FLOW: OrderStatus[] = ['novo', 'em_producao', 'pronto', 'entregue']
