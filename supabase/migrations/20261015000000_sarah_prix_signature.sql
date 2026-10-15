-- =====================================================================
-- SARAH: a étape « Prix validé » só é marcada pela assinatura do cliente
-- (sarah.mark_prix_signed, chamada pela Edge Function sarah-contrat).
-- A equipe não marca nem desmarca à mão.
-- =====================================================================

create or replace function sarah.devis_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := sarah.actor_name();
begin
  -- « Prix validé » vem só da assinatura do contrato (Edge Function, sem usuário logado)
  if new.prix_ok_at is distinct from old.prix_ok_at and (select auth.uid()) is not null then
    raise exception 'Le prix est validé uniquement par la signature du contrat';
  end if;

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
