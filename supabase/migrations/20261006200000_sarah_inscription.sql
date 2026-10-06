-- =====================================================================
-- SARAH: inscription no painel com aprovação do webmaster.
-- Quem se inscreve pelo botão "Créer un compte" (user_metadata.app = 'sarah')
-- ganha uma demanda em sarah.access_requests; o webmaster aprova (insere em
-- sarah.staff, o que apaga a demanda) ou recusa (apaga a demanda).
-- Contas de outros microprojetos que já existem pedem acesso pelo painel
-- (sarah.request_access), sem criar outra conta.
-- =====================================================================

create table sarah.access_requests (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  created_at timestamptz not null default now()
);

-- Cadastro feito pelo site da Sarah → demanda automática (antes mesmo da
-- confirmação do e-mail; a lista do webmaster mostra se já foi confirmado).
create or replace function sarah.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'app' = 'sarah' then
    insert into sarah.access_requests (user_id, name, email)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'nom'), ''), new.email),
      lower(new.email)
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger sarah_on_auth_user_created
  after insert on auth.users
  for each row execute function sarah.handle_new_user();

-- Entrou na equipe (aprovação ou criação pela aba Utilisateurs) → some a demanda.
create or replace function sarah.clear_request()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from sarah.access_requests where user_id = new.user_id;
  return new;
end;
$$;

create trigger staff_clear_request
  after insert on sarah.staff
  for each row execute function sarah.clear_request();

-- Conta já existente (ex.: de outro microprojeto) pede acesso ao painel.
create or replace function sarah.request_access(p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if sarah.is_staff() then return; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Nom invalide'; end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  insert into sarah.access_requests (user_id, name, email)
  values (v_uid, left(trim(p_name), 120), v_email)
  on conflict (user_id) do nothing;
end;
$$;

-- Lista do webmaster, com o estado da confirmação do e-mail.
create or replace function sarah.pending_requests()
returns table (user_id uuid, name text, email text, created_at timestamptz, email_confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select r.user_id, r.name, r.email, r.created_at, u.email_confirmed_at is not null
  from sarah.access_requests r
  join auth.users u on u.id = r.user_id
  where sarah.is_webmaster()
  order by r.created_at;
$$;

-- Permissões: a demanda só entra pelas funções acima.
grant select, delete on sarah.access_requests to authenticated;
grant all on sarah.access_requests to service_role;

revoke all on function sarah.handle_new_user(), sarah.clear_request() from public, anon, authenticated;
revoke all on function sarah.request_access(text), sarah.pending_requests() from public, anon;
grant execute on function sarah.request_access(text), sarah.pending_requests() to authenticated;

alter table sarah.access_requests enable row level security;

create policy "vê a própria demanda ou webmaster" on sarah.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select sarah.is_webmaster()));
create policy "webmaster recusa demanda" on sarah.access_requests for delete to authenticated
  using ((select sarah.is_webmaster()));
