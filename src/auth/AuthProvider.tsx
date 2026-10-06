import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
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
        async signOut() {
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
