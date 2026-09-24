// Lógica do bon de commande (planilha): linhas, preço, colar do Excel,
// resumo de produção e exportação. Sem React aqui, só funções puras.
import { formatMoney } from './format'
import type { ChosenOption, OrderItem, OrderOption, Product, Technique } from './types'
import { TECHNIQUES } from './types'

export type LineOption = { on: boolean; detail: string }

export type SheetLine = {
  key: string
  grade: string
  person_name: string
  product_id: string
  technique: Technique
  size: string
  color: string
  quantity: number
  options: Record<string, LineOption>
  remarks: string
}

export type Catalog = { products: Product[]; options: OrderOption[] }

let seq = 0
const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`

export function techniquesOf(product: Product | undefined): Technique[] {
  if (!product) return []
  return (Object.keys(TECHNIQUES) as Technique[]).filter((t) => product.prices[t] != null)
}

export function emptyLine(catalog: Catalog, template?: Partial<SheetLine>): SheetLine {
  const product = catalog.products.find((p) => p.id === template?.product_id) ?? catalog.products[0]
  const techs = techniquesOf(product)
  const sizes = product?.sizes ?? []
  return {
    grade: '',
    person_name: '',
    quantity: 1,
    options: {},
    remarks: '',
    ...template,
    key: newKey(),
    product_id: product?.id ?? '',
    technique: template?.technique && techs.includes(template.technique) ? template.technique : (techs[0] ?? 'dtf'),
    size: template?.size && sizes.includes(template.size) ? template.size : (sizes[Math.min(2, sizes.length - 1)] ?? 'M'),
    color: template?.color && (product?.colors.length === 0 || product?.colors.some((c) => c.name === template.color)) ? template.color : (product?.colors[0]?.name ?? ''),
  }
}

export function duplicateLine(line: SheetLine): SheetLine {
  return {
    ...line,
    key: newKey(),
    grade: '',
    person_name: '',
    options: Object.fromEntries(Object.entries(line.options).map(([k, v]) => [k, { ...v }])),
  }
}

/** Ajusta técnica/tamanho/cor quando o modelo muda (ex.: sweat só DTF) */
export function fixLine(line: SheetLine, catalog: Catalog): SheetLine {
  const product = catalog.products.find((p) => p.id === line.product_id)
  if (!product) return line
  const techs = techniquesOf(product)
  return {
    ...line,
    technique: techs.includes(line.technique) ? line.technique : (techs[0] ?? line.technique),
    size: product.sizes.includes(line.size) ? line.size : (product.sizes[0] ?? line.size),
    color: product.colors.length === 0 || product.colors.some((c) => c.name === line.color) ? line.color : product.colors[0].name,
  }
}

export function unitPrice(line: SheetLine, catalog: Catalog): number {
  const product = catalog.products.find((p) => p.id === line.product_id)
  const base = product?.prices[line.technique] ?? 0
  const extras = catalog.options.reduce((sum, o) => sum + (line.options[o.code]?.on ? o.price_cents : 0), 0)
  return base + extras
}

export function totals(lines: SheetLine[], catalog: Catalog) {
  let cents = 0
  let pieces = 0
  for (const line of lines) {
    const q = Math.max(0, line.quantity || 0)
    cents += q * unitPrice(line, catalog)
    pieces += q
  }
  return { cents, pieces }
}

/** Problemas por linha (nome vazio é permitido: nem todo pedido é nominativo) */
export function lineErrors(line: SheetLine, catalog: Catalog): string[] {
  const errors: string[] = []
  const product = catalog.products.find((p) => p.id === line.product_id)
  if (!product) errors.push('modèle')
  else if (product.prices[line.technique] == null) errors.push('technique')
  if (!line.quantity || line.quantity < 1) errors.push('quantité')
  for (const o of catalog.options) {
    const chosen = line.options[o.code]
    if (chosen?.on && o.needs_detail && o.code === 'drapeau_nat' && !chosen.detail.trim()) errors.push('pays')
  }
  return errors
}

export function toPayload(lines: SheetLine[], catalog: Catalog) {
  return lines.map((l) => ({
    grade: l.grade,
    person_name: l.person_name,
    product_id: l.product_id,
    technique: l.technique,
    size: l.size,
    color: l.color,
    quantity: l.quantity,
    remarks: l.remarks,
    options: catalog.options
      .filter((o) => l.options[o.code]?.on)
      .map((o) => ({ code: o.code, detail: l.options[o.code]?.detail ?? '' })),
  }))
}

// ---------------------------------------------------------------------
// Colar do Excel / Google Sheets / CSV
// ---------------------------------------------------------------------

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const YES = new Set(['oui', 'o', 'x', 'yes', 'y', 'sim', 's', '1', 'true', 'vrai', '✓', '✔'])
const NO = new Set(['non', 'n', 'no', 'nao', '0', 'false', 'faux', '-', ''])

type Column = 'grade' | 'name' | 'size' | 'color' | 'qty' | 'flag_fr' | 'flag_nat' | 'other' | 'remarks' | 'model' | 'technique'

// Ordem da planilha que a Sarah já usa (bon de commande)
const SARAH_ORDER: Column[] = ['grade', 'name', 'size', 'color', 'qty', 'flag_fr', 'flag_nat', 'other', 'remarks']

function headerColumn(cell: string): Column | null {
  const c = norm(cell)
  if (!c) return null
  if (c.includes('grade')) return 'grade'
  if (c.includes('nom') || c.includes('name')) return 'name'
  if (c.includes('taille') || c.includes('size') || c.includes('tamanho')) return 'size'
  if (c.includes('couleur') || c.includes('color') || c.includes('cor')) return 'color'
  if (c.includes('quantit') || c === 'qte' || c === 'qty') return 'qty'
  if (c.includes('francais')) return 'flag_fr'
  if (c.includes('nationalit')) return 'flag_nat'
  if (c.includes('insigne') || c.includes('option') || c.includes('logo')) return 'other'
  if (c.includes('remarque') || c.includes('obs') || c.includes('note')) return 'remarks'
  if (c.includes('modele') || c.includes('model')) return 'model'
  if (c.includes('technique') || c.includes('impression')) return 'technique'
  return null
}

function splitRows(text: string): string[][] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').filter((r) => r.trim())
  const sep = rows.some((r) => r.includes('\t')) ? '\t' : rows.some((r) => r.includes(';')) ? ';' : ','
  return rows.map((r) => r.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()))
}

function matchSize(raw: string, sizes: string[]): string | null {
  const v = norm(raw).toUpperCase().replace(/\s/g, '')
  const alias: Record<string, string> = { XXL: '2XL', XXXL: '3XL', '2XL+': '3XL', XXXXL: '4XL' }
  const s = alias[v] ?? v
  return sizes.find((x) => x.toUpperCase() === s) ?? null
}

function matchColor(raw: string, product: Product): string | null {
  const v = norm(raw)
  if (!v) return null
  return product.colors.find((c) => norm(c.name) === v || norm(c.name).startsWith(v) || v.startsWith(norm(c.name).split(' ')[0]))?.name ?? null
}

function matchProduct(raw: string, products: Product[]): Product | null {
  const v = norm(raw)
  if (!v) return null
  const exact = products.find((p) => norm(p.name) === v)
  if (exact) return exact
  const hints: [RegExp, RegExp][] = [
    [/debardeur|tank/, /debardeur/],
    [/longue|ml\b/, /longue/],
    [/sweat|capuche|hood/, /sweat|capuche/],
    [/courte|mc\b|t-?shirt/, /courte/],
  ]
  for (const [test, target] of hints) {
    if (test.test(v)) {
      const hit = products.find((p) => target.test(norm(p.name)))
      if (hit) return hit
    }
  }
  return null
}

export type PasteResult = { lines: SheetLine[]; warnings: string[] }

/**
 * Converte texto colado de planilha em linhas. Se a 1ª linha for cabeçalho,
 * usa os nomes das colunas; senão assume a ordem do bon de commande da Sarah:
 * Grade, Nom, Taille, Couleur, Quantité, Drapeau FR, Drapeau nationalité, Autres options, Remarques.
 */
export function parsePaste(text: string, catalog: Catalog, defaults: SheetLine): PasteResult {
  const rows = splitRows(text)
  const warnings: string[] = []
  if (rows.length === 0) return { lines: [], warnings }

  let columns: (Column | null)[] = SARAH_ORDER
  const headerGuess = rows[0].map(headerColumn)
  if (headerGuess.filter(Boolean).length >= 2) {
    columns = headerGuess
    rows.shift()
  }

  const byCode = (code: string) => catalog.options.find((o) => o.code === code)
  const lines: SheetLine[] = []

  rows.forEach((cells, i) => {
    const get = (col: Column) => {
      const idx = columns.indexOf(col)
      return idx >= 0 ? (cells[idx] ?? '') : ''
    }
    // Linha só com OUI/NON (planilha impressa em branco) é ignorada
    if (!get('name') && !get('grade') && !get('size') && !get('qty')) return

    const product = matchProduct(get('model'), catalog.products) ?? catalog.products.find((p) => p.id === defaults.product_id)
    if (!product) return
    const line = emptyLine(catalog, { product_id: product.id, technique: defaults.technique, color: defaults.color })
    line.grade = get('grade')
    line.person_name = get('name').toUpperCase()
    line.remarks = get('remarks')

    const tech = norm(get('technique'))
    if (tech.startsWith('sub') && product.prices.sublimation != null) line.technique = 'sublimation'
    else if (tech.startsWith('dtf') && product.prices.dtf != null) line.technique = 'dtf'

    const size = get('size')
    if (size) {
      const s = matchSize(size, product.sizes)
      if (s) line.size = s
      else warnings.push(`Ligne ${i + 1}: taille « ${size} » non reconnue`)
    }
    const color = get('color')
    if (color) {
      const c = matchColor(color, product)
      if (c) line.color = c
      else warnings.push(`Ligne ${i + 1}: couleur « ${color} » non reconnue`)
    }
    const qty = parseInt(get('qty'), 10)
    line.quantity = Number.isFinite(qty) && qty > 0 ? Math.min(qty, 500) : 1

    const flagFr = norm(get('flag_fr'))
    if (byCode('drapeau_fr') && YES.has(flagFr)) line.options.drapeau_fr = { on: true, detail: '' }

    const nat = get('flag_nat')
    if (byCode('drapeau_nat') && !NO.has(norm(nat))) {
      line.options.drapeau_nat = { on: true, detail: YES.has(norm(nat)) ? '' : nat }
    }

    const other = get('other')
    if (byCode('insigne') && !NO.has(norm(other))) {
      line.options.insigne = { on: true, detail: YES.has(norm(other)) ? '' : other }
    }

    lines.push(fixLine(line, catalog))
  })

  return { lines, warnings }
}

// ---------------------------------------------------------------------
// Resumo de produção (o que a Sarah precisa separar/imprimir)
// ---------------------------------------------------------------------

export type SummaryRow = { label: string; bySize: Record<string, number>; total: number }

type SummaryInput = { product_name: string; technique: Technique; color: string; size: string; quantity: number; options: { code: string; name: string; detail: string }[] }

export function productionSummary(items: SummaryInput[], sizeOrder: string[]) {
  const rows = new Map<string, SummaryRow>()
  const opts = new Map<string, { name: string; total: number; details: Map<string, number> }>()

  for (const item of items) {
    const label = `${item.product_name} · ${TECHNIQUES[item.technique]} · ${item.color}`
    const row = rows.get(label) ?? { label, bySize: {}, total: 0 }
    row.bySize[item.size] = (row.bySize[item.size] ?? 0) + item.quantity
    row.total += item.quantity
    rows.set(label, row)

    for (const o of item.options) {
      const entry = opts.get(o.code) ?? { name: o.name, total: 0, details: new Map() }
      entry.total += item.quantity
      if (o.detail) entry.details.set(o.detail, (entry.details.get(o.detail) ?? 0) + item.quantity)
      opts.set(o.code, entry)
    }
  }

  const usedSizes = sizeOrder.filter((s) => [...rows.values()].some((r) => r.bySize[s]))
  const extra = [...new Set([...rows.values()].flatMap((r) => Object.keys(r.bySize)))].filter((s) => !usedSizes.includes(s))

  return {
    sizes: [...usedSizes, ...extra],
    rows: [...rows.values()],
    options: [...opts.values()].map((o) => ({ name: o.name, total: o.total, details: [...o.details.entries()] })),
  }
}

export function sheetToSummaryInput(lines: SheetLine[], catalog: Catalog): SummaryInput[] {
  return lines.map((l) => ({
    product_name: catalog.products.find((p) => p.id === l.product_id)?.name ?? '?',
    technique: l.technique,
    color: l.color,
    size: l.size,
    quantity: l.quantity || 0,
    options: catalog.options.filter((o) => l.options[o.code]?.on).map((o) => ({ code: o.code, name: o.name, detail: l.options[o.code]?.detail ?? '' })),
  }))
}

// ---------------------------------------------------------------------
// Mensagem de WhatsApp e CSV
// ---------------------------------------------------------------------

export function whatsappSummary(opts: {
  orderNumber: number
  contactName: string
  unit: string
  pieces: number
  totalCents: number
  summary: ReturnType<typeof productionSummary>
}) {
  const lines = [
    `Bonjour Sarah ! Nouveau bon de commande *n° ${opts.orderNumber}* envoyé depuis le site.`,
    '',
    `Contact : ${opts.contactName}`,
  ]
  if (opts.unit) lines.push(`Unité : ${opts.unit}`)
  lines.push(`*${opts.pieces} pièce(s), total ${formatMoney(opts.totalCents)}*`, '')
  for (const row of opts.summary.rows) {
    const sizes = opts.summary.sizes.filter((s) => row.bySize[s]).map((s) => `${s}×${row.bySize[s]}`).join(', ')
    lines.push(`• ${row.label} : ${sizes}`)
  }
  if (opts.summary.options.length) {
    lines.push('')
    for (const o of opts.summary.options) {
      const det = o.details.length ? ` (${o.details.map(([d, n]) => `${d} ${n}`).join(', ')})` : ''
      lines.push(`+ ${o.name} ×${o.total}${det}`)
    }
  }
  lines.push('', 'Le détail nominatif est enregistré avec la commande.')
  return lines.join('\n')
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV no formato do bon de commande (abre direto no Excel FR: ; e BOM) */
export function itemsToCsv(items: OrderItem[]) {
  const header = ['Grade', 'Nom', 'Modèle', 'Technique', 'Taille', 'Couleur', 'Quantité', 'Drapeau français', 'Drapeau nationalité', 'Autres options', 'Remarques', 'Prix unitaire', 'Total ligne']
  const opt = (item: OrderItem, code: string) => item.options.find((o: ChosenOption) => o.code === code)
  const rows = items.map((item) => [
    item.grade,
    item.person_name,
    item.product_name,
    TECHNIQUES[item.technique],
    item.size,
    item.color,
    item.quantity,
    opt(item, 'drapeau_fr') ? 'OUI' : 'NON',
    opt(item, 'drapeau_nat') ? opt(item, 'drapeau_nat')!.detail || 'OUI' : 'NON',
    opt(item, 'insigne') ? opt(item, 'insigne')!.detail || 'OUI' : 'NON',
    item.remarks,
    (item.unit_price_cents / 100).toFixed(2).replace('.', ','),
    ((item.unit_price_cents * item.quantity) / 100).toFixed(2).replace('.', ','),
  ])
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
