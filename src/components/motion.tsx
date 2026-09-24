// Peças de animação reutilizáveis. Ideias do Spell UI (blur-reveal,
// words-stagger, tilt-card, marquee) e do taste-skill (CTA com ícone
// aninhado, entrada com blur), reescritas sem Tailwind.
import { useRef, type ReactNode } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'

import { ease } from './ease'

/** Título que entra palavra por palavra, saindo do desfoque */
export function WordsReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  const words = text.split(' ')
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden
          className="word"
          initial={reduce ? false : { opacity: 0, y: '0.4em', filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease, delay: delay + i * 0.06 }}
        >
          {word}
          {i < words.length - 1 && ' '}
        </motion.span>
      ))}
    </span>
  )
}

/** Bloco que aparece (fade-up com blur) quando entra na tela */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 32,
}: {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Cartão que inclina seguindo o mouse (só com mouse, nunca no toque) */
export function TiltCard({ children, className, ...rest }: HTMLMotionProps<'button'>) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(py, [0, 1], [6, -6]), { stiffness: 180, damping: 20 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-6, 6]), { stiffness: 180, damping: 20 })
  const glare = useTransform(
    [px, py],
    ([x, y]) => `radial-gradient(circle at ${(x as number) * 100}% ${(y as number) * 100}%, rgba(255,255,255,.28), transparent 55%)`,
  )

  return (
    <motion.button
      ref={ref}
      className={className}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => {
        px.set(0.5)
        py.set(0.5)
      }}
      whileTap={{ scale: 0.98 }}
      {...rest}
    >
      {children as ReactNode}
      {!reduce && <motion.span className="glare" style={{ background: glare }} aria-hidden />}
    </motion.button>
  )
}

/** Faixa de texto rolando sem fim (para quando o usuário pede menos movimento) */
export function Marquee({ items, speed = 32 }: { items: string[]; speed?: number }) {
  const reduce = useReducedMotion()
  const row = [...items, ...items]
  return (
    <div className="marquee" aria-hidden>
      <motion.div
        className="marquee-track"
        animate={reduce ? undefined : { x: ['0%', '-50%'] }}
        transition={{ duration: speed, ease: 'linear', repeat: Infinity }}
      >
        {row.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </motion.div>
    </div>
  )
}

type PillProps = HTMLMotionProps<'button'> & { icon?: ReactNode; variant?: 'solid' | 'ghost' }

/** CTA em pílula com o ícone num círculo próprio que "puxa" no hover */
export function PillButton({ children, icon, variant = 'solid', className = '', ...rest }: PillProps) {
  return (
    <motion.button
      className={`pill pill-${variant} ${className}`}
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      {...rest}
    >
      <span>{children as ReactNode}</span>
      <motion.span
        className="pill-icon"
        variants={{ hover: { x: 3, y: -1, scale: 1.06 } }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        {icon ?? <ArrowUpRight size={16} weight="bold" />}
      </motion.span>
    </motion.button>
  )
}

/** Mesma pílula, como link (WhatsApp, âncoras) */
export function PillLink({
  children,
  icon,
  variant = 'solid',
  className = '',
  ...rest
}: HTMLMotionProps<'a'> & { icon?: ReactNode; variant?: 'solid' | 'ghost' }) {
  return (
    <motion.a className={`pill pill-${variant} ${className}`} whileHover="hover" whileTap={{ scale: 0.98 }} {...rest}>
      <span>{children as ReactNode}</span>
      <motion.span
        className="pill-icon"
        variants={{ hover: { x: 3, y: -1, scale: 1.06 } }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        {icon ?? <ArrowUpRight size={16} weight="bold" />}
      </motion.span>
    </motion.a>
  )
}
