import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { HourglassMedium, PaperPlaneTilt } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { PillButton } from '../components/motion'
import { ease } from '../components/ease'
import { useAuth } from './auth'

// Conta sem acesso ao painel: mostra a demanda em espera ou deixa pedir acesso
// (conta criada em outro microprojeto do login compartilhado).
export function NoAccess() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id
  const [state, setState] = useState<'loading' | 'pending' | 'none'>('loading')
  const [name, setName] = useState((session?.user.user_metadata?.nom as string | undefined) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('access_requests')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setState(data ? 'pending' : 'none'))
  }, [userId])

  async function request(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('request_access', { p_name: name.trim() })
    setBusy(false)
    if (error) return setError('Demande impossible. Réessayez plus tard.')
    setState('pending')
  }

  if (state === 'loading') return <p className="muted center-page">Chargement…</p>

  return (
    <div className="login">
      <motion.div
        className="login-card glass"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease }}
      >
        {state === 'pending' ? (
          <>
            <HourglassMedium size={40} weight="light" className="accent-icon" />
            <h1>En attente</h1>
            <p>Votre demande d’accès a bien été envoyée. L’administrateur doit la valider avant que vous puissiez utiliser le panneau.</p>
          </>
        ) : (
          <form className="stack-form" onSubmit={request}>
            <h1>Accès au panneau</h1>
            <p>Ce compte n’a pas encore accès au panneau. Envoyez une demande à l’administrateur.</p>
            <label className="field">
              <span>Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
            {error && <p className="field-error" role="alert">{error}</p>}
            <PillButton type="submit" className="full" disabled={busy} icon={<PaperPlaneTilt size={16} weight="bold" />}>
              {busy ? 'Envoi...' : 'Demander l’accès'}
            </PillButton>
          </form>
        )}
        <button className="link-button" onClick={signOut}>
          Se déconnecter
        </button>
      </motion.div>
    </div>
  )
}
