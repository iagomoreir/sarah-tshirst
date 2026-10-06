import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { SignIn, UserPlus } from '@phosphor-icons/react'
import { useAuth } from '../../auth/auth'
import { PillButton, WordsReveal } from '../../components/motion'
import { ease } from '../../components/ease'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/painel" replace />

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setDone(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password)
      setBusy(false)
      setError(error)
      return
    }
    const { error, existing } = await signUp(name.trim(), email.trim(), password)
    setBusy(false)
    if (error) return setError(error)
    if (existing) {
      setMode('login')
      return setError('Cet e-mail a déjà un compte. Connectez-vous pour demander l’accès au panneau.')
    }
    setPassword('')
    setDone(`Compte créé. Confirmez votre adresse avec le lien envoyé à ${email.trim()}, puis attendez la validation de l’administrateur.`)
  }

  const register = mode === 'register'

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
          <WordsReveal key={mode} text={register ? 'Créer un compte' : 'Espace boutique'} />
        </h1>

        {done ? (
          <>
            <p className="field-ok" role="status">{done}</p>
            <button type="button" className="link-button" onClick={() => switchMode('login')}>
              Retour à la connexion
            </button>
          </>
        ) : (
          <>
            <AnimatePresence initial={false} mode="popLayout">
              {register && (
                <motion.label
                  className="field"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <span>Nom</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
                </motion.label>
              )}
            </AnimatePresence>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={register ? 8 : undefined}
              />
              {register && <small className="muted">8 caractères minimum.</small>}
            </label>
            {error && <p className="field-error" role="alert">{error}</p>}
            <PillButton
              type="submit"
              className="full"
              disabled={busy}
              icon={register ? <UserPlus size={16} weight="bold" /> : <SignIn size={16} weight="bold" />}
            >
              {register ? (busy ? 'Création...' : 'Créer mon compte') : busy ? 'Connexion...' : 'Se connecter'}
            </PillButton>
            <p className="muted small login-switch">
              {register ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button type="button" className="link-button" onClick={() => switchMode(register ? 'login' : 'register')}>
                {register ? 'Se connecter' : 'Créer un compte'}
              </button>
            </p>
            {register && <p className="muted small">L’accès au panneau est validé par l’administrateur.</p>}
          </>
        )}
      </motion.form>
    </div>
  )
}
