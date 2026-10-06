import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { CaretLeft, CaretRight, EnvelopeSimple, FacebookLogo, InstagramLogo, WhatsappLogo, X } from '@phosphor-icons/react'
import { formatPrice } from '../lib/format'
import { useCatalog } from '../lib/useCatalog'
import { INSTAGRAM_URL, STORE_EMAIL, STORE_WHATSAPP, whatsappLink } from '../lib/whatsapp'
import { GALLERY, HERO_PHOTOS, photoSrc, photoSrcSet } from '../lib/realisations'
import type { Product } from '../lib/types'
import { Marquee, PillLink, Reveal, TiltCard, WordsReveal } from '../components/motion'
import { ease } from '../components/ease'
import { Wordmark } from '../components/Wordmark'
import { IslandNav } from '../components/IslandNav'

const CONTACT_LABEL = 'Nous écrire'
const contactLink = whatsappLink(STORE_WHATSAPP, 'Bonjour Sarah ! Je viens du site et j’ai une question.')
const FACEBOOK_URL = 'https://www.facebook.com/sarahnanicreations'
const MILI_URL = 'https://www.instagram.com/milibynani'

export function HomePage() {
  const { catalog, objets, loading } = useCatalog()
  const navigate = useNavigate()
  const base = catalog.products[0]
  const dtf = base?.prices.dtf ?? 2500
  const sub = base?.prices.sublimation ?? 1600
  const optionPrice = catalog.options[0]?.price_cents ?? 100

  return (
    <div className="store">
      <IslandNav />

      <section className="hero">
        <div className="hero-copy">
          <motion.p className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
            MILI by NANI, la ligne militaire de Sarah Nani Créations
          </motion.p>
          <h1 className="display">
            <WordsReveal text="T-shirts" />
            <br />
            <WordsReveal text="personnalisés" className="accent-text" delay={0.12} />
          </h1>
          <motion.p className="hero-sub" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.45 }}>
            Pour ceux qui portent fièrement leurs couleurs et leurs valeurs. Commandes individuelles ou pour toute l’unité.
          </motion.p>
          <motion.div className="hero-ctas" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.6 }}>
            <PillLink href="/commande" onClick={(e) => { e.preventDefault(); navigate('/commande') }}>Commander</PillLink>
            <PillLink href={contactLink} target="_blank" rel="noreferrer" variant="ghost" icon={<WhatsappLogo size={16} weight="bold" />}>
              {CONTACT_LABEL}
            </PillLink>
          </motion.div>
        </div>
        <HeroPhotos />
      </section>

      <Marquee
        items={[
          'Impression haute qualité',
          'Textiles sélectionnés, confort et résistance',
          'Encres durables, résistantes au lavage',
          'Fabrication soignée',
          'Service personnalisé à votre écoute',
        ]}
      />

      <section className="section" id="tarifs">
        <Reveal>
          <h2 className="display section-title">Deux techniques, un prix à la pièce</h2>
        </Reveal>
        <div className="tech-bento">
          <Reveal className="tech-card tech-dtf">
            <div className="tech-top">
              <h3 className="display">DTF</h3>
              <PriceCounter cents={dtf} />
            </div>
            <p>
              Impression haute qualité adaptée à la plupart des textiles. Couleurs éclatantes et excellente tenue dans le temps. Légèrement en relief au
              toucher.
            </p>
          </Reveal>
          <Reveal className="tech-card tech-sub" delay={0.1}>
            <div className="tech-top">
              <h3 className="display">Sublimation</h3>
              <PriceCounter cents={sub} />
            </div>
            <p>L’encre est intégrée directement dans la fibre du tissu. Aucun relief au toucher, rendu durable, respirant et confortable.</p>
          </Reveal>
          <Reveal className="tech-card tech-note" delay={0.2}>
            <p className="display big-number">+{formatPrice(optionPrice)}</p>
            <p>par option, sur chaque pièce. Tarifs pour le T-shirt manches courtes, en Sable ou Vert armée, du S au 3XL.</p>
          </Reveal>
        </div>
      </section>

      <section className="section perso" id="personnalisation">
        <Reveal className="perso-photo">
          <img src={photoSrc('tshirt-sable-nom-grade')} srcSet={photoSrcSet('tshirt-sable-nom-grade')} sizes="(max-width: 900px) 100vw, 55vw" alt="T-shirt Sable avec l’insigne et l’emplacement NOM + GRADE sur la poitrine" loading="lazy" />
        </Reveal>
        <div className="perso-copy">
          <Reveal>
            <h2 className="display section-title">Chaque pièce à votre nom</h2>
          </Reveal>
          <dl className="perso-list">
            {[
              ['Devant', 'Grade et nom sur la poitrine, avec l’insigne de votre unité.'],
              ['Manche gauche', 'Drapeau français et insigne régimentaire.'],
              ['Manche droite', 'Drapeau de nationalité, si choisi.'],
              ['Dos', 'Un grand visuel pour votre unité, créé sur mesure, sur devis.'],
            ].map(([term, text], i) => (
              <Reveal key={term} delay={i * 0.08} className="perso-item">
                <dt>{term}</dt>
                <dd>{text}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section className="section options-section" id="options">
        <Reveal>
          <h2 className="display section-title">Les options, sur les manches</h2>
        </Reveal>
        <div className="options-row">
          {[
            { title: 'Insigne régimentaire', text: 'Votre insigne ou un petit logo, sur la manche gauche.', art: <span className="art-insigne" aria-hidden /> },
            { title: 'Drapeau français', text: 'Bleu, blanc, rouge, sur la manche gauche.', art: <span className="art-flag-fr" aria-hidden /> },
            { title: 'Drapeau de nationalité', text: 'Sur la manche droite. Maroc, Pérou, Népal... Autres drapeaux sur demande.', art: <span className="art-flag-any" aria-hidden /> },
          ].map((o, i) => (
            <Reveal key={o.title} className="option-item" delay={i * 0.08}>
              <motion.div className="option-art" whileHover={{ rotate: -3, scale: 1.04 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
                {o.art}
              </motion.div>
              <h3>{o.title}</h3>
              <p className="muted">{o.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="modeles">
        <Reveal>
          <h2 className="display section-title">Modèles disponibles</h2>
        </Reveal>
        <div className="models-row">
          {(loading ? [] : catalog.products).map((p, i) => (
            <motion.div
              key={p.id}
              className="model-wrap"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease, delay: i * 0.08 }}
            >
              <TiltCard className="model-card" onClick={() => navigate('/commande')} aria-label={`Commander : ${p.name}`}>
                <div className="model-image">
                  {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <span className="model-initial display">{p.name.split(' ')[0]}</span>}
                </div>
                <div className="model-body">
                  <h3>{p.name}</h3>
                  <p className="muted small">{p.description}</p>
                  <p className="model-prices">
                    {p.prices.dtf != null && <span>DTF {formatPrice(p.prices.dtf)}</span>}
                    {p.prices.sublimation != null && <span>Sublimation {formatPrice(p.prices.sublimation)}</span>}
                  </p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
          {loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="sk model-sk" aria-hidden />)}
        </div>
      </section>

      <Gallery />

      <Creations objets={objets} />

      <section className="section how">
        <Reveal>
          <h2 className="display section-title">Pour toute l’unité, en quelques minutes</h2>
        </Reveal>
        <ol className="how-list">
          {[
            ['Remplissez', 'Une ligne par personne : grade, nom, taille, couleur, options. Votre tableau Excel se colle directement.'],
            ['Envoyez', 'Le bon de commande arrive chez Sarah avec son numéro, le récapitulatif par taille et le total.'],
            ['Recevez', 'On valide ensemble le paiement et la livraison, puis la production démarre.'],
          ].map(([title, text], i) => (
            <Reveal key={title} delay={i * 0.1} className="how-item">
              <h3 className="display">{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="section">
        <Reveal className="cta-band">
          <h2 className="display">Votre idée, notre savoir-faire, un résultat qui vous ressemble.</h2>
          <PillLink href="/commande" onClick={(e) => { e.preventDefault(); navigate('/commande') }}>Commander</PillLink>
        </Reveal>
      </section>

      <footer className="store-footer">
        <Wordmark />
        <div className="footer-links">
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><InstagramLogo size={18} weight="light" /> @sarahnanicreations</a>
          <a href={MILI_URL} target="_blank" rel="noreferrer"><InstagramLogo size={18} weight="light" /> @milibynani</a>
          <a href={FACEBOOK_URL} target="_blank" rel="noreferrer"><FacebookLogo size={18} weight="light" /> sarahnaniCréations</a>
          <a href={contactLink} target="_blank" rel="noreferrer"><WhatsappLogo size={18} weight="light" /> WhatsApp</a>
          <a href={`mailto:${STORE_EMAIL}`}><EnvelopeSimple size={18} weight="light" /> {STORE_EMAIL}</a>
        </div>
        <p className="muted small">© {new Date().getFullYear()} Sarah Nani Créations · MILI by NANI. Créations personnalisées avec amour.</p>
      </footer>
    </div>
  )
}


function PriceCounter({ cents }: { cents: number }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const value = useMotionValue(reduce ? cents / 100 : 0)
  const text = useTransform(value, (v) => `${Math.round(v)}`)

  useEffect(() => {
    if (!inView) return
    if (reduce) return value.set(cents / 100)
    const controls = animate(value, cents / 100, { duration: 1.4, ease })
    return () => controls.stop()
  }, [inView, cents, reduce, value])

  return (
    <p className="price-counter display" ref={ref} aria-label={`${formatPrice(cents)} par pièce`}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="euro" aria-hidden>€</span>
      <small aria-hidden>/ pièce</small>
    </p>
  )
}

/** Duas fotos reais empilhadas (Sable e Vert armée), com parallax no scroll */
function HeroPhotos() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y0 = useTransform(scrollYProgress, [0, 1], [0, -70])
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -140])

  return (
    <div className="hero-art" ref={ref}>
      {HERO_PHOTOS.map((photo, i) => (
        <motion.figure
          key={photo.name}
          className={`fabric fabric-${i}`}
          style={reduce ? undefined : { y: i === 0 ? y0 : y1 }}
          initial={{ opacity: 0, y: 60, rotate: 0 }}
          animate={{ opacity: 1, rotate: i === 0 ? -5 : 4 }}
          whileHover={{ rotate: 0, scale: 1.03, zIndex: 3 }}
          transition={{ duration: 1, ease, delay: 0.3 + i * 0.15 }}
        >
          <div className="fabric-swatch">
            <img src={photoSrc(photo.name, 640)} srcSet={photoSrcSet(photo.name)} sizes="(max-width: 900px) 60vw, 30vw" alt={photo.alt} fetchPriority={i === 0 ? 'high' : 'auto'} />
          </div>
          <figcaption className="fabric-label">{photo.label}</figcaption>
        </motion.figure>
      ))}
    </div>
  )
}

/** Galeria de réalisations em colunas, com visualização ampliada */
function Gallery() {
  const [open, setOpen] = useState<number | null>(null)
  const photo = open == null ? null : GALLERY[open]
  const step = (dir: 1 | -1) => setOpen((i) => (i == null ? i : (i + dir + GALLERY.length) % GALLERY.length))

  useEffect(() => {
    if (open == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <section className="section" id="realisations">
      <Reveal>
        <h2 className="display section-title">Réalisations</h2>
      </Reveal>
      <div className="gallery">
        {GALLERY.map((p, i) => (
          <motion.button
            key={p.name}
            className="gallery-item"
            onClick={() => setOpen(i)}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.8, ease, delay: (i % 3) * 0.08 }}
            aria-label={`Agrandir : ${p.caption}`}
          >
            <motion.img layoutId={`photo-${p.name}`} src={photoSrc(p.name, 640)} srcSet={photoSrcSet(p.name)} sizes="(max-width: 700px) 100vw, 33vw" alt={p.alt} loading="lazy" style={{ aspectRatio: p.ratio }} />
            <span className="gallery-caption">{p.caption}</span>
          </motion.button>
        ))}
      </div>
      <Reveal className="gallery-cta">
        <p>Un visuel pour votre unité, votre section ou votre promo ? Sarah le dessine avec vous.</p>
        <PillLink href={contactLink} target="_blank" rel="noreferrer" variant="ghost" icon={<WhatsappLogo size={16} weight="bold" />}>
          {CONTACT_LABEL}
        </PillLink>
      </Reveal>

      <AnimatePresence>
        {photo && (
          <motion.div className="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={photo.caption}>
            <motion.img
              key={photo.name}
              layoutId={`photo-${photo.name}`}
              src={photoSrc(photo.name)}
              alt={photo.alt}
              onClick={(e) => e.stopPropagation()}
              transition={{ duration: 0.5, ease }}
            />
            <p className="lightbox-caption">{photo.caption}</p>
            <button className="lightbox-btn close" onClick={() => setOpen(null)} aria-label="Fermer"><X size={22} /></button>
            <button className="lightbox-btn prev" onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label="Photo précédente"><CaretLeft size={22} /></button>
            <button className="lightbox-btn next" onClick={(e) => { e.stopPropagation(); step(1) }} aria-label="Photo suivante"><CaretRight size={22} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Coques, mugs, objets e eventos: vitrine com pedido de orçamento no WhatsApp */
function Creations({ objets }: { objets: Product[] }) {
  if (objets.length === 0) return null
  return (
    <section className="section" id="creations">
      <Reveal>
        <h2 className="display section-title">Et aussi, pour offrir</h2>
      </Reveal>
      <div className="creations">
        {objets.map((o, i) => (
          <motion.article
            key={o.id}
            className={o.image_url ? 'creation' : 'creation creation-text'}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.8, ease, delay: i * 0.08 }}
          >
            {o.image_url && (
              <div className="creation-image">
                <img src={o.image_url} srcSet={o.image_url.endsWith('-640.webp') ? `${o.image_url} 640w, ${o.image_url.replace('-640.webp', '-1200.webp')} 1200w` : undefined} sizes="(max-width: 900px) 100vw, 33vw" alt={o.name} loading="lazy" />
              </div>
            )}
            <div className="creation-body">
              <h3 className="display">{o.name}</h3>
              <p>{o.description}</p>
              <div className="creation-foot">
                <span className="creation-price">{o.price_from != null ? `À partir de ${formatPrice(o.price_from)}` : 'Sur devis'}</span>
                <a
                  className="chip-button accent"
                  href={whatsappLink(STORE_WHATSAPP, `Bonjour Sarah ! Je voudrais un devis pour : ${o.name}.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsappLogo size={16} weight="bold" /> Demander un devis
                </a>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
