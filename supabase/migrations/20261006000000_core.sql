-- =====================================================================
-- CORE: parte comum do banco compartilhado de microprojetos i7dev.
-- Idempotente: todo projeto carrega esta migração; rodar de novo não muda nada.
-- Regras completas em docs/banco-compartilhado.md
-- =====================================================================

create schema if not exists core;

-- Registro dos microprojetos (um schema cada)
create table if not exists core.projects (
  slug       text primary key check (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  name       text not null,
  domain     text not null default '',
  created_at timestamptz not null default now()
);

-- Webmasters globais: acesso de webmaster em TODOS os painéis
create table if not exists core.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now()
);

create or replace function core.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.admins where user_id = (select auth.uid()));
$$;

-- core não é exposto na API: só funções security definer leem estas tabelas
alter table core.projects enable row level security;
alter table core.admins enable row level security;
revoke all on all tables in schema core from anon, authenticated;
grant usage on schema core to anon, authenticated;
revoke all on function core.is_admin() from public;
grant execute on function core.is_admin() to anon, authenticated;
