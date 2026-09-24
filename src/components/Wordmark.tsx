/** Logo em texto: "Sarah Nani" em script + "CRÉATIONS" espaçado, como no flyer */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'logo compact' : 'logo'}>
      <span className="logo-script">Sarah Nani</span>
      <span className="logo-caps">Créations</span>
    </span>
  )
}
