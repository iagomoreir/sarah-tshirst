-- =====================================================================
-- SARAH: contrato do devis assinado (Sarah + cliente) e verificável.
-- Tudo que é escrito aqui passa pela Edge Function sarah-contrat (service
-- role); a equipe só lê. signature_events é só de inclusão: cada evento
-- guarda o hash do anterior, o hash próprio, a assinatura Ed25519 do
-- servidor e o carimbo de tempo RFC 3161 de uma autoridade externa.
-- =====================================================================

-- Dados da empresa que entram nos documentos (linha única)
create table sarah.settings (
  id            boolean primary key default true check (id),
  company_name  text not null,
  address       text not null,
  phone         text not null,
  email         text not null default '',
  siret         text not null,
  vat_number    text not null default '',
  acompte_pct   integer not null default 50 check (acompte_pct between 0 and 100),
  conditions    text not null,
  public_key    text not null default '',
  updated_at    timestamptz not null default now()
);

insert into sarah.settings (company_name, address, phone, siret, acompte_pct, conditions) values (
  'Sarah Nani Créations',
  '4, av. du 8 Mai 1945, 11400 Castelnaudary',
  '06 95 57 16 40',
  '890 745 615 00033',
  50,
  E'Prix indiqués TTC.\n'
  'Un acompte de 50 % est demandé à la validation du devis ; le solde est réglé à la livraison.\n'
  'La fabrication commence après la validation de la maquette (BAT), de la liste des tailles et la réception de l''acompte. Les délais sont donnés à titre indicatif.\n'
  'Les articles étant personnalisés (noms, grades, insignes), ils ne peuvent être ni repris ni échangés et ne bénéficient pas du droit de rétractation (art. L221-28 du Code de la consommation), sauf défaut de fabrication.\n'
  'Le client garantit disposer des droits sur les logos et visuels fournis.'
) on conflict (id) do nothing;

-- Documento congelado: snapshot + PDF original e PDF final assinado
create table sarah.documents (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references sarah.orders (id) on delete restrict,
  kind              text not null default 'contrat' check (kind in ('contrat', 'facture')),
  version           integer not null default 1,
  status            text not null default 'attente_client' check (status in ('attente_client', 'signe', 'remplace')),
  snapshot          jsonb not null,
  sha256            text not null unique,
  pdf_path          text not null,
  final_sha256      text unique,
  final_pdf_path    text,
  client_token_hash text unique,
  token_expires_at  timestamptz,
  created_by        text not null,
  created_at        timestamptz not null default now(),
  signed_at         timestamptz
);
create index documents_order on sarah.documents (order_id);

-- Prova: só inclusão, encadeada
create table sarah.signature_events (
  id              bigint generated always as identity primary key,
  document_id     uuid not null references sarah.documents (id) on delete restrict,
  role            text not null check (role in ('sarah', 'client')),
  signer          jsonb not null,          -- nom, grade, unite, email (cliente) ou nom (Sarah)
  doc_sha256      text not null,
  consent_text    text not null,
  signature_png_sha256 text,
  ip              text not null default '',
  user_agent      text not null default '',
  otp_verified_at timestamptz,
  created_at      timestamptz not null,
  prev_hash       text not null,
  event_hash      text not null unique,
  server_sig      text not null,           -- Ed25519 (base64) sobre event_hash
  tsa_token       text                     -- resposta RFC 3161 (base64), verificável com openssl ts
);

create or replace function sarah.signature_events_readonly() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'signature_events est en ajout seul';
end;
$$;

create trigger signature_events_no_update before update or delete on sarah.signature_events
for each row execute function sarah.signature_events_readonly();

-- Código de 6 dígitos enviado ao e-mail do cliente (guardamos só o hash)
create table sarah.otp_codes (
  document_id  uuid primary key references sarah.documents (id) on delete cascade,
  email        text not null,
  code_hash    text not null,
  attempts     integer not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- Étape marcada pela função (assinatura do cliente), com o nome dele como autor
create or replace function sarah.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.name from sarah.staff s where s.user_id = (select auth.uid())),
    (select nullif(a.name, '') from core.admins a where a.user_id = (select auth.uid())),
    nullif(current_setting('sarah.actor', true), ''),
    'Système'
  );
$$;

create or replace function sarah.mark_prix_signed(p_order uuid, p_by text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('sarah.actor', left(p_by, 160), true);
  update sarah.orders set prix_ok_at = now() where id = p_order and prix_ok_at is null;
end;
$$;

-- Permissões: leitura para a equipe; escrita só service_role (Edge Function)
grant select on sarah.settings, sarah.documents, sarah.signature_events to authenticated;
grant update on sarah.settings to authenticated;
grant all on sarah.settings, sarah.documents, sarah.signature_events, sarah.otp_codes to service_role;
grant usage, select on all sequences in schema sarah to service_role;

revoke all on function sarah.mark_prix_signed(uuid, text), sarah.signature_events_readonly() from public, anon, authenticated;
grant execute on function sarah.mark_prix_signed(uuid, text) to service_role;

alter table sarah.settings enable row level security;
alter table sarah.documents enable row level security;
alter table sarah.signature_events enable row level security;
alter table sarah.otp_codes enable row level security;

create policy "equipe vê empresa" on sarah.settings for select to authenticated using ((select sarah.is_staff()));
create policy "webmaster edita empresa" on sarah.settings for update to authenticated
  using ((select sarah.is_webmaster())) with check ((select sarah.is_webmaster()));
create policy "equipe vê documentos" on sarah.documents for select to authenticated using ((select sarah.is_staff()));
create policy "equipe vê provas" on sarah.signature_events for select to authenticated using ((select sarah.is_staff()));

-- PDFs num bucket privado: só a função grava; a equipe lê por URL assinada
insert into storage.buckets (id, name, public) values ('sarah-documents', 'sarah-documents', false)
on conflict (id) do nothing;

create policy "sarah: equipe lê documentos" on storage.objects for select to authenticated
  using (bucket_id = 'sarah-documents' and (select sarah.is_staff()));
