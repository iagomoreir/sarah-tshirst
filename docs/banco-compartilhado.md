# Banco compartilhado de microprojetos (padrão i7dev)

Um único projeto Supabase hospeda vários microprojetos. **Cada microprojeto tem o
próprio schema do Postgres** (`sarah`, `arvion`, ...). A Sarah Nani Créations é o
primeiro projeto neste modelo.

```
projeto Supabase compartilhado
├── core    → comum a todos: core.projects (registro), core.admins (webmasters globais)
├── sarah   → Sarah Nani Créations (products, options, orders, order_items, staff)
└── <slug>  → próximo microprojeto
```

## Regras

1. **Um schema por projeto**, nomeado com um slug curto (`^[a-z][a-z0-9_]{1,30}$`).
   Nada de cliente em `public`.
2. **O site acessa só o próprio schema:**
   `createClient(url, anonKey, { db: { schema: 'slug' } })`.
3. **RLS ligado em todas as tabelas, sem exceção.** A anon key é a mesma para todos
   os sites; sem RLS, um site poderia ler dados de outro.
4. **Permissões explícitas.** Schemas novos não herdam os grants do `public`: toda
   migração de projeto termina com `grant usage on schema`, grants por tabela e
   `revoke all on all functions ... from public` + `grant execute` só no que é público.
5. **Funções:** `security definer` só quando necessário, sempre com
   `set search_path = ''` e nomes qualificados (`slug.tabela`, `auth.uid()`).
6. **Login é compartilhado** (`auth.users` é um só). Ter conta não dá acesso a nada:
   o acesso a um painel é uma linha em `slug.staff`. Webmasters globais ficam em
   `core.admins` e entram como webmaster em todos os painéis.
7. **Passkey:** a configuração é do projeto Supabase inteiro. Relying Party ID
   `i7dev.com.br` (nunca trocar: invalida todas as passkeys); cada site entra em
   *Relying Party Origins* (máximo 5, só subdomínios de `i7dev.com.br`). O nome exibido
   é um só para todos, então use um nome neutro (ex.: `i7dev`). Uma passkey identifica
   a conta em qualquer site; o acesso continua sendo a linha em `slug.staff`.
8. **Storage:** um bucket por projeto (`slug-...`) e nomes de policy prefixados
   (`"slug: ..."`), porque `storage.objects` é uma tabela só para todos.
9. **Edge Functions:** prefixo no nome (`slug-create-user`).
10. **Realtime:** `alter publication supabase_realtime add table slug.tabela`.
11. **Migrações:** no repositório de cada projeto, em `supabase/migrations/`.
    Todo projeto carrega a migração `..._core.sql` (idempotente) seguida das suas.

## Checklist: novo microprojeto

1. Copiar `supabase/migrations/20261006000000_core.sql` deste repositório.
2. Criar `supabase/migrations/<data>_<slug>.sql` a partir de
   `20261006000100_sarah.sql`: trocar o schema, registrar em `core.projects`,
   tabelas, funções `is_staff`/`is_webmaster`/`my_access`, grants, RLS, bucket.
3. Aplicar as migrações no projeto compartilhado.
4. **Expor o schema na API:** Supabase > Project Settings > Data API >
   *Exposed schemas* > adicionar `slug` (sem isso o site recebe erro 406/PGRST106).
5. No site: `db: { schema: 'slug' }`, bucket e nome da Edge Function com o prefixo.
6. Contas criadas pelo projeto levam `user_metadata.app = 'slug'`: gatilhos de cadastro de
   outros projetos devem ignorar contas com `app` diferente do deles.
7. Rodar os advisors de segurança do Supabase e corrigir o que aparecer.

## Limites e quando separar

- Recursos (CPU, conexões) são divididos entre todos os projetos.
- Backup é do banco inteiro; para restaurar um projeto só:
  `pg_dump --schema=slug`.
- Projeto que cresce, tem dados sensíveis ou cujo cliente quer o próprio banco:
  mover o schema para um projeto Supabase dedicado (`pg_dump --schema=slug` +
  restore) e trocar só URL e chave no site.
