import { useCallback, useEffect, useState } from 'react'
import { BookmarkSimple, DownloadSimple, FilePdf, ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import type { Order } from '../../lib/types'
import {
  deleteVisuel,
  downloadOriginal,
  formatBytes,
  PLACEMENT_LABELS,
  sendStaffVisuel,
  thumbUrls,
  type OrderFile,
  type PickedVisuel,
} from '../../lib/visuels'
import { QualityBadge, VisuelsPicker } from '../../components/VisuelsPicker'
import { useAuth } from '../../auth/auth'

/** Visuels do pedido: miniaturas, original para baixar, bibliothèque e prazo de exclusão */
export function VisuelsSection({ order }: { order: Order }) {
  const { staff } = useAuth()
  const [files, setFiles] = useState<OrderFile[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<PickedVisuel[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('order_files').select('*').eq('order_id', order.id).order('created_at')
    const list = (data as OrderFile[]) ?? []
    setFiles(list)
    setThumbs(await thumbUrls(list))
  }, [order.id])

  useEffect(() => {
    load()
  }, [load])

  async function upload() {
    setBusy(true)
    setError(null)
    const failed: string[] = []
    for (const v of adding) {
      try {
        await sendStaffVisuel(v, order.id, staff?.name ?? 'Équipe')
      } catch {
        failed.push(v.file.name)
      }
    }
    if (failed.length) setError(`Envoi impossible : ${failed.join(', ')}.`)
    setAdding([])
    setShowAdd(false)
    setBusy(false)
    load()
  }

  async function toggleLibrary(f: OrderFile) {
    let patch: Partial<OrderFile>
    if (f.keep) {
      patch = { keep: false }
    } else {
      const label = prompt('Nom dans la bibliothèque (unité, logo...)', f.library_label || order.unit || order.contact_name)
      if (label === null) return
      patch = { keep: true, library_label: label.trim().slice(0, 120) }
    }
    const { error } = await supabase.from('order_files').update(patch).eq('id', f.id)
    if (error) setError('Enregistrement impossible.')
    load()
  }

  async function remove(f: OrderFile) {
    if (!confirm(`Supprimer définitivement « ${f.file_name} » ?`)) return
    try {
      await deleteVisuel(f)
    } catch {
      setError('Suppression impossible.')
    }
    load()
  }

  async function download(f: OrderFile) {
    if (!(await downloadOriginal(f))) setError('Téléchargement impossible.')
  }

  return (
    <section className="visuels no-print" aria-label="Visuels">
      <h3 className="subhead">
        Visuels <span className="muted small">{files.length}</span>
      </h3>

      {files.length === 0 && !showAdd && <p className="muted small">Aucun visuel pour l’instant.</p>}

      <ul className="visuels-grid">
        {files.map((f) => (
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
              {f.width && f.height ? ` · ${f.width} × ${f.height} px` : ''}
            </p>
            <QualityBadge quality={f.quality} />
            <p className="small muted">
              {f.keep
                ? `Dans la bibliothèque${f.library_label ? ` : ${f.library_label}` : ''}`
                : f.purged_at
                  ? `Original supprimé le ${formatDate(f.purged_at)}, aperçu conservé`
                  : f.purge_after
                    ? `Original supprimé automatiquement le ${formatDate(f.purge_after)}`
                    : `Reçu le ${formatDate(f.created_at)}${f.uploaded_by !== 'client' ? ` (ajouté par ${f.uploaded_by})` : ''}`}
            </p>
            <div className="contrat-actions">
              {f.path && (
                <button className="chip-button" onClick={() => download(f)}>
                  <DownloadSimple size={16} /> Original
                </button>
              )}
              {f.path && (
                <button className={f.keep ? 'chip-button accent' : 'chip-button'} onClick={() => toggleLibrary(f)} aria-pressed={f.keep}>
                  <BookmarkSimple size={16} weight={f.keep ? 'fill' : 'regular'} /> {f.keep ? 'Conservé' : 'Conserver'}
                </button>
              )}
              <button className="icon-button small" onClick={() => remove(f)} aria-label={`Supprimer ${f.file_name}`} title="Supprimer">
                <Trash size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showAdd ? (
        <div className="visuels-add-panel">
          <VisuelsPicker items={adding} onChange={setAdding} disabled={busy} max={Math.max(0, 20 - files.length)} />
          <div className="contrat-actions">
            <button className="chip-button accent" onClick={upload} disabled={busy || adding.length === 0}>
              <UploadSimple size={16} weight="bold" /> {busy ? 'Envoi...' : `Envoyer ${adding.length || ''}`.trim()}
            </button>
            <button className="chip-button" onClick={() => { setAdding([]); setShowAdd(false) }} disabled={busy}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        files.length < 20 && (
          <button className="chip-button" onClick={() => setShowAdd(true)}>
            <UploadSimple size={16} /> Ajouter un visuel
          </button>
        )
      )}
      <p className="muted small">L’original est supprimé 30 jours après la livraison (aperçu conservé), sauf s’il est conservé dans la bibliothèque.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  )
}
