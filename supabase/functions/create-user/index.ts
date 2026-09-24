// Cria um usuário do painel (aba Cadastro). Só webmaster pode chamar.
// Deploy: supabase functions deploy create-user
import { createClient } from 'npm:@supabase/supabase-js@2'

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
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isWebmaster, error: roleError } = await caller.rpc('is_webmaster')
  if (roleError || !isWebmaster) return json({ error: 'Só o webmaster pode cadastrar usuários' }, 403)

  const { name, email, password, role } = await req.json().catch(() => ({}))
  if (typeof name !== 'string' || name.trim().length < 2) return json({ error: 'Nome inválido' }, 400)
  if (typeof email !== 'string' || !email.includes('@')) return json({ error: 'E-mail inválido' }, 400)
  if (typeof password !== 'string' || password.length < 8) return json({ error: 'Senha precisa de 8+ caracteres' }, 400)
  if (role !== 'loja' && role !== 'webmaster') return json({ error: 'Papel inválido' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  })
  if (createError || !created.user) return json({ error: createError?.message ?? 'Falha ao criar usuário' }, 400)

  const { error: staffError } = await admin
    .from('staff')
    .insert({ user_id: created.user.id, name: name.trim(), email: created.user.email, role })
  if (staffError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: staffError.message }, 400)
  }

  return json({ ok: true })
})
