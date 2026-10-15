-- =====================================================================
-- SARAH: chave Ed25519 do cachet eletrônico. A Edge Function gera o par na
-- primeira vez; a chave privada fica no Supabase Vault (ninguém a vê, nem
-- no chat nem no repositório) e a pública vai para sarah.settings.
-- Só service_role executa estas funções.
-- =====================================================================

create or replace function sarah.store_signing_key(p_private text, p_public text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'sarah_signing_key') then
    raise exception 'Clé déjà créée';
  end if;
  perform vault.create_secret(p_private, 'sarah_signing_key', 'Sarah Nani Créations: Ed25519 pkcs8 base64 (cachet des contrats)');
  update sarah.settings set public_key = p_public, updated_at = now() where id;
end;
$$;

create or replace function sarah.signing_key()
returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sarah_signing_key' limit 1;
$$;

revoke all on function sarah.store_signing_key(text, text), sarah.signing_key() from public, anon, authenticated;
grant execute on function sarah.store_signing_key(text, text), sarah.signing_key() to service_role;
