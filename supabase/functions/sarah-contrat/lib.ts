// Lógica pura do contrato (sem rede nem banco): JSON canônico, hashes,
// PDF do contrato, certificado de assinatura e pedido de carimbo RFC 3161.
// Roda no Deno (Edge Function) e no Node (testes).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export type Company = {
  company_name: string
  address: string
  phone: string
  email: string
  siret: string
  vat_number: string
}

export type SnapshotLine = {
  position: number
  grade: string
  name: string
  product: string
  technique: string
  size: string
  color: string
  quantity: number
  options: string
  remarks: string
  unit_cents: number
  total_cents: number
}

export type Snapshot = {
  kind: 'contrat'
  order_number: number
  version: number
  issued_at: string // ISO
  company: Company
  client: { name: string; unit: string; phone: string; email: string }
  lines: SnapshotLine[]
  pieces: number
  total_cents: number
  acompte_pct: number
  acompte_cents: number
  conditions: string
  notes: string
}

export type EventInput = {
  prev_hash: string
  document_id: string
  role: 'sarah' | 'client'
  signer: Record<string, string>
  doc_sha256: string
  consent_text: string
  signature_png_sha256: string | null
  ip: string
  user_agent: string
  otp_verified_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------
// Hashes
// ---------------------------------------------------------------------

/** JSON com chaves ordenadas: o mesmo conteúdo gera sempre o mesmo texto */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Datas sempre no mesmo formato (o banco devolve outro) */
export function isoMs(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null
}

export function eventPayload(e: EventInput): string {
  return canonicalJson({ ...e, created_at: isoMs(e.created_at), otp_verified_at: isoMs(e.otp_verified_at) })
}

export async function eventHash(e: EventInput): Promise<string> {
  return sha256Hex(eventPayload(e))
}

export function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function unb64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text)
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16))
}

// ---------------------------------------------------------------------
// Assinatura do servidor (Ed25519)
// ---------------------------------------------------------------------

export async function signEd25519(pkcs8B64: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', unb64(pkcs8B64), { name: 'Ed25519' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(message))
  return b64(new Uint8Array(sig))
}

export async function verifyEd25519(spkiB64: string, message: string, sigB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('spki', unb64(spkiB64), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64(sigB64), new TextEncoder().encode(message))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------
// Carimbo de tempo RFC 3161 (TimeStampReq em DER, feito à mão)
// ---------------------------------------------------------------------

function der(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  const len = content.length
  const head = len < 128 ? [tag, len] : len < 256 ? [tag, 0x81, len] : [tag, 0x82, len >> 8, len & 0xff]
  return Uint8Array.from([...head, ...content])
}

export function timeStampRequest(sha256: string, nonce: Uint8Array): Uint8Array<ArrayBuffer> {
  const sha256Oid = Uint8Array.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01])
  const algo = der(0x30, Uint8Array.from([...der(0x06, sha256Oid), 0x05, 0x00]))
  const imprint = der(0x30, Uint8Array.from([...algo, ...der(0x04, hexToBytes(sha256))]))
  const positiveNonce = Uint8Array.from([nonce[0] & 0x7f, ...nonce.slice(1)])
  return der(
    0x30,
    Uint8Array.from([...der(0x02, Uint8Array.from([1])), ...imprint, ...der(0x02, positiveNonce), 0x01, 0x01, 0xff]),
  )
}

/** status do PKIStatusInfo: 0 = concedido, 1 = concedido com alterações */
export function timeStampStatus(resp: Uint8Array): number {
  // 30 len 30 len 02 01 <status>
  let i = 0
  const skip = () => {
    i++ // tag
    const l = resp[i++]
    if (l & 0x80) i += l & 0x7f
  }
  skip()
  skip()
  if (resp[i] !== 0x02) return -1
  return resp[i + 2]
}

