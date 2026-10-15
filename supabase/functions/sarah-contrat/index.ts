// Contrato do devis: a Sarah gera e assina, o cliente assina por link com código
// enviado por e-mail, qualquer pessoa verifica pelo PDF em /verifier.
// Escrita só aqui (service role); prova encadeada, selada (Ed25519) e carimbada (RFC 3161).
// Deploy: supabase functions deploy sarah-contrat --no-verify-jwt
// Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Chave Ed25519: gerada aqui na primeira vez e guardada no Supabase Vault
// (sarah.store_signing_key / sarah.signing_key, só service role).
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import {
  appendCertificate,
  b64,
  buildContractPdf,
  eventHash,
  isoMs,
  maskEmail,
  sha256Hex,
  signEd25519,
  timeStampRequest,
  timeStampStatus,
  timeStampTime,
  unb64,
  verifyEd25519,
  type CertificateEntry,
  type EventInput,
  type Snapshot,
} from './lib.ts'

const SCHEMA = 'sarah'
const BUCKET = 'sarah-documents'
const SITE = Deno.env.get('SITE_URL') ?? 'https://sarahcreations.i7dev.com.br'
const TSA_URL = 'https://freetsa.org/tsr'
const TECHNIQUES: Record<string, string> = { dtf: 'DTF', sublimation: 'Sublimation' }
const CLIENT_CONSENT =
  'Lu et approuvé, bon pour accord. Je confirme avoir pris connaissance du contrat, des prix TTC et des conditions, et je le signe électroniquement.'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const url = Deno.env.get('SUPABASE_URL')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: SCHEMA } })

function clientIp(req: Request) {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''
}

function randomToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function staffName(req: Request): Promise<string> {
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    db: { schema: SCHEMA },
  })
  const { data } = await caller.rpc('my_access').maybeSingle()
  const name = (data as { name?: string } | null)?.name
  if (!name) throw new HttpError(403, 'Accès réservé à l’équipe')
  return name
}

async function settings() {
  const { data, error } = await admin.from('settings').select('*').single()
  if (error || !data) throw new HttpError(500, 'Paramètres de l’entreprise introuvables')
  return data
}

async function upload(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (error) throw new HttpError(500, `Stockage impossible : ${error.message}`)
}

async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error || !data) throw new HttpError(500, 'Document introuvable dans le stockage')
  return new Uint8Array(await data.arrayBuffer())
}

async function signedUrl(path: string | null) {
  if (!path) return null
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600, { download: true })
  return data?.signedUrl ?? null
}

/** Carimbo RFC 3161; se a autoridade não responder, segue sem (fica indicado) */
async function timestamp(hash: string): Promise<string | null> {
  try {
    const res = await fetch(TSA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: timeStampRequest(hash, crypto.getRandomValues(new Uint8Array(8))),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return [0, 1].includes(timeStampStatus(bytes)) ? b64(bytes) : null
  } catch {
    return null
  }
}

let cachedKey: string | null = null

/** Chave privada do cachet; cria o par na primeira vez (a privada nunca sai do Vault) */
async function signingKey(): Promise<string> {
  if (cachedKey) return cachedKey
  const { data } = await admin.rpc('signing_key')
  if (data) return (cachedKey = data as string)
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const priv = b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))
  const pub = b64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)))
  const { error } = await admin.rpc('store_signing_key', { p_private: priv, p_public: pub })
  if (error) {
    // Outra requisição criou ao mesmo tempo: usa a dela
    const again = await admin.rpc('signing_key')
    if (!again.data) throw new HttpError(503, 'Clé de signature indisponible')
    return (cachedKey = again.data as string)
  }
  return (cachedKey = priv)
}

async function publicKey() {
  await signingKey()
  const s = await settings()
  return { public_key: s.public_key, fingerprint: (await sha256Hex(s.public_key)).slice(0, 16) }
}

