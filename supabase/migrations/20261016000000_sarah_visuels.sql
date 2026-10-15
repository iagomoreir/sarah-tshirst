-- =====================================================================
-- SARAH: visuels (artes) do cliente.
-- O cliente envia os arquivos junto com o bon de commande (site principal).
-- O navegador gera uma miniatura leve (webp) que fica para sempre; o
-- original é apagado 30 dias depois de « Livrée » (ou « Annulée »),
-- salvo se a Sarah o guardar na bibliothèque (logos e insignes recorrentes).
-- Storage não deixa apagar por SQL: a limpeza roda no painel (equipe),
-- pela API do Storage, ao abrir o painel.
-- =====================================================================

alter table sarah.orders
  add column if not exists upload_key uuid,
  add column if not exists upload_until timestamptz;

create index if not exists orders_upload_key_idx on sarah.orders (upload_key) where upload_key is not null;

create table sarah.order_files (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references sarah.orders (id) on delete cascade,
  placement     text not null default 'autre'
                check (placement in ('devant', 'dos', 'manche_gauche', 'manche_droite', 'autre')),
  file_name     text not null check (length(file_name) between 1 and 200),
  path          text,          -- original; null depois de apagado
  thumb_path    text,          -- miniatura (fica para sempre)
  mime          text not null default '',
  size_bytes    bigint not null default 0,
  width         integer,
  height        integer,
  quality       text not null default 'inconnue'
                check (quality in ('vectoriel', 'excellente', 'correcte', 'faible', 'inconnue')),
  uploaded_by   text not null default 'client',
  created_at    timestamptz not null default now(),
  purge_after   timestamptz,   -- original apagado depois desta data
  purged_at     timestamptz,
  keep          boolean not null default false,  -- bibliothèque: nunca apagar
  library_label text not null default '' check (length(library_label) <= 120)
);

create index order_files_order_idx on sarah.order_files (order_id, created_at);
create index order_files_purge_idx on sarah.order_files (purge_after) where purged_at is null and purge_after is not null;
create index order_files_library_idx on sarah.order_files (library_label) where keep;

alter table sarah.order_files enable row level security;
create policy "equipe gerencia visuels" on sarah.order_files for all to authenticated
  using ((select sarah.is_staff())) with check ((select sarah.is_staff()));
grant select, insert, update, delete on sarah.order_files to authenticated;
grant all on sarah.order_files to service_role;

-- ---------------------------------------------------------------------
-- Prazo de exclusão do original
-- ---------------------------------------------------------------------

-- Pedido « Livrée » ou « Annulée »: original apagado em 30 dias. Voltou atrás: cancela o prazo.
create or replace function sarah.visuels_schedule_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('entregue', 'cancelado') then
      update sarah.order_files set purge_after = now() + interval '30 days'
      where order_id = new.id and not keep and purged_at is null and path is not null;
    elsif old.status in ('entregue', 'cancelado') then
      update sarah.order_files set purge_after = null
      where order_id = new.id and purged_at is null;
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_visuels_purge after update of status on sarah.orders
for each row execute function sarah.visuels_schedule_purge();

-- Bibliothèque: guardar cancela o prazo; tirar da bibliothèque de um pedido já entregue reabre os 30 dias
create or replace function sarah.visuels_keep() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_closed boolean;
begin
  if new.keep then
    new.purge_after := null;
  elsif new.purged_at is null and new.path is not null
        and (tg_op = 'INSERT' or old.keep or new.purge_after is null) then
    select status in ('entregue', 'cancelado') into v_closed from sarah.orders where id = new.order_id;
    new.purge_after := case when v_closed then coalesce(new.purge_after, now() + interval '30 days') end;
  end if;
  return new;
end;
$$;

create trigger order_files_keep before insert or update of keep on sarah.order_files
for each row execute function sarah.visuels_keep();

-- ---------------------------------------------------------------------
-- STORAGE: bucket privado. Caminhos:
--   devis/<upload_key>/<id>.<ext>   enviado pelo cliente (site)
--   pedido/<order_id>/<id>.<ext>    enviado pela equipe (painel)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sarah-visuels', 'sarah-visuels', false, 52428800, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/postscript'
])
on conflict (id) do nothing;

