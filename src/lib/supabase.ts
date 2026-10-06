import { createClient } from '@supabase/supabase-js'

// Banco compartilhado de microprojetos: cada site usa o próprio schema
// (regras em docs/banco-compartilhado.md). Tudo da Sarah fica em "sarah".
export const DB_SCHEMA = 'sarah'
export const STORAGE_BUCKET = 'sarah-produits'
export const FN_CREATE_USER = 'sarah-create-user'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas (.env.local)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: DB_SCHEMA },
  auth: { persistSession: true, autoRefreshToken: true },
})
