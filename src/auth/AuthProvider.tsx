import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DB_SCHEMA, supabase } from '../lib/supabase'
import type { StaffMember } from '../lib/types'
import { AuthContext } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setStaff(null)
      return
    }
    let cancelled = false
    setLoading(true)
    // my_access: linha em sarah.staff, ou webmaster global (core.admins)
    supabase
      .rpc('my_access')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setStaff((data as StaffMember | null) ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <AuthContext.Provider
      value={{
        session,
        staff,
        loading,
        async signIn(email, password) {
          const { error } = await supabase.auth.signInWithPassword({ email, password })
          return { error: error ? 'E-mail ou mot de passe incorrect' : null }
        },
        // Passkey: domínio i7dev.com.br, comum aos microprojetos do banco compartilhado.
        // Ela só identifica a conta; o acesso continua sendo sarah.staff.
        async signInWithPasskey() {
          const { error } = await supabase.auth.signInWithPasskey()
          return { error: error ? passkeyError(error) : null }
        },
        async registerPasskey() {
          const { error } = await supabase.auth.registerPasskey()
          return { error: error ? passkeyError(error) : null }
        },
        async signUp(name, email, password) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              // app: conta deste projeto no login compartilhado; o gatilho
              // sarah.handle_new_user cria a demanda de acesso
              data: { app: DB_SCHEMA, nom: name },
              emailRedirectTo: `${window.location.origin}/painel/login`,
            },
          })
          if (error) {
            const weak = /password/i.test(error.message)
            return { error: weak ? 'Mot de passe trop faible (8 caractères minimum).' : 'Inscription impossible. Réessayez plus tard.', existing: false }
          }
          // E-mail já cadastrado: o Supabase devolve um usuário sem identidades
          return { error: null, existing: (data.user?.identities?.length ?? 0) === 0 }
        },
        async signOut() {
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function passkeyError(error: { message?: string; code?: string; name?: string }) {
  const text = `${error.code ?? ''} ${error.name ?? ''} ${error.message ?? ''}`
  if (/NotAllowed|abort|cancel/i.test(text)) return 'Opération annulée.'
  if (/credential_exists/i.test(text)) return 'Cette passkey est déjà enregistrée.'
  if (/credential_not_found/i.test(text)) return 'Aucun compte associé à cette passkey.'
  if (/email_not_confirmed/i.test(text)) return 'Confirmez d’abord votre adresse e-mail.'
  if (/too_many_passkeys/i.test(text)) return 'Nombre maximum de passkeys atteint.'
  return 'Passkey indisponible pour le moment. Utilisez votre mot de passe.'
}