/** Grava um evento de prova encadeado ao anterior (cadeia global) */
async function appendEvent(input: Omit<EventInput, 'prev_hash' | 'created_at'>) {
  const key = await signingKey()
  const { data: last } = await admin.from('signature_events').select('event_hash').order('id', { ascending: false }).limit(1).maybeSingle()
  const event: EventInput = { ...input, prev_hash: last?.event_hash ?? 'GENESIS', created_at: new Date().toISOString() }
  const hash = await eventHash(event)
  const server_sig = await signEd25519(key, hash)
  const tsa_token = await timestamp(hash)
  const { data, error } = await admin
    .from('signature_events')
    .insert({ ...event, event_hash: hash, server_sig, tsa_token })
    .select('*')
    .single()
  if (error) throw new HttpError(500, `Preuve non enregistrée : ${error.message}`)
  return data
}

function smtpReady() {
  return Boolean(Deno.env.get('SMTP_HOST') && Deno.env.get('SMTP_USER') && Deno.env.get('SMTP_PASS'))
}

async function sendMail(to: string, subject: string, text: string) {
  const user = Deno.env.get('SMTP_USER')!
  const port = Number(Deno.env.get('SMTP_PORT') ?? 465)
  const transport = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST'), port, secure: port === 465, auth: { user, pass: Deno.env.get('SMTP_PASS') } })
  await transport.sendMail({ from: Deno.env.get('SMTP_FROM') ?? `Sarah Nani Créations <${user}>`, to, subject, text })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Envia o link de assinatura ao e-mail do devis; falha de e-mail não impede o contrato */
async function emailLink(order: { number: number; contact_name: string; contact_email: string }, link: string) {
  const to = (order.contact_email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(to)) return { emailed: null, email_error: 'Pas d’e-mail valide sur ce devis.' }
  if (!smtpReady()) return { emailed: null, email_error: 'Envoi d’e-mail non configuré.' }
  try {
    await sendMail(
      to,
      `Contrat à signer : devis n° ${order.number}, Sarah Nani Créations`,
      `Bonjour ${order.contact_name},\n\nVotre contrat pour le devis n° ${order.number} est prêt. Vous pouvez le lire et le signer en ligne ici :\n\n${link}\n\n` +
        'Un code de confirmation vous sera envoyé par e-mail au moment de signer. Le lien est valable 30 jours.\n\nMerci !\nSarah Nani Créations',
    )
    return { emailed: maskEmail(to), email_error: null }
  } catch (e) {
    console.error(e)
    return { emailed: null, email_error: 'L’e-mail n’a pas pu être envoyé.' }
  }
}

async function documentByToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(404, 'Lien invalide')
  const { data } = await admin.from('documents').select('*').eq('client_token_hash', await sha256Hex(token)).maybeSingle()
  if (!data || data.status === 'remplace') throw new HttpError(404, 'Ce lien n’est plus valable. Demandez un nouveau lien à Sarah.')
  if (data.status === 'attente_client' && new Date(data.token_expires_at) < new Date()) throw new HttpError(410, 'Ce lien a expiré. Demandez un nouveau lien à Sarah.')
  return data
}

