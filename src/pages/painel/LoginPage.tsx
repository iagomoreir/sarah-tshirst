import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { SignIn } from '@phosphor-icons/react'
import { useAuth } from '../../auth/auth'
import { PillButton, WordsReveal } from '../../components/motion'
import { ease } from '../../components/ease'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/painel" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    setError(error)
  }

  return (
    <div className="login">
      <motion.form
        className="login-card glass"
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease }}
      >
        <h1>
          <WordsReveal text="Painel da loja" />
        </h1>
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <PillButton type="submit" className="full" disabled={busy} icon={<SignIn size={16} weight="bold" />}>
          {busy ? 'Entrando...' : 'Entrar'}
        </PillButton>
      </motion.form>
    </div>
  )
}
