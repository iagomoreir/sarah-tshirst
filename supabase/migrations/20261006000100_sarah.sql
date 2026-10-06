-- =====================================================================
-- SARAH: Sarah Nani Créations / MILI by NANI (sarahcreations.i7dev.com.br)
-- Schema próprio no banco compartilhado. Depende de 20261006000000_core.sql.
-- Funções com search_path vazio e nomes sempre qualificados (sarah.*).
-- =====================================================================

create schema if not exists sarah;

insert into core.projects (slug, name, domain)
values ('sarah', 'Sarah Nani Créations', 'sarahcreations.i7dev.com.br')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type sarah.order_status as enum ('novo', 'em_producao', 'pronto', 'entregue', 'cancelado');
create type sarah.staff_role as enum ('webmaster', 'loja');

-- ---------------------------------------------------------------------
-- EQUIPE (quem entra no painel). webmaster: tudo; loja: pedidos e produtos.
-- Admins do core.admins entram como webmaster sem precisar estar aqui.
-- ---------------------------------------------------------------------
create table sarah.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  role       sarah.staff_role not null default 'loja',
  created_at timestamptz not null default now()
);

create or replace function sarah.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select core.is_admin()
      or exists (select 1 from sarah.staff where user_id = (select auth.uid()));
$$;

create or replace function sarah.is_webmaster() returns boolean
language sql stable security definer set search_path = '' as $$
  select core.is_admin()
      or exists (select 1 from sarah.staff where user_id = (select auth.uid()) and role = 'webmaster');
$$;

