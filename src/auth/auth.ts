import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { StaffMember } from '../lib/types'

export type AuthContextValue = {
  session: Session | null
  staff: StaffMember | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null; existing: boolean }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
