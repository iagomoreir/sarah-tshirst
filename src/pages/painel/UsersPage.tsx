import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { UserPlus } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import type { StaffMember, StaffRole } from '../../lib/types'
import { useAuth } from '../../auth/auth'
import { PillButton } from '../../components/motion'
import { ease } from '../../components/ease'

export function UsersPage() {
  const { staff: me } = useAuth()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRole>('loja')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    const { data } = await supabase.from('staff').select('*').order('created_at')
    setMembers((data as StaffMember[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { name, email, password, role },
    })
    setBusy(false)
    if (error || data?.error) {
      let text = data?.error as string | undefined
      if (!text && error && 'context' in error) {
        text = await (error.context as Response).json().then((b) => b.error).catch(() => undefined)
      }
      return setMessage({ kind: 'error', text: text ?? 'Création impossible.' })
    }
    setMessage({ kind: 'ok', text: `${name} peut se connecter avec ${email}.` })
    setName('')
    setEmail('')
    setPassword('')
    setRole('loja')
    load()
  }

  async function revoke(member: StaffMember) {
    if (!confirm(`Retirer l’accès de ${member.name} au panneau ?`)) return
    const { error } = await supabase.from('staff').delete().eq('user_id', member.user_id)
    if (error) return setMessage({ kind: 'error', text: 'Impossible de retirer l’accès.' })
    load()
  }

  return (
    <div className="users">
      <header className="panel-head">
        <h1>Utilisateurs</h1>
      </header>

      <div className="users-grid">
        <section>
          <h2 className="subhead">Accès au panneau</h2>
          <ul className="member-list">
            <AnimatePresence initial={false}>
              {members.map((m) => (
                <motion.li
                  key={m.user_id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <div>
                    <p>{m.name}</p>
                    <p className="muted small">
                      {m.email}, depuis le {formatDate(m.created_at)}
                    </p>
                  </div>
                  <span className={m.role === 'webmaster' ? 'badge on' : 'badge'}>{m.role === 'webmaster' ? 'Webmaster' : 'Boutique'}</span>
                  {m.user_id !== me?.user_id && (
                    <button className="link-button danger" onClick={() => revoke(m)}>
                      Retirer l’accès
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <form className="card-form" onSubmit={create}>
          <h2 className="subhead">Nouvel utilisateur</h2>
          <label className="field">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </label>
          <label className="field">
            <span>Mot de passe initial</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            <small className="muted">8 caractères minimum. Transmettez-le par un canal sûr.</small>
          </label>
          <label className="field">
            <span>Rôle</span>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="loja">Boutique (commandes et modèles)</option>
              <option value="webmaster">Webmaster (tout, y compris Utilisateurs)</option>
            </select>
          </label>
          {message && (
            <p className={message.kind === 'ok' ? 'field-ok' : 'field-error'} role="status">
              {message.text}
            </p>
          )}
          <PillButton type="submit" className="full" disabled={busy} icon={<UserPlus size={16} weight="bold" />}>
            {busy ? 'Création...' : 'Créer'}
          </PillButton>
        </form>
      </div>
    </div>
  )
}