-- Quem sou eu neste painel (linha do staff, ou admin global como webmaster)
create or replace function sarah.my_access()
returns table (user_id uuid, name text, email text, role sarah.staff_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.name, s.email, s.role, s.created_at
  from sarah.staff s where s.user_id = (select auth.uid())
  union all
  select a.user_id, coalesce(nullif(a.name, ''), 'Webmaster'), a.email, 'webmaster'::sarah.staff_role, a.created_at
  from core.admins a
  where a.user_id = (select auth.uid())
    and not exists (select 1 from sarah.staff s2 where s2.user_id = a.user_id)
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- PRODUTOS
-- kind 'textile': T-shirt MC, manches longues, débardeur, sweat... (bon de commande)
-- kind 'objet': coques, mugs, objets et événements (vitrine + devis no WhatsApp)
-- prices: preço por técnica em centavos ({"dtf": 2500, "sublimation": 1600})
-- colors: [{"name": "Sable", "hex": "#c8b28a"}, ...]
-- ---------------------------------------------------------------------
create table sarah.products (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'textile' check (kind in ('textile', 'objet')),
  name        text not null,
  description text not null default '',
  prices      jsonb not null default '{}'::jsonb,
  price_from  integer check (price_from >= 0),
  sizes       text[] not null default '{S,M,L,XL,2XL,3XL}',
  colors      jsonb not null default '[]'::jsonb,
  image_url   text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Opções (+1€ cada). needs_detail: pede um texto (país, régiment)
create table sarah.options (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text not null default '',
  price_cents  integer not null default 100 check (price_cents >= 0),
  needs_detail boolean not null default false,
  detail_label text not null default '',
  active       boolean not null default true,
  sort         integer not null default 0
);

-- ---------------------------------------------------------------------
-- PEDIDOS (bon de commande = 1 pedido com N linhas, 1 por pessoa)
-- ---------------------------------------------------------------------
create table sarah.orders (
  id             uuid primary key default gen_random_uuid(),
  number         bigint generated always as identity (start with 1001),
  contact_name   text not null check (length(contact_name) between 2 and 120),
  contact_phone  text not null check (length(contact_phone) between 6 and 30),
  contact_email  text not null default '' check (length(contact_email) <= 200),
  unit           text not null default '' check (length(unit) <= 200),
  notes          text not null default '' check (length(notes) <= 2000),
  status         sarah.order_status not null default 'novo',
  total_cents    integer not null,
  pieces         integer not null default 0,
  internal_note  text not null default '',
  source         text not null default 'site',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- options: [{"code":"drapeau_nat","name":"Drapeau de nationalité","detail":"Maroc","price_cents":100}]
create table sarah.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references sarah.orders (id) on delete cascade,
  position         integer not null,
  grade            text not null default '',
  person_name      text not null default '',
  product_id       uuid references sarah.products (id) on delete set null,
  product_name     text not null,
  technique        text not null check (technique in ('dtf', 'sublimation')),
  size             text not null,
  color            text not null,
  quantity         integer not null check (quantity between 1 and 500),
  options          jsonb not null default '[]'::jsonb,
  remarks          text not null default '',
  unit_price_cents integer not null
);

create index orders_status_idx on sarah.orders (status, created_at desc);
create index order_items_order_idx on sarah.order_items (order_id, position);
create index order_items_product_idx on sarah.order_items (product_id);

create or replace function sarah.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch before update on sarah.orders
for each row execute function sarah.touch_updated_at();

-- ---------------------------------------------------------------------
-- CRIAR PEDIDO (site público e painel). O cliente manda só as escolhas;
-- todos os preços saem daqui.
-- p_contact: {"name","phone","email","unit","notes"}
-- p_lines: [{"grade","person_name","product_id","technique","size","color",
--            "quantity","options":[{"code","detail"}],"remarks"}]
-- ---------------------------------------------------------------------
create or replace function sarah.create_order(p_contact jsonb, p_lines jsonb, p_source text default 'site')
returns table (order_number bigint, total_cents integer, pieces integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_number   bigint;
  v_total    integer := 0;
  v_pieces   integer := 0;
  v_line     jsonb;
  v_opt      jsonb;
  v_product  sarah.products%rowtype;
  v_option   sarah.options%rowtype;
  v_qty      integer;
  v_tech     text;
  v_base     integer;
  v_unit     integer;
  v_opts     jsonb;
  v_pos      integer := 0;
  v_source   text := case when p_source = 'painel' and sarah.is_staff() then 'painel' else 'site' end;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Commande vide';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'Trop de lignes (max. 300)';
  end if;

  insert into sarah.orders (contact_name, contact_phone, contact_email, unit, notes, total_cents, source)
  values (
    trim(p_contact ->> 'name'),
    trim(p_contact ->> 'phone'),
    coalesce(trim(p_contact ->> 'email'), ''),
    coalesce(trim(p_contact ->> 'unit'), ''),
    coalesce(trim(p_contact ->> 'notes'), ''),
    0,
    v_source
  )
  returning id, number into v_order_id, v_number;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos := v_pos + 1;

    select * into v_product from sarah.products
    where id = (v_line ->> 'product_id')::uuid and active and kind = 'textile';
    if not found then
      raise exception 'Ligne %: modèle indisponible', v_pos;
    end if;

    v_tech := v_line ->> 'technique';
    v_base := (v_product.prices ->> v_tech)::integer;
    if v_base is null then
      raise exception 'Ligne %: % indisponible en %', v_pos, v_product.name, coalesce(v_tech, '?');
    end if;

    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 500 then
      raise exception 'Ligne %: quantité invalide', v_pos;
    end if;
    if not (v_line ->> 'size') = any (v_product.sizes) then
      raise exception 'Ligne %: taille invalide', v_pos;
    end if;
    if jsonb_array_length(v_product.colors) > 0 and not exists (
      select 1 from jsonb_array_elements(v_product.colors) c where c ->> 'name' = v_line ->> 'color'
    ) then
      raise exception 'Ligne %: couleur invalide', v_pos;
    end if;

    v_unit := v_base;
    v_opts := '[]'::jsonb;
    for v_opt in select * from jsonb_array_elements(coalesce(v_line -> 'options', '[]'::jsonb)) loop
      select * into v_option from sarah.options where code = v_opt ->> 'code' and active;
      if not found then
        raise exception 'Ligne %: option inconnue', v_pos;
      end if;
      if v_opts @> jsonb_build_array(jsonb_build_object('code', v_option.code)) then
        continue; -- mesma opção duas vezes: ignora
      end if;
      v_unit := v_unit + v_option.price_cents;
      v_opts := v_opts || jsonb_build_array(jsonb_build_object(
        'code', v_option.code,
        'name', v_option.name,
        'detail', left(coalesce(trim(v_opt ->> 'detail'), ''), 80),
        'price_cents', v_option.price_cents
      ));
    end loop;

    insert into sarah.order_items (order_id, position, grade, person_name, product_id, product_name,
                                   technique, size, color, quantity, options, remarks, unit_price_cents)
    values (v_order_id, v_pos,
            left(coalesce(trim(v_line ->> 'grade'), ''), 40),
            upper(left(coalesce(trim(v_line ->> 'person_name'), ''), 80)),
            v_product.id, v_product.name, v_tech,
            v_line ->> 'size', coalesce(v_line ->> 'color', ''), v_qty, v_opts,
            left(coalesce(trim(v_line ->> 'remarks'), ''), 300),
            v_unit);

    v_total := v_total + v_qty * v_unit;
    v_pieces := v_pieces + v_qty;
  end loop;

  update sarah.orders set total_cents = v_total, pieces = v_pieces where id = v_order_id;

  return query select v_number, v_total, v_pieces;
end;
$$;

-- ---------------------------------------------------------------------
-- PERMISSÕES (schemas novos não herdam os grants do public no Supabase)
-- ---------------------------------------------------------------------
grant usage on schema sarah to anon, authenticated, service_role;
grant select on sarah.products, sarah.options to anon;
grant select, insert, update, delete on all tables in schema sarah to authenticated;
grant all on all tables in schema sarah to service_role;
grant usage, select on all sequences in schema sarah to authenticated, service_role;

revoke all on all functions in schema sarah from public;
grant execute on function sarah.is_staff(), sarah.is_webmaster() to anon, authenticated;
grant execute on function sarah.my_access() to authenticated;
grant execute on function sarah.create_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS (ligado em tudo: a anon key é a mesma para todos os sites)
-- ---------------------------------------------------------------------
alter table sarah.staff enable row level security;
alter table sarah.products enable row level security;
alter table sarah.options enable row level security;
alter table sarah.orders enable row level security;
alter table sarah.order_items enable row level security;

create policy "equipe vê equipe" on sarah.staff for select to authenticated using ((select sarah.is_staff()));
create policy "webmaster gerencia equipe" on sarah.staff for all to authenticated
  using ((select sarah.is_webmaster())) with check ((select sarah.is_webmaster()));

create policy "todos veem produtos ativos" on sarah.products for select to anon, authenticated
  using (active or (select sarah.is_staff()));
create policy "equipe gerencia produtos" on sarah.products for all to authenticated
  using ((select sarah.is_staff())) with check ((select sarah.is_staff()));

create policy "todos veem opções ativas" on sarah.options for select to anon, authenticated
  using (active or (select sarah.is_staff()));
create policy "equipe gerencia opções" on sarah.options for all to authenticated
  using ((select sarah.is_staff())) with check ((select sarah.is_staff()));

-- Pedidos só entram via create_order(); leitura/edição só pela equipe.
create policy "equipe gerencia pedidos" on sarah.orders for all to authenticated
  using ((select sarah.is_staff())) with check ((select sarah.is_staff()));
create policy "equipe gerencia itens" on sarah.order_items for all to authenticated
  using ((select sarah.is_staff())) with check ((select sarah.is_staff()));

-- Pedido novo aparece no painel na hora
alter publication supabase_realtime add table sarah.orders;

-- ---------------------------------------------------------------------
-- STORAGE: bucket próprio (prefixo do projeto); nomes de policy também,
-- porque storage.objects é compartilhado entre todos os projetos.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('sarah-produits', 'sarah-produits', true)
on conflict (id) do nothing;

create policy "sarah: equipe envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'sarah-produits' and (select sarah.is_staff()));
create policy "sarah: equipe edita fotos" on storage.objects for update to authenticated
  using (bucket_id = 'sarah-produits' and (select sarah.is_staff()));
create policy "sarah: equipe apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'sarah-produits' and (select sarah.is_staff()));

-- ---------------------------------------------------------------------
-- DADOS DO FLYER (editáveis depois no painel)
-- ---------------------------------------------------------------------
insert into sarah.products (name, description, prices, sizes, colors, sort, image_url) values
  ('T-shirt manches courtes', 'Le modèle de base, en DTF ou en sublimation.',
   '{"dtf": 2500, "sublimation": 1600}', '{S,M,L,XL,2XL,3XL}',
   '[{"name":"Sable","hex":"#c8b28a"},{"name":"Vert armée","hex":"#4b5320"}]', 1,
   '/img/realisations/tshirt-sable-nom-grade-640.webp'),
  ('T-shirt manches longues', '+3€ par rapport au tarif du T-shirt MC.',
   '{"dtf": 2800, "sublimation": 1900}', '{S,M,L,XL,2XL,3XL}',
   '[{"name":"Sable","hex":"#c8b28a"},{"name":"Vert armée","hex":"#4b5320"}]', 2, null),
  ('Débardeur', 'Disponible en DTF et en sublimation.',
   '{"dtf": 2500, "sublimation": 1600}', '{S,M,L,XL,2XL,3XL}',
   '[{"name":"Sable","hex":"#c8b28a"},{"name":"Vert armée","hex":"#4b5320"}]', 3, null),
  ('Sweat à capuche', '+5€ par rapport au tarif du T-shirt MC. DTF uniquement.',
   '{"dtf": 3000}', '{S,M,L,XL,2XL,3XL}',
   '[{"name":"Sable","hex":"#c8b28a"},{"name":"Vert armée","hex":"#4b5320"}]', 4,
   '/img/realisations/sweat-vert-face-mdl-640.webp');

insert into sarah.products (kind, name, description, sizes, colors, sort, image_url) values
  ('objet', 'Coque de téléphone', 'Une coque qui te ressemble : prénom intégré, visuel unique, pour ton modèle de téléphone.',
   '{}', '[]', 10, '/img/realisations/coque-personnalisee-640.webp'),
  ('objet', 'Mug personnalisé', 'Ton visuel, ton humour, ta tasse. Idéal en cadeau ou pour la section.',
   '{}', '[]', 11, '/img/realisations/mug-personnalise-640.webp'),
  ('objet', 'Objets et événements', 'Cadeaux, anniversaires, pots de départ, fins de stage : on imagine ensemble l’objet qui marquera le moment.',
   '{}', '[]', 12, null);

insert into sarah.options (code, name, description, price_cents, needs_detail, detail_label, sort) values
  ('drapeau_fr', 'Drapeau français', 'Sur la manche gauche.', 100, false, '', 1),
  ('drapeau_nat', 'Drapeau de nationalité', 'Sur la manche droite. Autres drapeaux sur demande.', 100, true, 'Pays', 2),
  ('insigne', 'Insigne régimentaire / petit logo', 'Sur la manche gauche.', 100, true, 'Régiment ou logo', 3);
