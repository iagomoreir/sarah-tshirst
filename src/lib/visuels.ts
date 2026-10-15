import { supabase } from './supabase'

// Visuels (artes) do cliente: análise de qualidade e miniatura no navegador,
// envio para o bucket privado e limpeza dos originais vencidos (painel).
export const VISUELS_BUCKET = 'sarah-visuels'
export const MAX_VISUELS = 20
export const MAX_VISUEL_BYTES = 50 * 1024 * 1024

export type Placement = 'devant' | 'dos' | 'manche_gauche' | 'manche_droite' | 'autre'
export type Quality = 'vectoriel' | 'excellente' | 'correcte' | 'faible' | 'inconnue'

export const PLACEMENTS: { key: Placement; label: string; widthCm: number }[] = [
  { key: 'devant', label: 'Devant', widthCm: 28 },
  { key: 'dos', label: 'Dos', widthCm: 30 },
  { key: 'manche_gauche', label: 'Manche gauche', widthCm: 9 },
  { key: 'manche_droite', label: 'Manche droite', widthCm: 9 },
  { key: 'autre', label: 'Autre / à préciser', widthCm: 28 },
]

export const PLACEMENT_LABELS = Object.fromEntries(PLACEMENTS.map((p) => [p.key, p.label])) as Record<Placement, string>

export const QUALITY_INFO: Record<Quality, { label: string; tone: 'ok' | 'mid' | 'bad' | 'none' }> = {
  vectoriel: { label: 'Vectoriel : qualité parfaite', tone: 'ok' },
  excellente: { label: 'Excellente qualité', tone: 'ok' },
  correcte: { label: 'Qualité correcte', tone: 'mid' },
  faible: { label: 'Trop petite pour l’impression', tone: 'bad' },
  inconnue: { label: 'Qualité non vérifiée', tone: 'none' },
}

const TYPES: Record<string, { mime: string; vector: boolean; raster: boolean }> = {
  png: { mime: 'image/png', vector: false, raster: true },
  jpg: { mime: 'image/jpeg', vector: false, raster: true },
  jpeg: { mime: 'image/jpeg', vector: false, raster: true },
  webp: { mime: 'image/webp', vector: false, raster: true },
  svg: { mime: 'image/svg+xml', vector: true, raster: true },
  pdf: { mime: 'application/pdf', vector: true, raster: false },
  ai: { mime: 'application/postscript', vector: true, raster: false },
  eps: { mime: 'application/postscript', vector: true, raster: false },
}

export const ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,.eps,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf'

export type PickedVisuel = {
  key: string
  file: File
  ext: string
  mime: string
  placement: Placement
  width: number | null
  height: number | null
  quality: Quality
  thumb: Blob | null
  preview: string | null // object URL da miniatura
  note: string | null // aviso extra (JPEG sem transparência...)
}

export function extOf(name: string) {
  return (name.split('.').pop() ?? '').toLowerCase()
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

/** Qualidade pela resolução efetiva no tamanho de impressão do emplacement */
export function qualityFor(width: number | null, height: number | null, placement: Placement, vector: boolean): Quality {
  if (vector) return 'vectoriel'
  if (!width || !height) return 'inconnue'
  const cm = PLACEMENTS.find((p) => p.key === placement)?.widthCm ?? 28
  const dpi = Math.max(width, height) / (cm / 2.54)
  if (dpi >= 250) return 'excellente'
  if (dpi >= 150) return 'correcte'
  return 'faible'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = url
  })
}

/** Miniatura leve (webp, 640 px no máximo): é o que fica guardado depois da entrega */
async function makeThumb(img: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, 640 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.75))
}

export type PickError = { name: string; reason: string }

