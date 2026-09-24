import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import type { Product } from '../lib/types'
import { STORE_WHATSAPP, whatsappLink } from '../lib/whatsapp'
import { useCart } from '../store/cart'
import { ProductDialog } from '../components/ProductDialog'
import { CartDrawer } from '../components/CartDrawer'

export function StorePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('Tudo')
  const [selected, setSelected] = useState<Product | null>(null)
  const cart = useCart()

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('sort')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError('Não foi possível carregar o catálogo agora.')
        setProducts((data as Product[]) ?? [])
        setLoading(false)
      })
  }, [])

  const categories = useMemo(() => ['Tudo', ...new Set(products.map((p) => p.category))], [products])
  const visible = category === 'Tudo' ? products : products.filter((p) => p.category === category)

  return (
    <div className="store">
      <header className="store-header">
        <a href="/" className="brand">
          Sarah Nani <span>Creations</span>
        </a>
        <button className="cart-button" onClick={() => cart.setOpen(true)} aria-label={`Carrinho, ${cart.count} itens`}>
          Carrinho
          {cart.count > 0 && <span className="cart-count">{cart.count}</span>}
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">Arte feita à mão, peça por peça</p>
        <h1>Camisetas com a sua história estampada.</h1>
        <p className="hero-sub">
          Escolha o modelo, o tamanho e a cor, e finalize o pedido direto no WhatsApp com a Sarah.
        </p>
      </section>

      {categories.length > 2 && (
        <nav className="chips" aria-label="Categorias">
          {categories.map((c) => (
            <button key={c} className={c === category ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </nav>
      )}

      <main className="catalog">
        {loading && <p className="muted">Carregando catálogo…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && visible.length === 0 && <p className="muted">Nenhum produto disponível no momento.</p>}
        <div className="grid">
          {visible.map((product) => (
            <button key={product.id} className="card" onClick={() => setSelected(product)}>
              <div className="card-image">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} loading="lazy" />
                ) : (
                  <span className="placeholder-art" aria-hidden>
                    ✿
                  </span>
                )}
              </div>
              <div className="card-body">
                <h2>{product.name}</h2>
                <p className="price">{formatMoney(product.price_cents)}</p>
                {product.colors.length > 0 && (
                  <div className="swatches small" aria-label="Cores disponíveis">
                    {product.colors.map((c) => (
                      <span key={c.name} className="swatch" style={{ background: c.hex }} title={c.name} />
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </main>

      <footer className="store-footer">
        <p>Dúvidas ou peça sob encomenda?</p>
        <a className="btn" href={whatsappLink(STORE_WHATSAPP, 'Olá, Sarah! Vim pelo site.')} target="_blank" rel="noreferrer">
          Falar no WhatsApp
        </a>
        <p className="muted small">© {new Date().getFullYear()} Sarah Nani Creations</p>
      </footer>

      {selected && <ProductDialog product={selected} onClose={() => setSelected(null)} />}
      <CartDrawer />
    </div>
  )
}
