-- =====================================================================
-- SARAH: étape 'devis' antes de 'novo'. Fica numa migração separada porque
-- um valor novo de enum só pode ser usado depois de confirmado (commit).
-- =====================================================================

alter type sarah.order_status add value if not exists 'devis' before 'novo';
