import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Catalog } from './orderSheet'
import type { OrderOption, Product } from './types'

/** Modelos e opções ativos (vitrine e bon de commande) */
export function useCatalog(includeInactive = false) {
  const [catalog, setCatalog] = useState<Catalog>({ products: [], options: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const products = supabase.from('products').select('*').order('sort').order('created_at')
    const options = supabase.from('options').select('*').order('sort')
    Promise.all([includeInactive ? products : products.eq('active', true), includeInactive ? options : options.eq('active', true)]).then(
      ([p, o]) => {
        if (cancelled) return
        if (p.error || o.error) setError('Impossible de charger le catalogue pour le moment.')
        setCatalog({ products: (p.data as Product[]) ?? [], options: (o.data as OrderOption[]) ?? [] })
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [includeInactive, version])

  return { catalog, loading, error, reload: () => setVersion((v) => v + 1) }
}
