-- =====================================================================
-- Sarah Nani Creations — loja (catálogo + pedidos) e painel
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
-- PRODUTOS
-- colors: [{"name": "Branco", "hex": "#ffffff"}, ...]
-- ---------------------------------------------------------------------
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  category    text not null default 'Camisetas',
  price_cents integer not null check (price_cents >= 0),
  sizes       text[] not null default '{P,M,G,GG}',
  colors      jsonb not null default '[]'::jsonb,
  image_url   text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PEDIDOS (comandas)
-- ---------------------------------------------------------------------
create table orders (
  id             uuid primary key default gen_random_uuid(),
  number         bigint generated always as identity (start with 1001),
  customer_name  text not null check (length(customer_name) between 2 and 120),
  customer_phone text not null check (length(customer_phone) between 6 and 30),
  notes          text not null default '' check (length(notes) <= 1000),
  status         order_status not null default 'novo',
  total_cents    integer not null,
  internal_note  text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders (id) on delete cascade,
  product_id       uuid references products (id) on delete set null,
  product_name     text not null,
  size             text not null,
  color            text not null,
  quantity         integer not null check (quantity between 1 and 50),
  unit_price_cents integer not null
);

create index orders_status_idx on orders (status, created_at desc);
create index order_items_order_idx on order_items (order_id);

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
-- CRIAR PEDIDO (chamado pelo site público)
-- O cliente manda só produto/tamanho/cor/quantidade; o preço sai daqui.
-- p_items: [{"product_id": "...", "size": "M", "color": "Branco", "quantity": 2}]
-- ---------------------------------------------------------------------
create or replace function create_order(
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb
) returns table (order_number bigint, total_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_number   bigint;
  v_total    integer := 0;
  v_item     jsonb;
  v_product  products%rowtype;
  v_qty      integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Itens demais no pedido';
  end if;

  insert into orders (customer_name, customer_phone, notes, total_cents)
  values (trim(p_customer_name), trim(p_customer_phone), coalesce(trim(p_notes), ''), 0)
  returning id, number into v_order_id, v_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item ->> 'product_id')::uuid and active;
    if not found then
      raise exception 'Produto indisponível';
    end if;

    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Quantidade inválida';
    end if;
    if not (v_item ->> 'size') = any (v_product.sizes) then
      raise exception 'Tamanho inválido para %', v_product.name;
    end if;
    if jsonb_array_length(v_product.colors) > 0 and not exists (
      select 1 from jsonb_array_elements(v_product.colors) c
      where c ->> 'name' = v_item ->> 'color'
    ) then
      raise exception 'Cor inválida para %', v_product.name;
    end if;

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price_cents)
    values (v_order_id, v_product.id, v_product.name, v_item ->> 'size',
            coalesce(v_item ->> 'color', ''), v_qty, v_product.price_cents);

    v_total := v_total + v_qty * v_product.price_cents;
  end loop;

  update orders set total_cents = v_total where id = v_order_id;

  return query select v_number, v_total;
end;
$$;

revoke all on function create_order(text, text, text, jsonb) from public;
grant execute on function create_order(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table staff enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "equipe vê equipe" on staff for select to authenticated using (is_staff());
create policy "webmaster gerencia equipe" on staff for all to authenticated
  using (is_webmaster()) with check (is_webmaster());

create policy "todos veem produtos ativos" on products for select to anon, authenticated
  using (active or is_staff());
create policy "equipe gerencia produtos" on products for all to authenticated
  using (is_staff()) with check (is_staff());

-- Pedidos só entram via create_order(); leitura/edição só pela equipe.
create policy "equipe gerencia pedidos" on orders for all to authenticated
  using (is_staff()) with check (is_staff());
create policy "equipe gerencia itens" on order_items for all to authenticated
  using (is_staff()) with check (is_staff());

-- Pedido novo aparece no painel na hora
alter publication supabase_realtime add table orders;

-- ---------------------------------------------------------------------
-- STORAGE: fotos dos produtos (bucket público, upload só pela equipe)
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
-- PRIMEIRO ACESSO
-- 1. Authentication → Users → "Add user" com o e-mail do webmaster (com senha).
-- 2. Rodar (trocando o e-mail):
--    insert into staff (user_id, name, email, role)
--    select id, 'Webmaster', email, 'webmaster' from auth.users where email = 'SEU@EMAIL';
-- 3. A conta da Sarah é criada depois pelo painel, aba Cadastro.
-- ---------------------------------------------------------------------

-- Produtos de exemplo (trocar pelos reais no painel)
insert into products (name, description, price_cents, sizes, colors, sort) values
  ('Camiseta Arte Floral', 'Estampa ilustrada à mão, algodão 100%.', 2900, '{P,M,G,GG}',
   '[{"name":"Off-white","hex":"#f4efe6"},{"name":"Preto","hex":"#1d1b1a"}]', 1),
  ('Camiseta Personalizada', 'Sua ideia vira arte exclusiva. Combine os detalhes pelo WhatsApp.', 3490, '{P,M,G,GG,XG}',
   '[{"name":"Branco","hex":"#ffffff"},{"name":"Rosa","hex":"#e9b8c0"},{"name":"Preto","hex":"#1d1b1a"}]', 2),
  ('Baby Look Delicada', 'Modelagem acinturada, estampa em traço fino.', 2690, '{P,M,G}',
   '[{"name":"Branco","hex":"#ffffff"},{"name":"Lavanda","hex":"#c9b8e0"}]', 3);
