// Contrato assinado: chamadas à Edge Function sarah-contrat e tipos compartilhados
// entre o painel, a página do cliente (/signer) e a verificação (/verifier).
import { FN_CONTRAT, supabase } from './supabase'

export type ContratDoc = {
  id: string
  version: number
  status: 'attente_client' | 'signe' | 'remplace'
  sha256: string
  final_sha256: string | null
  pdf_path: string
  final_pdf_path: string | null
  created_by: string
  created_at: string
  signed_at: string | null
}

export type SnapshotLine = {
  position: number
  grade: string
  name: string
  product: string
  technique: string
  size: string
  color: string
  quantity: number
  options: string
  total_cents: number
}

export type ClientView = {
  status: ContratDoc['status']
  snapshot: {
    order_number: number
    version: number
    issued_at: string
    company: { company_name: string; address: string; phone: string; siret: string }
    client: { name: string; unit: string; phone: string; email: string }
    lines: SnapshotLine[]
    pieces: number
    total_cents: number
    acompte_pct: number
    acompte_cents: number
    conditions: string
  }
  sha256: string
  final_sha256: string | null
  pdf_url: string | null
  sarah: { nom: string; date: string } | null
  client: { nom: string; date: string } | null
}

export type VerifySigner = {
  role: 'sarah' | 'client'
  nom: string
  unite: string
  email: string
  date: string
  email_verified_at: string | null
  integrity_ok: boolean
  seal_ok: boolean
  chain_ok: boolean
  tsa_time: string | null
  tsa_token: string | null
  event_hash: string
}

export type VerifyResult =
  | { found: false }
  | {
      found: true
      matched: 'original' | 'final'
      order_number: number
      version: number
      status: ContratDoc['status']
      issued_at: string
      company: string
      client: string
      total_cents: number
      sha256: string
      final_sha256: string | null
      signers: VerifySigner[]
    }

/** Chama a função e devolve a mensagem de erro em francês vinda do servidor */
export async function callContrat<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FN_CONTRAT, { body })
  if (error) {
    let message: string | undefined
    if ('context' in error) message = await (error.context as Response).json().then((b) => b.error).catch(() => undefined)
    throw new Error(message ?? 'Connexion impossible. Réessayez dans un instant.')
  }
  return data as T
}

export async function sha256OfFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
