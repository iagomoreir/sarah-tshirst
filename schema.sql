-- =====================================================================
-- Sarah Nani Créations - boutique (bons de commande en masse) + panneau
-- Supabase / Postgres. Rodar uma vez no SQL Editor de um projeto novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type order_status as enum ('novo', 'em_producao', 'pronto', 'entregue', 'cancelado');
create type staff_role as enum ('webmaster', 'loja');

-- ---------------------------------------------------------------------
-- EQUIPE (quem entra no painel)
-- webmaster: tudo, inclusive a aba Cadastro. loja: pedidos e produtos.
-- ---------------------------------------------------------------------
create table staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  role       staff_role not null default 'loja',
  created_at timestamptz not null default now()
);

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create or replace function is_webmaster() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'webmaster');
$$;

-- ---------------------------------------------------------------------
-- MODELOS (T-shirt MC, manches longues, débardeur, sweat...)
-- prices: preço por técnica em centavos. Técnica ausente = indisponível.
--   {"dtf": 2500, "sublimation": 1600}
-- colors: [{"name": "Sable", "hex": "#c8b28a"}, ...]
-- ---------------------------------------------------------------------
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  prices      jsonb not null default '{}'::jsonb,
  sizes       text[] not null default '{S,M,L,XL,2XL,3XL}',
  colors      jsonb not null default '[]'::jsonb,
  image_url   text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- OPÇÕES (+1€ cada: insigne, drapeau français, drapeau de nationalité...)
-- needs_detail: pede um texto (ex.: qual país, qual régiment)
-- ---------------------------------------------------------------------
create table options (
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
create table orders (
  id             uuid primary key default gen_random_uuid(),
  number         bigint generated always as identity (start with 1001),
  contact_name   text not null check (length(contact_name) between 2 and 120),
  contact_phone  text not null check (length(contact_phone) between 6 and 30),
  contact_email  text not null default '' check (length(contact_email) <= 200),
  unit           text not null default '' check (length(unit) <= 200),
  notes          text not null default '' check (length(notes) <= 2000),
  status         order_status not null default 'novo',
  total_cents    integer not null,
  pieces         integer not null default 0,
  internal_note  text not null default '',
  source         text not null default 'site',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- options: [{"code":"drapeau_nat","name":"Drapeau de nationalité","detail":"Maroc","price_cents":100}]
create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders (id) on delete cascade,
  position         integer not null,
  grade            text not null default '',
  person_name      text not null default '',
  product_id       uuid references products (id) on delete set null,
  product_name     text not null,
  technique        text not null check (technique in ('dtf', 'sublimation')),
  size             text not null,
  color            text not null,
  quantity         integer not null check (quantity between 1 and 500),
  options          jsonb not null default '[]'::jsonb,
  remarks          text not null default '',
  unit_price_cents integer not null
);

create index orders_status_idx on orders (status, created_at desc);
create index order_items_order_idx on order_items (order_id, position);

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch before update on orders
for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- CRIAR PEDIDO (site público e painel)
-- O cliente manda só as escolhas; todos os preços saem daqui.
-- p_contact: {"name":"...","phone":"...","email":"...","unit":"...","notes":"..."}
-- p_lines: [{"grade":"SGT","person_name":"DUPONT","product_id":"...",
--            "technique":"dtf","size":"L","color":"Sable","quantity":1,
--            "options":[{"code":"drapeau_fr"},{"code":"drapeau_nat","detail":"Maroc"}],
--            "remarks":""}]
-- ---------------------------------------------------------------------
create or replace function create_order(p_contact jsonb, p_lines jsonb, p_source text default 'site')
returns table (order_number bigint, total_cents integer, pieces integer)
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_number   bigint;
  v_total    integer := 0;
  v_pieces   integer := 0;
  v_line     jsonb;
  v_opt      jsonb;
  v_product  products%rowtype;
  v_option   options%rowtype;
  v_qty      integer;
  v_tech     text;
  v_base     integer;
  v_unit     integer;
  v_opts     jsonb;
  v_pos      integer := 0;
  v_source   text := case when p_source = 'painel' and is_staff() then 'painel' else 'site' end;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Commande vide';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'Trop de lignes (max. 300)';
  end if;

  insert into orders (contact_name, contact_phone, contact_email, unit, notes, total_cents, source)
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

    select * into v_product from products
    where id = (v_line ->> 'product_id')::uuid and active;
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
      select * into v_option from options where code = v_opt ->> 'code' and active;
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

    insert into order_items (order_id, position, grade, person_name, product_id, product_name,
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

  update orders set total_cents = v_total, pieces = v_pieces where id = v_order_id;

  return query select v_number, v_total, v_pieces;
end;
$$;

revoke all on function create_order(jsonb, jsonb, text) from public;
grant execute on function create_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table staff enable row level security;
alter table products enable row level security;
alter table options enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "equipe vê equipe" on staff for select to authenticated using (is_staff());
create policy "webmaster gerencia equipe" on staff for all to authenticated
  using (is_webmaster()) with check (is_webmaster());

create policy "todos veem modelos ativos" on products for select to anon, authenticated
  using (active or is_staff());
create policy "equipe gerencia modelos" on products for all to authenticated
  using (is_staff()) with check (is_staff());

create policy "todos veem opções ativas" on options for select to anon, authenticated
  using (active or is_staff());
create policy "equipe gerencia opções" on options for all to authenticated
  using (is_staff()) with check (is_staff());

-- Pedidos só entram via create_order(); leitura/edição só pela equipe.
create policy "equipe gerencia pedidos" on orders for all to authenticated
  using (is_staff()) with check (is_staff());
create policy "equipe gerencia itens" on order_items for all to authenticated
  using (is_staff()) with check (is_staff());

-- Pedido novo aparece no painel na hora
alter publication supabase_realtime add table orders;

-- ---------------------------------------------------------------------
-- STORAGE: fotos dos modelos (bucket público, upload só pela equipe)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('products', 'products', true)
on conflict (id) do nothing;

create policy "equipe envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and is_staff());
create policy "equipe edita fotos" on storage.objects for update to authenticated
  using (bucket_id = 'products' and is_staff());
create policy "equipe apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'products' and is_staff());

-- ---------------------------------------------------------------------
-- DADOS DO FLYER (editáveis depois no painel)
-- ---------------------------------------------------------------------
insert into products (name, description, prices, sizes, colors, sort, image_url) values
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

insert into options (code, name, description, price_cents, needs_detail, detail_label, sort) values
  ('drapeau_fr', 'Drapeau français', 'Sur la manche gauche.', 100, false, '', 1),
  ('drapeau_nat', 'Drapeau de nationalité', 'Sur la manche droite. Autres drapeaux sur demande.', 100, true, 'Pays', 2),
  ('insigne', 'Insigne régimentaire / petit logo', 'Sur la manche gauche.', 100, true, 'Régiment ou logo', 3);

-- ---------------------------------------------------------------------
-- PRIMEIRO ACESSO
-- 1. Authentication > Users > "Add user" com o e-mail do webmaster (com senha).
-- 2. Rodar (trocando o e-mail):
--    insert into staff (user_id, name, email, role)
--    select id, 'Webmaster', email, 'webmaster' from auth.users where email = 'SEU@EMAIL';
-- 3. A conta da Sarah é criada depois pelo painel, aba Cadastro.
-- ---------------------------------------------------------------------
