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

export type OrderStatus = 'devis' | 'novo' | 'em_producao' | 'pronto' | 'entregue' | 'cancelado'

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
  prix_ok_at: string | null
  prix_ok_by: string | null
  bat_ok_at: string | null
  bat_ok_by: string | null
  tailles_ok_at: string | null
  tailles_ok_by: string | null
  acompte_ok_at: string | null
  acompte_ok_by: string | null
  converted_at: string | null
  order_items: OrderItem[]
}

// Étapes do devis: as 4 validadas → o banco converte em commande (sarah.devis_steps)
export type DevisStep = 'prix' | 'bat' | 'tailles' | 'acompte'

export const DEVIS_STEPS: { key: DevisStep; label: string }[] = [
  { key: 'prix', label: 'Prix validé par le client' },
  { key: 'bat', label: 'Maquette / BAT validé' },
  { key: 'tailles', label: 'Liste des tailles validée' },
  { key: 'acompte', label: 'Acompte de 50 % reçu' },
]

export function devisProgress(order: Order) {
  return DEVIS_STEPS.filter((s) => order[`${s.key}_ok_at`]).length
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
  devis: 'Devis',
  novo: 'Nouvelle',
  em_producao: 'En production',
  pronto: 'Prête',
  entregue: 'Livrée',
  cancelado: 'Annulée',
}

export const STATUS_FLOW: OrderStatus[] = ['novo', 'em_producao', 'pronto', 'entregue']
