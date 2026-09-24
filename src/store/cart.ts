import { createContext, useContext } from 'react'

export type CartItem = {
  key: string
  productId: string
  name: string
  imageUrl: string | null
  size: string
  color: string
  quantity: number
  /** Só para exibição — o valor cobrado é recalculado no banco (create_order) */
  priceCents: number
}

export type CartContextValue = {
  items: CartItem[]
  count: number
  totalCents: number
  add: (item: Omit<CartItem, 'key'>) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  open: boolean
  setOpen: (open: boolean) => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>')
  return ctx
}