-- Envio aberto só durante 2 horas depois do pedido, no máximo 40 objetos (20 arquivos + miniaturas)
create or replace function sarah.visuel_upload_open(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[1] = 'devis'
     and exists (
       select 1 from sarah.orders o
       where o.upload_key::text = (storage.foldername(p_name))[2]
         and o.upload_until > now()
     )
     and (
       select count(*) from storage.objects
       where bucket_id = 'sarah-visuels' and name like 'devis/' || (storage.foldername(p_name))[2] || '/%'
     ) < 40;
$$;

create policy "sarah: cliente envia visuels" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'sarah-visuels' and sarah.visuel_upload_open(name));
create policy "sarah: equipe vê visuels" on storage.objects for select to authenticated
  using (bucket_id = 'sarah-visuels' and (select sarah.is_staff()));
create policy "sarah: equipe envia visuels" on storage.objects for insert to authenticated
  with check (bucket_id = 'sarah-visuels' and (select sarah.is_staff()));
create policy "sarah: equipe apaga visuels" on storage.objects for delete to authenticated
  using (bucket_id = 'sarah-visuels' and (select sarah.is_staff()));

-- Registra um arquivo enviado pelo cliente (tamanho e tipo vêm do Storage, não do navegador)
create or replace function sarah.add_visuel(p_upload_key uuid, p_file jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order  uuid;
  v_prefix text := 'devis/' || p_upload_key::text || '/';
  v_path   text := p_file ->> 'path';
  v_thumb  text := nullif(p_file ->> 'thumb_path', '');
  v_meta   jsonb;
  v_id     uuid;
begin
  select id into v_order from sarah.orders where upload_key = p_upload_key and upload_until > now();
  if v_order is null then
    raise exception 'Envoi des fichiers fermé pour cette commande';
  end if;
  if v_path is null or left(v_path, length(v_prefix)) <> v_prefix or position('/' in substr(v_path, length(v_prefix) + 1)) > 0 then
    raise exception 'Fichier invalide';
  end if;
  select metadata into v_meta from storage.objects where bucket_id = 'sarah-visuels' and name = v_path;
  if not found then
    raise exception 'Fichier introuvable';
  end if;
  if v_thumb is not null and (left(v_thumb, length(v_prefix)) <> v_prefix
     or not exists (select 1 from storage.objects where bucket_id = 'sarah-visuels' and name = v_thumb)) then
    v_thumb := null;
  end if;
  if exists (select 1 from sarah.order_files where path = v_path) then
    raise exception 'Fichier déjà enregistré';
  end if;
  if (select count(*) from sarah.order_files where order_id = v_order) >= 20 then
    raise exception 'Maximum 20 fichiers par commande';
  end if;

  insert into sarah.order_files (order_id, placement, file_name, path, thumb_path, mime, size_bytes, width, height, quality, uploaded_by)
  values (
    v_order,
    case when p_file ->> 'placement' in ('devant', 'dos', 'manche_gauche', 'manche_droite') then p_file ->> 'placement' else 'autre' end,
    left(coalesce(nullif(trim(p_file ->> 'file_name'), ''), 'visuel'), 200),
    v_path,
    v_thumb,
    coalesce(v_meta ->> 'mimetype', ''),
    coalesce((v_meta ->> 'size')::bigint, 0),
    case when (p_file ->> 'width') ~ '^\d{1,6}$' then (p_file ->> 'width')::integer end,
    case when (p_file ->> 'height') ~ '^\d{1,6}$' then (p_file ->> 'height')::integer end,
    case when p_file ->> 'quality' in ('vectoriel', 'excellente', 'correcte', 'faible') then p_file ->> 'quality' else 'inconnue' end,
    'client'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function sarah.visuels_schedule_purge(), sarah.visuels_keep() from public, anon, authenticated;
revoke all on function sarah.visuel_upload_open(text), sarah.add_visuel(uuid, jsonb) from public;
grant execute on function sarah.visuel_upload_open(text) to anon, authenticated;
grant execute on function sarah.add_visuel(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order: mesma função, agora guardando a chave de envio dos visuels
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
  -- Chave aleatória criada no navegador: abre o envio dos visuels por 2 horas
  v_upload_key uuid := case when (p_contact ->> 'upload_key') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                            then (p_contact ->> 'upload_key')::uuid end;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Commande vide';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'Trop de lignes (max. 300)';
  end if;

  insert into sarah.orders (contact_name, contact_phone, contact_email, unit, notes, total_cents, source, upload_key, upload_until)
  values (
    trim(p_contact ->> 'name'),
    trim(p_contact ->> 'phone'),
    coalesce(trim(p_contact ->> 'email'), ''),
    coalesce(trim(p_contact ->> 'unit'), ''),
    coalesce(trim(p_contact ->> 'notes'), ''),
    0,
    v_source,
    v_upload_key,
    case when v_upload_key is not null then now() + interval '2 hours' end
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