/** genTime do TSTInfo (GeneralizedTime) para exibição; a prova é o token inteiro */
export function timeStampTime(resp: Uint8Array): string | null {
  for (let i = 0; i < resp.length - 17; i++) {
    if (resp[i] !== 0x18) continue
    const len = resp[i + 1]
    if (len < 15 || len > 23) continue
    const text = new TextDecoder().decode(resp.slice(i + 2, i + 2 + len))
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(text)
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`
  }
  return null
}

// ---------------------------------------------------------------------
// Texto para as fontes padrão do PDF (WinAnsi)
// ---------------------------------------------------------------------

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

function winAnsi(c: string): boolean {
  const code = c.charCodeAt(0)
  return c === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(c)
}

/** Texto aceito pela fonte padrão: letra fora do WinAnsi vira a letra base (ễ → e) ou « ? » */
export function pdfText(text: string): string {
  return [...String(text ?? '').normalize('NFC').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\r/g, '')]
    .map((c) => {
      if (winAnsi(c)) return c
      const base = c.normalize('NFD')[0]
      return base && winAnsi(base) ? base : '?'
    })
    .join('')
}

export function money(cents: number): string {
  const v = (cents / 100).toFixed(2).replace('.', ',')
  const [int, dec] = v.split(',')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} €`
}

export function parisDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(iso)).replace(/[\u00a0\u202f]/g, ' ')
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89]
const M = 42
const ACCENT = rgb(0.75, 0.33, 0.1)
const INK = rgb(0.16, 0.13, 0.1)
const MUTED = rgb(0.45, 0.41, 0.37)
const LINE = rgb(0.85, 0.8, 0.74)

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont }

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = pdfText(text)
  if (font.widthOfTextAtSize(t, size) <= width) return t
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
  return `${t}…`
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of pdfText(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else {
        if (line) out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage(A4)
  ctx.y = A4[1] - M
}

function ensure(ctx: Ctx, h: number) {
  if (ctx.y - h < M + 30) newPage(ctx)
}

function text(ctx: Ctx, t: string, x: number, size = 9.5, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  ctx.page.drawText(pdfText(t), { x, y: ctx.y, size, font: opts.bold ? ctx.bold : ctx.font, color: opts.color ?? INK })
}

function paragraph(ctx: Ctx, t: string, size = 9, color = INK, width = A4[0] - 2 * M) {
  for (const l of wrap(t, ctx.font, size, width)) {
    ensure(ctx, size + 4)
    text(ctx, l, M, size, { color })
    ctx.y -= size + 3.5
  }
}

function footer(doc: PDFDocument, font: PDFFont, label: string) {
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawText(pdfText(`${label}  ·  page ${i + 1}/${pages.length}`), { x: M, y: 24, size: 7.5, font, color: MUTED })
  })
}