async function newClientLink(documentId: string) {
  const token = randomToken()
  const { error } = await admin
    .from('documents')
    .update({ client_token_hash: await sha256Hex(token), token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() })
    .eq('id', documentId)
  if (error) throw new HttpError(500, 'Lien non créé')
  return `${SITE}/signer/${token}`
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------

async function create(req: Request, body: Record<string, unknown>) {
  const actor = await staffName(req)
  await signingKey() // antes de gravar qualquer coisa: sem chave, nada é criado
  const { data: order } = await admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', String(body.order_id ?? ''))
    .order('position', { referencedTable: 'order_items' })
    .maybeSingle()
  if (!order) throw new HttpError(404, 'Devis introuvable')
  if (order.status !== 'devis') throw new HttpError(409, 'Le contrat se génère uniquement à l’étape devis')

  const { data: previous } = await admin.from('documents').select('id, status, version').eq('order_id', order.id).eq('kind', 'contrat')
  if (previous?.some((d) => d.status === 'signe')) throw new HttpError(409, 'Ce devis a déjà un contrat signé par le client')
  const version = (previous?.reduce((m, d) => Math.max(m, d.version), 0) ?? 0) + 1

  const s = await settings()
  const acompte_cents = Math.round((order.total_cents * s.acompte_pct) / 100)
  const snapshot: Snapshot = {
    kind: 'contrat',
    order_number: order.number,
    version,
    issued_at: new Date().toISOString(),
    company: { company_name: s.company_name, address: s.address, phone: s.phone, email: s.email, siret: s.siret, vat_number: s.vat_number },
    client: { name: order.contact_name, unit: order.unit, phone: order.contact_phone, email: order.contact_email },
    lines: order.order_items.map((i: Record<string, any>) => ({
      position: i.position,
      grade: i.grade,
      name: i.person_name,
      product: i.product_name,
      technique: TECHNIQUES[i.technique] ?? i.technique,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
      options: (i.options ?? []).map((o: { name: string; detail: string }) => (o.detail ? `${o.name}: ${o.detail}` : o.name)).join(', '),
      remarks: i.remarks,
      unit_cents: i.unit_price_cents,
      total_cents: i.unit_price_cents * i.quantity,
    })),
    pieces: order.pieces,
    total_cents: order.total_cents,
    acompte_pct: s.acompte_pct,
    acompte_cents,
    conditions: s.conditions,
    notes: order.notes,
  }

  const pdf = await buildContractPdf(snapshot)
  const sha256 = await sha256Hex(pdf)
  const id = crypto.randomUUID()
  const pdf_path = `contrats/${order.number}/${id}-v${version}.pdf`
  await upload(pdf_path, pdf, 'application/pdf')

  if (previous?.length) await admin.from('documents').update({ status: 'remplace', client_token_hash: null }).eq('order_id', order.id).eq('status', 'attente_client')
  const { error } = await admin.from('documents').insert({ id, order_id: order.id, kind: 'contrat', version, snapshot, sha256, pdf_path, created_by: actor })
  if (error) throw new HttpError(500, `Contrat non enregistré : ${error.message}`)

  // Assinatura da Sarah: automática ao gerar
  await appendEvent({
    document_id: id,
    role: 'sarah',
    signer: { nom: actor, entreprise: s.company_name },
    doc_sha256: sha256,
    consent_text: `Je, ${actor}, pour ${s.company_name}, émets et signe ce contrat (devis n° ${order.number}, version ${version}).`,
    signature_png_sha256: null,
    ip: clientIp(req),
    user_agent: req.headers.get('user-agent') ?? '',
    otp_verified_at: null,
  })

  const link = await newClientLink(id)
  return { document_id: id, version, sha256, link, ...(await emailLink(order, link)) }
}

async function renewLink(req: Request, body: Record<string, unknown>) {
  await staffName(req)
  const { data: doc } = await admin.from('documents').select('id, status, order_id').eq('id', String(body.document_id ?? '')).maybeSingle()
  if (!doc || doc.status !== 'attente_client') throw new HttpError(409, 'Ce contrat n’attend plus de signature')
  const link = await newClientLink(doc.id)
  const { data: order } = await admin.from('orders').select('number, contact_name, contact_email').eq('id', doc.order_id).single()
  return { link, ...(await emailLink(order!, link)) }
}

async function clientView(body: Record<string, unknown>) {
  const doc = await documentByToken(body.token)
  const { data: events } = await admin.from('signature_events').select('role, signer, created_at').eq('document_id', doc.id).order('id')
  const sarah = events?.find((e) => e.role === 'sarah')
  const client = events?.find((e) => e.role === 'client')
  return {
    status: doc.status,
    snapshot: doc.snapshot,
    sha256: doc.sha256,
    final_sha256: doc.final_sha256,
    pdf_url: await signedUrl(doc.status === 'signe' ? doc.final_pdf_path : doc.pdf_path),
    sarah: sarah ? { nom: sarah.signer.nom, date: sarah.created_at } : null,
    client: client ? { nom: [client.signer.grade, client.signer.nom].filter(Boolean).join(' '), date: client.created_at } : null,
  }
}

async function clientOtp(body: Record<string, unknown>) {
  const doc = await documentByToken(body.token)
  if (doc.status !== 'attente_client') throw new HttpError(409, 'Ce contrat est déjà signé')
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'Adresse e-mail invalide')

  const { data: existing } = await admin.from('otp_codes').select('created_at').eq('document_id', doc.id).maybeSingle()
  if (existing && Date.now() - new Date(existing.created_at).getTime() < 60_000) throw new HttpError(429, 'Un code vient d’être envoyé. Patientez une minute.')

  if (!smtpReady()) throw new HttpError(503, 'L’envoi d’e-mail n’est pas encore configuré. Contactez Sarah.')

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  const { error } = await admin.from('otp_codes').upsert({
    document_id: doc.id,
    email,
    code_hash: await sha256Hex(`${doc.id}:${code}`),
    attempts: 0,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new HttpError(500, 'Code non enregistré')

  const n = doc.snapshot.order_number
  await sendMail(
    email,
    `Votre code de signature : ${code}`,
    `Bonjour,\n\nVoici votre code pour signer le contrat du devis n° ${n} de Sarah Nani Créations :\n\n${code}\n\n` +
      'Ce code est valable 15 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\nSarah Nani Créations',
  )
  return { sent: true, email: maskEmail(email) }
}

async function clientSign(req: Request, body: Record<string, unknown>) {
  const doc = await documentByToken(body.token)
  if (doc.status !== 'attente_client') throw new HttpError(409, 'Ce contrat est déjà signé')

  const nom = String(body.nom ?? '').trim().slice(0, 120)
  const grade = String(body.grade ?? '').trim().slice(0, 60)
  const unite = String(body.unite ?? '').trim().slice(0, 160)
  if (nom.length < 2) throw new HttpError(400, 'Indiquez votre nom')
  if (body.consent !== true) throw new HttpError(400, 'Cochez « Lu et approuvé » pour signer')

  const png = String(body.signature ?? '').replace(/^data:image\/png;base64,/, '')
  const pngBytes = png ? unb64(png) : new Uint8Array()
  if (pngBytes.length < 100 || pngBytes.length > 400_000 || pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50) throw new HttpError(400, 'Dessinez votre signature')

  // Código: no máximo 5 tentativas, 15 minutos
  const { data: otp } = await admin.from('otp_codes').select('*').eq('document_id', doc.id).maybeSingle()
  if (!otp) throw new HttpError(400, 'Demandez d’abord un code par e-mail')
  if (new Date(otp.expires_at) < new Date()) throw new HttpError(400, 'Code expiré. Demandez un nouveau code.')
  if (otp.attempts >= 5) throw new HttpError(429, 'Trop d’essais. Demandez un nouveau code.')
  if ((await sha256Hex(`${doc.id}:${String(body.code ?? '').trim()}`)) !== otp.code_hash) {
    await admin.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('document_id', doc.id)
    throw new HttpError(400, 'Code incorrect')
  }
  const otpVerifiedAt = new Date().toISOString()

  const n = doc.snapshot.order_number
  await upload(`contrats/${n}/${doc.id}-signature-client.png`, pngBytes, 'image/png')
  const clientEvent = await appendEvent({
    document_id: doc.id,
    role: 'client',
    signer: { nom, grade, unite, email: otp.email },
    doc_sha256: doc.sha256,
    consent_text: CLIENT_CONSENT,
    signature_png_sha256: await sha256Hex(pngBytes),
    ip: clientIp(req),
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    otp_verified_at: otpVerifiedAt,
  })
  await admin.from('otp_codes').delete().eq('document_id', doc.id)

  // PDF final: original + certificado com as duas assinaturas
  const s = await settings()
  const { data: events } = await admin.from('signature_events').select('*').eq('document_id', doc.id).order('id')
  const entries: CertificateEntry[] = (events ?? []).map((e) => ({
    role: e.role,
    signer: e.signer,
    created_at: e.created_at,
    ip: e.ip,
    user_agent: e.user_agent,
    otp_verified_at: e.otp_verified_at,
    event_hash: e.event_hash,
    prev_hash: e.prev_hash,
    server_sig: e.server_sig,
    tsa_time: e.tsa_token ? timeStampTime(unb64(e.tsa_token)) : null,
    signature_png: e.id === clientEvent.id ? pngBytes : null,
  }))
  const final = await appendCertificate(
    await download(doc.pdf_path),
    {
      order_number: n,
      version: doc.version,
      doc_sha256: doc.sha256,
      public_key_fingerprint: (await sha256Hex(s.public_key)).slice(0, 16),
      company: s.company_name,
    },
    entries,
  )
  const final_sha256 = await sha256Hex(final)
  const final_pdf_path = `contrats/${n}/${doc.id}-v${doc.version}-signe.pdf`
  await upload(final_pdf_path, final, 'application/pdf')
  await admin.from('documents').update({ status: 'signe', final_sha256, final_pdf_path, signed_at: clientEvent.created_at }).eq('id', doc.id)

  // Étape « Prix validé » marcada com o nome de quem assinou
  await admin.rpc('mark_prix_signed', { p_order: doc.order_id, p_by: `${[grade, nom].filter(Boolean).join(' ')} (signature électronique)` })

  return { signed: true, final_sha256, pdf_url: await signedUrl(final_pdf_path) }
}

async function verify(body: Record<string, unknown>) {
  const hash = String(body.sha256 ?? '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, 'Empreinte invalide')
  const { data: doc } = await admin.from('documents').select('*').or(`sha256.eq.${hash},final_sha256.eq.${hash}`).maybeSingle()
  if (!doc) return { found: false }

  const s = await settings()
  const { data: events } = await admin.from('signature_events').select('*').eq('document_id', doc.id).order('id')
  const signers = []
  for (const e of events ?? []) {
    const recomputed = await eventHash({
      prev_hash: e.prev_hash,
      document_id: e.document_id,
      role: e.role,
      signer: e.signer,
      doc_sha256: e.doc_sha256,
      consent_text: e.consent_text,
      signature_png_sha256: e.signature_png_sha256,
      ip: e.ip,
      user_agent: e.user_agent,
      otp_verified_at: isoMs(e.otp_verified_at),
      created_at: isoMs(e.created_at)!,
    })
    const { data: prev } = await admin.from('signature_events').select('event_hash').lt('id', e.id).order('id', { ascending: false }).limit(1).maybeSingle()
    signers.push({
      role: e.role,
      nom: [e.signer.grade, e.signer.nom].filter(Boolean).join(' '),
      unite: e.signer.unite ?? e.signer.entreprise ?? '',
      email: e.signer.email ? maskEmail(e.signer.email) : '',
      date: e.created_at,
      email_verified_at: e.otp_verified_at,
      integrity_ok: recomputed === e.event_hash && e.doc_sha256 === doc.sha256,
      seal_ok: await verifyEd25519(s.public_key, e.event_hash, e.server_sig),
      chain_ok: e.prev_hash === (prev?.event_hash ?? 'GENESIS'),
      tsa_time: e.tsa_token ? timeStampTime(unb64(e.tsa_token)) : null,
      tsa_token: e.tsa_token,
      event_hash: e.event_hash,
    })
  }
  return {
    found: true,
    matched: hash === doc.final_sha256 ? 'final' : 'original',
    kind: doc.kind,
    order_number: doc.snapshot.order_number,
    version: doc.version,
    status: doc.status,
    issued_at: doc.snapshot.issued_at,
    company: s.company_name,
    client: doc.snapshot.client.unit || doc.snapshot.client.name,
    total_cents: doc.snapshot.total_cents,
    sha256: doc.sha256,
    final_sha256: doc.final_sha256,
    public_key: s.public_key,
    signers,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    switch (body.action) {
      case 'create':
        return json(await create(req, body))
      case 'renew-link':
        return json(await renewLink(req, body))
      case 'client-view':
        return json(await clientView(body))
      case 'client-otp':
        return json(await clientOtp(body))
      case 'client-sign':
        return json(await clientSign(req, body))
      case 'verify':
        return json(await verify(body))
      case 'public-key':
        return json(await publicKey())
      default:
        return json({ error: 'Action inconnue' }, 400)
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Erreur interne. Réessayez dans un instant.' }, 500)
  }
})
