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
      return setMessage({ kind: 'error', text: text ?? 'Não foi possível cadastrar.' })
    }
    setMessage({ kind: 'ok', text: `${name} já pode entrar com ${email}.` })
    setName('')
    setEmail('')
    setPassword('')
    setRole('loja')
    load()
  }

  async function revoke(member: StaffMember) {
    if (!confirm(`Tirar o acesso de ${member.name} ao painel?`)) return
    const { error } = await supabase.from('staff').delete().eq('user_id', member.user_id)
    if (error) return setMessage({ kind: 'error', text: 'Não foi possível remover o acesso.' })
    load()
  }

  return (
    <div className="users">
      <header className="panel-head">
        <h1>Cadastro</h1>
      </header>

      <div className="users-grid">
        <section>
          <h2 className="subhead">Quem acessa o painel</h2>
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
                      {m.email}, desde {formatDate(m.created_at)}
                    </p>
                  </div>
                  <span className={m.role === 'webmaster' ? 'badge on' : 'badge'}>{m.role === 'webmaster' ? 'Webmaster' : 'Loja'}</span>
                  {m.user_id !== me?.user_id && (
                    <button className="link-button danger" onClick={() => revoke(m)}>
                      Remover acesso
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <form className="card-form" onSubmit={create}>
          <h2 className="subhead">Novo usuário</h2>
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </label>
          <label className="field">
            <span>Senha inicial</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            <small className="muted">Mínimo de 8 caracteres. Passe para a pessoa por um canal seguro.</small>
          </label>
          <label className="field">
            <span>Papel</span>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="loja">Loja (pedidos e produtos)</option>
              <option value="webmaster">Webmaster (tudo, inclusive Cadastro)</option>
            </select>
          </label>
          {message && (
            <p className={message.kind === 'ok' ? 'field-ok' : 'field-error'} role="status">
              {message.text}
            </p>
          )}
          <PillButton type="submit" className="full" disabled={busy} icon={<UserPlus size={16} weight="bold" />}>
            {busy ? 'Cadastrando...' : 'Cadastrar'}
          </PillButton>
        </form>
      </div>
    </div>
  )
}
