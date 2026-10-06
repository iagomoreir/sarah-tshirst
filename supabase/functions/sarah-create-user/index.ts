// Cria um usuário do painel da Sarah (aba Utilisateurs). Só webmaster pode chamar.
// Banco compartilhado: o login (auth.users) é comum a todos os projetos, então
// se o e-mail já existir (conta de outro projeto), só damos acesso a este painel
// sem mexer na senha. O acesso em si é a linha em sarah.staff.
// Deploy: supabase functions deploy sarah-create-user
import { createClient } from 'npm:@supabase/supabase-js@2'

const SCHEMA = 'sarah'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    db: { schema: SCHEMA },
  })
  const { data: isWebmaster, error: roleError } = await caller.rpc('is_webmaster')
  if (roleError || !isWebmaster) return json({ error: 'Seul le webmaster peut créer des utilisateurs' }, 403)

  const { name, email, password, role } = await req.json().catch(() => ({}))
  if (typeof name !== 'string' || name.trim().length < 2) return json({ error: 'Nom invalide' }, 400)
  if (typeof email !== 'string' || !email.includes('@')) return json({ error: 'E-mail invalide' }, 400)
  if (typeof password !== 'string' || password.length < 8) return json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, 400)
  if (role !== 'loja' && role !== 'webmaster') return json({ error: 'Rôle invalide' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: SCHEMA } })
  const normalized = email.trim().toLowerCase()

  let userId: string | null = null
  let created = false
  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  })
  if (createdUser?.user) {
    userId = createdUser.user.id
    created = true
  } else if (createError && /already|exists|registered/i.test(createError.message)) {
    // Conta de outro microprojeto: reaproveita, sem trocar a senha dela
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      userId = data?.users.find((u) => u.email?.toLowerCase() === normalized)?.id ?? null
      if (!data || data.users.length < 1000) break
    }
  }
  if (!userId) return json({ error: createError?.message ?? 'Échec de la création' }, 400)

  const { error: staffError } = await admin
    .from('staff')
    .upsert({ user_id: userId, name: name.trim(), email: normalized, role }, { onConflict: 'user_id' })
  if (staffError) {
    if (created) await admin.auth.admin.deleteUser(userId)
    return json({ error: staffError.message }, 400)
  }

  return json({ ok: true, existing: !created })
})
