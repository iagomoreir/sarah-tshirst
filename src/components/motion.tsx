// Peças de animação reutilizáveis. Ideias do Spell UI (blur-reveal,
// words-stagger, tilt-card, marquee, pop-button), reescritas sem Tailwind.
import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type HTMLMotionProps } from 'motion/react'

const ease = [0.22, 1, 0.36, 1] as const

/** Título que entra palavra por palavra, saindo do desfoque */
export function WordsReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ')
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden
          className="word"
          initial={{ opacity: 0, y: '0.4em', filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease, delay: delay + i * 0.07 }}
        >
          {word}
          {i < words.length - 1 && ' '}
        </motion.span>
      ))}
    </span>
  )
}

/** Bloco que aparece quando entra na tela */
export function Reveal({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Cartão que inclina seguindo o mouse (só em ponteiro fino) */
export function TiltCard({ children, className, ...rest }: HTMLMotionProps<'button'>) {
  const ref = useRef<HTMLButtonElement>(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 18 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), { stiffness: 200, damping: 18 })
  const glareX = useTransform(px, (v) => `${v * 100}%`)
  const glareY = useTransform(py, (v) => `${v * 100}%`)
  const glare = useTransform([glareX, glareY], ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,.35), transparent 55%)`)

  return (
    <motion.button
      ref={ref}
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => {
        px.set(0.5)
        py.set(0.5)
      }}
      whileTap={{ scale: 0.97 }}
      {...rest}
    >
      {children}
      <motion.span className="glare" style={{ background: glare }} aria-hidden />
    </motion.button>
  )
}

/** Faixa de texto rolando sem fim */
export function Marquee({ items, speed = 28 }: { items: string[]; speed?: number }) {
  const row = [...items, ...items]
  return (
    <div className="marquee" aria-hidden>
      <motion.div
        className="marquee-track"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: speed, ease: 'linear', repeat: Infinity }}
      >
        {row.map((item, i) => (
          <span key={i}>
            {item} <b>✿</b>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

/** Botão com "pop" de mola no hover/toque */
export function PopButton({ children, className = 'btn', ...rest }: HTMLMotionProps<'button'>) {
  return (
    <motion.button
      className={className}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
