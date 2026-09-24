import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CartContext, type CartItem } from './cart'

const STORAGE_KEY = 'sarah-cart-v1'

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // modo privado / storage bloqueado: carrinho só em memória
    }
  }, [items])

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      totalCents: items.reduce((sum, i) => sum + i.quantity * i.priceCents, 0),
      add(item: Omit<CartItem, 'key'>) {
        const key = `${item.productId}|${item.size}|${item.color}`
        setItems((prev) => {
          const existing = prev.find((i) => i.key === key)
          if (existing) {
            return prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + item.quantity) } : i))
          }
          return [...prev, { ...item, key }]
        })
      },
      setQuantity(key: string, quantity: number) {
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((i) => i.key !== key)
            : prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, quantity) } : i)),
        )
      },
      remove(key: string) {
        setItems((prev) => prev.filter((i) => i.key !== key))
      },
      clear() {
        setItems([])
      },
      open,
      setOpen,
    }),
    [items, open],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
