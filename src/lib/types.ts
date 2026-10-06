export type ProductColor = { name: string; hex: string }
export type Technique = 'dtf' | 'sublimation'

export type ProductKind = 'textile' | 'objet'

export type Product = {
  id: string
  kind: ProductKind
  price_from: number | null
  name: string
  description: string
  prices: Partial<Record<Technique, number>>
  sizes: string[]
  colors: ProductColor[]
  image_url: string | null
  active: boolean
  sort: number
}

export type OrderOption = {
  id: string
  code: string
  name: string
  description: string
  price_cents: number
  needs_detail: boolean
  detail_label: string
  active: boolean
  sort: number
}

export type OrderStatus = 'novo' | 'em_producao' | 'pronto' | 'entregue' | 'cancelado'

export type ChosenOption = { code: string; name: string; detail: string; price_cents: number }

export type OrderItem = {
  id: string
  position: number
  grade: string
  person_name: string
  product_name: string
  technique: Technique
  size: string
  color: string
  quantity: number
  options: ChosenOption[]
  remarks: string
  unit_price_cents: number
}

export type Order = {
  id: string
  number: number
  contact_name: string
  contact_phone: string
  contact_email: string
  unit: string
  notes: string
  internal_note: string
  status: OrderStatus
  total_cents: number
  pieces: number
  source: string
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

// Inscription pelo painel, à espera da aprovação do webmaster
export type AccessRequest = {
  user_id: string
  name: string
  email: string
  created_at: string
  email_confirmed: boolean
}

export const TECHNIQUES: Record<Technique, string> = {
  dtf: 'DTF',
  sublimation: 'Sublimation',
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  novo: 'Nouvelle',
  em_producao: 'En production',
  pronto: 'Prête',
  entregue: 'Livrée',
  cancelado: 'Annulée',
}

export const STATUS_FLOW: OrderStatus[] = ['novo', 'em_producao', 'pronto', 'entregue']
