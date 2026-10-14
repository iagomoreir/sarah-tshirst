-- =====================================================================
-- SARAH: devis com 4 étapes. Todo pedido (site ou painel) nasce como
-- 'devis'; quando as 4 étapes estão validadas, vira commande ('novo').
-- Data e autor de cada étape são gravados pelo banco, não pelo navegador.
-- =====================================================================

alter table sarah.orders alter column status set default 'devis';

alter table sarah.orders
  add column prix_ok_at     timestamptz,
  add column prix_ok_by     text,
  add column bat_ok_at      timestamptz,
  add column bat_ok_by      text,
  add column tailles_ok_at  timestamptz,
  add column tailles_ok_by  text,
  add column acompte_ok_at  timestamptz,
  add column acompte_ok_by  text,
  add column converted_at   timestamptz;

-- Nome de quem está agindo no painel (equipe ou webmaster global)
create or replace function sarah.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.name from sarah.staff s where s.user_id = (select auth.uid())),
    (select nullif(a.name, '') from core.admins a where a.user_id = (select auth.uid())),
    'Système'
  );
$$;

create or replace function sarah.devis_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := sarah.actor_name();
begin
  -- Cada étape: hora do servidor e autor; desmarcar apaga os dois
  if new.prix_ok_at is distinct from old.prix_ok_at then
    new.prix_ok_at := case when new.prix_ok_at is null then null else now() end;
    new.prix_ok_by := case when new.prix_ok_at is null then null else v_actor end;
  end if;
  if new.bat_ok_at is distinct from old.bat_ok_at then
    new.bat_ok_at := case when new.bat_ok_at is null then null else now() end;
    new.bat_ok_by := case when new.bat_ok_at is null then null else v_actor end;
  end if;
  if new.tailles_ok_at is distinct from old.tailles_ok_at then
    new.tailles_ok_at := case when new.tailles_ok_at is null then null else now() end;
    new.tailles_ok_by := case when new.tailles_ok_at is null then null else v_actor end;
  end if;
  if new.acompte_ok_at is distinct from old.acompte_ok_at then
    new.acompte_ok_at := case when new.acompte_ok_at is null then null else now() end;
    new.acompte_ok_by := case when new.acompte_ok_at is null then null else v_actor end;
  end if;

  -- 100 %: o devis vira commande
  if new.status = 'devis'
     and new.prix_ok_at is not null and new.bat_ok_at is not null
     and new.tailles_ok_at is not null and new.acompte_ok_at is not null then
    new.status := 'novo';
    new.converted_at := now();
  end if;
  return new;
end;
$$;

create trigger orders_devis_steps before update on sarah.orders
for each row execute function sarah.devis_steps();

revoke all on function sarah.actor_name(), sarah.devis_steps() from public, anon, authenticated;

-- Apagar: só webmaster e só pedido annulé. A policy "equipe gerencia pedidos"
-- (for all) continua; esta é restritiva, então as duas precisam passar no delete.
create policy "apagar só annulé e só webmaster" on sarah.orders as restrictive for delete to authenticated
  using (status = 'cancelado' and (select sarah.is_webmaster()));
