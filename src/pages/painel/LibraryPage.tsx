import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookmarkSimple, DownloadSimple, FilePdf, ImageSquare, MagnifyingGlass } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { downloadOriginal, formatBytes, PLACEMENT_LABELS, thumbUrls, type OrderFile } from '../../lib/visuels'
import { QualityBadge } from '../../components/VisuelsPicker'

type LibraryFile = OrderFile & { orders: { number: number; unit: string; contact_name: string } | null }

/** Bibliothèque: logos e insignes guardados para reaproveitar em outros pedidos */
export function LibraryPage() {
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('order_files')
      .select('*, orders(number, unit, contact_name)')
      .eq('keep', true)
      .order('library_label')
      .order('created_at', { ascending: false })
    if (error) setError('Impossible de charger la bibliothèque.')
    const list = (data as LibraryFile[]) ?? []
    setFiles(list)
    setThumbs(await thumbUrls(list))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = files.filter((f) =>
      !q || [f.library_label, f.file_name, f.orders?.unit, f.orders?.contact_name, String(f.orders?.number ?? '')].some((t) => t?.toLowerCase().includes(q)),
    )
    const map = new Map<string, LibraryFile[]>()
    for (const f of shown) {
      const key = f.library_label || 'Sans nom'
      map.set(key, [...(map.get(key) ?? []), f])
    }
    return [...map.entries()]
  }, [files, query])

  async function unkeep(f: LibraryFile) {
    if (!confirm(`Retirer « ${f.file_name} » de la bibliothèque ? Si la commande est livrée, l’original sera supprimé dans 30 jours.`)) return
    const { error } = await supabase.from('order_files').update({ keep: false }).eq('id', f.id)
    if (error) setError('Enregistrement impossible.')
    load()
  }

  async function download(f: LibraryFile) {
    if (!(await downloadOriginal(f))) setError('Téléchargement impossible.')
  }

  return (
    <div className="library-page">
      <header className="panel-head">
        <h1>Bibliothèque</h1>
        <label className="field library-search">
          <span className="sr-only">Rechercher</span>
          <MagnifyingGlass size={16} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Unité, logo, n° de commande" />
        </label>
      </header>
      <p className="muted small">
        Logos et insignes conservés sans limite de durée. Pour en garder un, ouvrez la commande et cliquez sur « Conserver » sous le visuel.
      </p>
      {error && <p className="notice error">{error}</p>}
      {loading && <div className="sk sk-order" aria-hidden />}
      {!loading && files.length === 0 && <p className="column-empty">La bibliothèque est vide.</p>}

      {groups.map(([label, list]) => (
        <section key={label} className="library-group">
          <h2 className="subhead">
            {label} <span className="muted small">{list.length}</span>
          </h2>
          <ul className="visuels-grid">
            {list.map((f) => (
              <li key={f.id} className="visuel-card">
                <div className="visuel-thumb large">
                  {f.thumb_path && thumbs[f.thumb_path] ? (
                    <img src={thumbs[f.thumb_path]} alt={f.file_name} loading="lazy" />
                  ) : f.mime === 'application/pdf' ? (
                    <FilePdf size={36} weight="light" />
                  ) : (
                    <ImageSquare size={36} weight="light" />
                  )}
                </div>
                <p className="visuel-name" title={f.file_name}>
                  {f.file_name}
                </p>
                <p className="small muted">
                  {PLACEMENT_LABELS[f.placement]} · {formatBytes(f.size_bytes)}
                  {f.orders ? ` · commande n° ${f.orders.number}` : ''}
                </p>
                <QualityBadge quality={f.quality} />
                <div className="contrat-actions">
                  {f.path && (
                    <button className="chip-button" onClick={() => download(f)}>
                      <DownloadSimple size={16} /> Original
                    </button>
                  )}
                  <button className="chip-button accent" onClick={() => unkeep(f)} aria-pressed>
                    <BookmarkSimple size={16} weight="fill" /> Retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
