import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, UserPlus } from '@phosphor-icons/react'
import { FN_CREATE_USER, supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import type { AccessRequest, StaffMember, StaffRole } from '../../lib/types'
import { useAuth } from '../../auth/auth'
import { PillButton } from '../../components/motion'
import { ease } from '../../components/ease'

export function UsersPage() {
  const { staff: me } = useAuth()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [requestRoles, setRequestRoles] = useState<Record<string, StaffRole>>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRole>('loja')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    const [staffRes, requestRes] = await Promise.all([
      supabase.from('staff').select('*').order('created_at'),
      supabase.rpc('pending_requests'),
    ])
    setMembers((staffRes.data as StaffMember[]) ?? [])
    setRequests((requestRes.data as AccessRequest[]) ?? [])
  }

  // Aprovar = entrar em sarah.staff (o gatilho apaga a demanda)
  async function approve(request: AccessRequest) {
    setMessage(null)
    const role = requestRoles[request.user_id] ?? 'loja'
    const { error } = await supabase
      .from('staff')
      .insert({ user_id: request.user_id, name: request.name, email: request.email, role })
    if (error) return setMessage({ kind: 'error', text: 'Impossible de valider la demande.' })
    setMessage({ kind: 'ok', text: `${request.name} a maintenant accès au panneau.` })
    load()
  }

  async function reject(request: AccessRequest) {
    if (!confirm(`Refuser la demande de ${request.name} ?`)) return
    setMessage(null)
    const { error } = await supabase.from('access_requests').delete().eq('user_id', request.user_id)
    if (error) return setMessage({ kind: 'error', text: 'Impossible de refuser la demande.' })
    load()
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    const { data, error } = await supabase.functions.invoke(FN_CREATE_USER, {
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
          {requests.length > 0 && (
            <>
              <h2 className="subhead">Demandes en attente ({requests.length})</h2>
              <ul className="member-list request-list">
                <AnimatePresence initial={false}>
                  {requests.map((r) => (
                    <motion.li
                      key={r.user_id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.35, ease }}
                    >
                      <div>
                        <p>{r.name}</p>
                        <p className="muted small">
                          {r.email}, le {formatDate(r.created_at)}
                        </p>
                      </div>
                      <span className={r.email_confirmed ? 'badge on' : 'badge'}>{r.email_confirmed ? 'E-mail confirmé' : 'E-mail non confirmé'}</span>
                      <div className="request-actions">
                        <select
                          aria-label={`Rôle de ${r.name}`}
                          value={requestRoles[r.user_id] ?? 'loja'}
                          onChange={(e) => setRequestRoles((prev) => ({ ...prev, [r.user_id]: e.target.value as StaffRole }))}
                        >
                          <option value="loja">Boutique</option>
                          <option value="webmaster">Webmaster</option>
                        </select>
                        <button className="chip-button accent" onClick={() => approve(r)}>
                          <Check size={14} weight="bold" />
                          Valider
                        </button>
                        <button className="link-button danger" onClick={() => reject(r)}>
                          Refuser
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          )}
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