export async function analyseFile(file: File, placement: Placement): Promise<PickedVisuel | PickError> {
  const ext = extOf(file.name)
  const type = TYPES[ext]
  if (!type) return { name: file.name, reason: 'format non accepté (PNG, JPEG, WEBP, SVG, PDF, AI ou EPS)' }
  if (file.size > MAX_VISUEL_BYTES) return { name: file.name, reason: 'fichier de plus de 50 Mo' }

  let width: number | null = null
  let height: number | null = null
  let thumb: Blob | null = null
  if (type.raster) {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImage(url)
      // SVG sem largura declarada: desenha num quadrado
      width = img.naturalWidth || (ext === 'svg' ? 1000 : null)
      height = img.naturalHeight || (ext === 'svg' ? 1000 : null)
      if (width && height) thumb = await makeThumb(img, width, height)
    } catch {
      if (ext !== 'svg') return { name: file.name, reason: 'image illisible' }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return {
    key: crypto.randomUUID(),
    file,
    ext,
    mime: type.mime,
    placement,
    width: ext === 'svg' ? null : width,
    height: ext === 'svg' ? null : height,
    quality: qualityFor(width, height, placement, type.vector),
    thumb,
    preview: thumb ? URL.createObjectURL(thumb) : null,
    note: ext === 'jpg' || ext === 'jpeg' ? 'JPEG : pas de fond transparent, le fond sera détouré si besoin.' : null,
  }
}

export function withPlacement(v: PickedVisuel, placement: Placement): PickedVisuel {
  return { ...v, placement, quality: qualityFor(v.width, v.height, placement, TYPES[v.ext]?.vector ?? false) }
}

/** Envia original + miniatura para `prefix/` e devolve os caminhos */
async function putFiles(v: PickedVisuel, prefix: string) {
  const id = crypto.randomUUID()
  const bucket = supabase.storage.from(VISUELS_BUCKET)
  const path = `${prefix}/${id}.${v.ext}`
  const { error } = await bucket.upload(path, v.file, { contentType: v.mime, upsert: false })
  if (error) throw error
  let thumb_path: string | null = null
  if (v.thumb) {
    const thumbExt = v.thumb.type === 'image/webp' ? 'webp' : 'png'
    const tp = `${prefix}/${id}-mini.${thumbExt}`
    const r = await bucket.upload(tp, v.thumb, { contentType: v.thumb.type || 'image/png', upsert: false })
    if (!r.error) thumb_path = tp
  }
  return { path, thumb_path }
}

function fileFields(v: PickedVisuel) {
  return { placement: v.placement, file_name: v.file.name.slice(0, 200), width: v.width, height: v.height, quality: v.quality }
}

/** Cliente (site): envio liberado pela chave criada junto com o pedido */
export async function sendClientVisuel(v: PickedVisuel, uploadKey: string) {
  const paths = await putFiles(v, `devis/${uploadKey}`)
  const { error } = await supabase.rpc('add_visuel', { p_upload_key: uploadKey, p_file: { ...fileFields(v), ...paths } })
  if (error) throw error
}

/** Equipe (painel): grava direto na tabela */
export async function sendStaffVisuel(v: PickedVisuel, orderId: string, by: string) {
  const paths = await putFiles(v, `pedido/${orderId}`)
  const { error } = await supabase
    .from('order_files')
    .insert({ order_id: orderId, ...fileFields(v), ...paths, mime: v.mime, size_bytes: v.file.size, uploaded_by: by })
  if (error) {
    await supabase.storage.from(VISUELS_BUCKET).remove([paths.path, ...(paths.thumb_path ? [paths.thumb_path] : [])])
    throw error
  }
}

export type OrderFile = {
  id: string
  order_id: string
  placement: Placement
  file_name: string
  path: string | null
  thumb_path: string | null
  mime: string
  size_bytes: number
  width: number | null
  height: number | null
  quality: Quality
  uploaded_by: string
  created_at: string
  purge_after: string | null
  purged_at: string | null
  keep: boolean
  library_label: string
}

/** URLs assinadas das miniaturas (bucket privado) */
export async function thumbUrls(files: OrderFile[]): Promise<Record<string, string>> {
  const paths = files.map((f) => f.thumb_path).filter((p): p is string => !!p)
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(VISUELS_BUCKET).createSignedUrls(paths, 3600)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

export async function downloadOriginal(f: OrderFile) {
  if (!f.path) return false
  const { data } = await supabase.storage.from(VISUELS_BUCKET).createSignedUrl(f.path, 600, { download: f.file_name })
  if (!data?.signedUrl) return false
  window.location.href = data.signedUrl
  return true
}

/** Apaga um visuel inteiro (original, miniatura e linha) */
export async function deleteVisuel(f: OrderFile) {
  const paths = [f.path, f.thumb_path].filter((p): p is string => !!p)
  if (paths.length) {
    const { error } = await supabase.storage.from(VISUELS_BUCKET).remove(paths)
    if (error) throw error
  }
  const { error } = await supabase.from('order_files').delete().eq('id', f.id)
  if (error) throw error
}

/** Antes de apagar um pedido: remove todos os arquivos dele, inclusive envios incompletos */
export async function deleteOrderVisuels(order: { id: string; upload_key: string | null }) {
  const bucket = supabase.storage.from(VISUELS_BUCKET)
  for (const prefix of [`pedido/${order.id}`, ...(order.upload_key ? [`devis/${order.upload_key}`] : [])]) {
    const { data } = await bucket.list(prefix, { limit: 100 })
    const paths = (data ?? []).map((o) => `${prefix}/${o.name}`)
    if (paths.length) await bucket.remove(paths)
  }
}

/** Limpeza: originais com prazo vencido (30 dias depois de « Livrée »). Roda ao abrir o painel. */
export async function purgeExpiredVisuels() {
  const { data } = await supabase
    .from('order_files')
    .select('id, path')
    .is('purged_at', null)
    .eq('keep', false)
    .not('path', 'is', null)
    .lt('purge_after', new Date().toISOString())
    .limit(200)
  const due = (data ?? []) as { id: string; path: string }[]
  if (!due.length) return 0
  const { error } = await supabase.storage.from(VISUELS_BUCKET).remove(due.map((f) => f.path))
  if (error) return 0
  await supabase
    .from('order_files')
    .update({ path: null, purged_at: new Date().toISOString() })
    .in('id', due.map((f) => f.id))
  return due.length
}