export async function buildContractPdf(s: Snapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Contrat ${s.order_number} v${s.version}`)
  doc.setAuthor(s.company.company_name)
  doc.setCreator('sarahcreations.i7dev.com.br')
  doc.setProducer('sarah-contrat')
  // Datas fixas: o mesmo snapshot gera exatamente o mesmo arquivo
  doc.setCreationDate(new Date(s.issued_at))
  doc.setModificationDate(new Date(s.issued_at))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page: doc.addPage(A4), y: A4[1] - M, font, bold }
  const W = A4[0] - 2 * M

  // Cabeçalho
  text(ctx, s.company.company_name, M, 16, { bold: true, color: ACCENT })
  ctx.y -= 14
  for (const l of [s.company.address, `Tél. ${s.company.phone}${s.company.email ? `  ·  ${s.company.email}` : ''}`, `SIRET ${s.company.siret}${s.company.vat_number ? `  ·  TVA ${s.company.vat_number}` : ''}`]) {
    text(ctx, l, M, 8.5, { color: MUTED })
    ctx.y -= 11
  }
  ctx.y -= 10
  text(ctx, `CONTRAT DE COMMANDE  ·  DEVIS N° ${s.order_number}`, M, 13, { bold: true })
  ctx.y -= 14
  text(ctx, `Version ${s.version}, émis le ${parisDate(s.issued_at)}`, M, 8.5, { color: MUTED })
  ctx.y -= 22

  // Cliente
  text(ctx, 'CLIENT', M, 8, { bold: true, color: ACCENT })
  ctx.y -= 12
  text(ctx, s.client.name + (s.client.unit ? `  ·  ${s.client.unit}` : ''), M, 10, { bold: true })
  ctx.y -= 12
  text(ctx, [s.client.phone, s.client.email].filter(Boolean).join('  ·  '), M, 9, { color: MUTED })
  ctx.y -= 22

  // Tabela
  const cols = [
    { k: '#', w: 18 },
    { k: 'Grade', w: 46 },
    { k: 'Nom', w: 88 },
    { k: 'Modèle', w: 138 },
    { k: 'Taille', w: 32 },
    { k: 'Couleur', w: 50 },
    { k: 'Qté', w: 24 },
    { k: 'Options', w: 62 },
    { k: 'Total TTC', w: W - 458 },
  ]
  const head = () => {
    ensure(ctx, 30)
    ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: W, height: 15, color: rgb(0.96, 0.92, 0.87) })
    let x = M + 3
    for (const c of cols) {
      const right = c.k === 'Total TTC'
      const label = pdfText(c.k)
      text(ctx, label, right ? x + c.w - 6 - bold.widthOfTextAtSize(label, 7.5) : x, 7.5, { bold: true, color: MUTED })
      x += c.w
    }
    ctx.y -= 16
  }
  head()
  for (const l of s.lines) {
    if (ctx.y - 14 < M + 30) {
      newPage(ctx)
      head()
    }
    const vals = [
      String(l.position),
      l.grade,
      l.name,
      `${l.product} (${l.technique})`,
      l.size,
      l.color,
      String(l.quantity),
      l.options,
      money(l.total_cents),
    ]
    let x = M + 3
    vals.forEach((v, i) => {
      const c = cols[i]
      const t = fit(v, i === 2 ? bold : font, 8, c.w - 6)
      const right = i === vals.length - 1
      ctx.page.drawText(t, {
        x: right ? x + c.w - 6 - font.widthOfTextAtSize(t, 8) : x,
        y: ctx.y,
        size: 8,
        font: i === 2 ? bold : font,
        color: INK,
      })
      x += c.w
    })
    ctx.y -= 5
    ctx.page.drawLine({ start: { x: M, y: ctx.y }, end: { x: M + W, y: ctx.y }, thickness: 0.4, color: LINE })
    ctx.y -= 10
  }

  // Totais
  ensure(ctx, 70)
  ctx.y -= 6
  const right = (label: string, value: string, size: number, isBold = false) => {
    const v = pdfText(value)
    text(ctx, label, M + W - 230, size, { bold: isBold })
    ctx.page.drawText(v, { x: M + W - (isBold ? bold : font).widthOfTextAtSize(v, size), y: ctx.y, size, font: isBold ? bold : font, color: INK })
    ctx.y -= size + 6
  }
  right(`${s.pieces} pièce(s)`, '', 9)
  right('Total TTC', money(s.total_cents), 12, true)
  right(`Acompte à la commande (${s.acompte_pct} %)`, money(s.acompte_cents), 9.5)
  right('Solde à la livraison', money(s.total_cents - s.acompte_cents), 9.5)
  ctx.y -= 10

  if (s.notes) {
    ensure(ctx, 30)
    text(ctx, 'REMARQUE DU CLIENT', M, 8, { bold: true, color: ACCENT })
    ctx.y -= 12
    paragraph(ctx, s.notes, 8.5)
    ctx.y -= 8
  }

  ensure(ctx, 40)
  text(ctx, 'CONDITIONS', M, 8, { bold: true, color: ACCENT })
  ctx.y -= 12
  paragraph(ctx, s.conditions, 8.5)
  ctx.y -= 12

  ensure(ctx, 60)
  text(ctx, 'SIGNATURES', M, 8, { bold: true, color: ACCENT })
  ctx.y -= 12
  paragraph(
    ctx,
    `Ce contrat est signé électroniquement par ${s.company.company_name} puis par le client, après vérification de son adresse e-mail par un code à usage unique. ` +
      'Le certificat de signature joint à la version signée contient les preuves (empreintes SHA-256, horodatages, cachet électronique). ' +
      'Toute personne peut vérifier ce document sur sarahcreations.i7dev.com.br/verifier.',
    8.5,
    MUTED,
  )

  footer(doc, font, `${s.company.company_name}  ·  Contrat devis n° ${s.order_number} v${s.version}`)
  return await doc.save({ useObjectStreams: false })
}

export type CertificateEntry = {
  role: 'sarah' | 'client'
  signer: Record<string, string>
  created_at: string
  ip: string
  user_agent: string
  otp_verified_at: string | null
  event_hash: string
  prev_hash: string
  server_sig: string
  tsa_time: string | null
  signature_png: Uint8Array | null
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return ''
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
}

export function maskIp(ip: string): string {
  if (!ip) return 'non communiquée'
  if (ip.includes('.')) return ip.split('.').slice(0, 2).concat(['x', 'x']).join('.')
  return `${ip.split(':').slice(0, 3).join(':')}:…`
}

/** PDF final = PDF original + página(s) « Certificat de signature » */
export async function appendCertificate(
  original: Uint8Array,
  info: { order_number: number; version: number; doc_sha256: string; public_key_fingerprint: string; company: string },
  entries: CertificateEntry[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page: doc.addPage(A4), y: A4[1] - M, font, bold }
  const W = A4[0] - 2 * M

  text(ctx, 'CERTIFICAT DE SIGNATURE ÉLECTRONIQUE', M, 14, { bold: true, color: ACCENT })
  ctx.y -= 16
  text(ctx, `Contrat devis n° ${info.order_number}, version ${info.version}`, M, 9.5, { color: MUTED })
  ctx.y -= 18
  text(ctx, 'Empreinte SHA-256 du contrat signé (pages précédentes, avant ce certificat) :', M, 8.5, { bold: true })
  ctx.y -= 12
  text(ctx, info.doc_sha256, M, 8, { color: INK })
  ctx.y -= 20

  for (const e of entries) {
    ensure(ctx, 170)
    const who = e.role === 'sarah' ? `Émetteur : ${info.company}` : 'Client'
    text(ctx, who.toUpperCase(), M, 8.5, { bold: true, color: ACCENT })
    ctx.y -= 14
    const rows: [string, string][] =
      e.role === 'sarah'
        ? [
            ['Signé par', e.signer.nom ?? ''],
            ['Date', `${parisDate(e.created_at)} (heure de Paris)`],
          ]
        : [
            ['Signé par', [e.signer.grade, e.signer.nom].filter(Boolean).join(' ')],
            ['Unité / organisme', e.signer.unite || 'non renseigné'],
            ['E-mail vérifié', `${maskEmail(e.signer.email ?? '')} (code à usage unique validé le ${e.otp_verified_at ? parisDate(e.otp_verified_at) : ''})`],
            ['Date', `${parisDate(e.created_at)} (heure de Paris)`],
            ['Adresse IP', maskIp(e.ip)],
            ['Navigateur', e.user_agent.slice(0, 90)],
          ]
    rows.push(['Horodatage tiers (RFC 3161)', e.tsa_time ? `${parisDate(e.tsa_time)} (FreeTSA)` : 'non disponible'])
    for (const [k, v] of rows) {
      text(ctx, k, M, 8.5, { color: MUTED })
      ctx.page.drawText(fit(v, font, 8.5, W - 150), { x: M + 150, y: ctx.y, size: 8.5, font, color: INK })
      ctx.y -= 12
    }
    text(ctx, 'Empreinte de la preuve', M, 7.5, { color: MUTED })
    ctx.page.drawText(e.event_hash, { x: M + 150, y: ctx.y, size: 7, font, color: INK })
    ctx.y -= 10
    text(ctx, 'Cachet électronique', M, 7.5, { color: MUTED })
    for (const l of wrap(e.server_sig, font, 7, W - 150)) {
      ctx.page.drawText(l, { x: M + 150, y: ctx.y, size: 7, font, color: INK })
      ctx.y -= 9
    }
    if (e.signature_png) {
      const img = await doc.embedPng(e.signature_png)
      const scale = Math.min(200 / img.width, 70 / img.height)
      ctx.y -= 72
      ctx.page.drawRectangle({ x: M + 150, y: ctx.y - 2, width: 206, height: 76, borderColor: LINE, borderWidth: 0.6 })
      ctx.page.drawImage(img, { x: M + 153, y: ctx.y + 1, width: img.width * scale, height: img.height * scale })
      text(ctx, 'Signature manuscrite', M, 7.5, { color: MUTED })
      ctx.y -= 8
    }
    ctx.y -= 14
    ctx.page.drawLine({ start: { x: M, y: ctx.y + 6 }, end: { x: M + W, y: ctx.y + 6 }, thickness: 0.4, color: LINE })
    ctx.y -= 6
  }

  ensure(ctx, 90)
  text(ctx, 'VÉRIFICATION', M, 8.5, { bold: true, color: ACCENT })
  ctx.y -= 12
  paragraph(
    ctx,
    'Ce document peut être vérifié sur sarahcreations.i7dev.com.br/verifier : déposez le fichier PDF, son empreinte SHA-256 est calculée dans votre navigateur et comparée au registre des signatures. ' +
      'Chaque preuve est chaînée à la précédente, scellée par la clé Ed25519 de ' +
      info.company +
      ` (empreinte de la clé publique ${info.public_key_fingerprint}, publiée sur sarahcreations.i7dev.com.br/.well-known/sarah-signature.pub) ` +
      "et horodatée par une autorité tierce (RFC 3161), vérifiable de façon indépendante avec « openssl ts -verify ». " +
      'Signature électronique au sens du règlement eIDAS (UE) n° 910/2014 et des articles 1366 et 1367 du Code civil.',
    8,
    MUTED,
  )

  footer(doc, font, `${info.company}  ·  Contrat devis n° ${info.order_number} v${info.version}  ·  signé`)
  return await doc.save({ useObjectStreams: false })
}
