# sarah-tshirst (Sarah Nani Créations)

React 19 + Vite + Supabase + `motion`, sem Tailwind (tokens CSS em `src/index.css`).
Checks: `npm run lint`, `npm run build`.

- Tudo em francês (site e painel `/painel`): a cliente é francesa.
- Mangas: insigne e drapeau français na manga esquerda; drapeau de nationalité na direita.
- Produtos têm `kind`: `textile` (bon de commande) ou `objet` (coques, mugs, cadeaux: vitrine + devis no WhatsApp). Linha militar: MILI by NANI.
- Pedidos são bons de commande em massa: lógica pura em `src/lib/orderSheet.ts`
  (preço, colar do Excel, resumo, CSV, impressão por modelo). Preço final sempre do banco
  (`sarah.create_order`). Preços só TTC, sem mostrar TVA (pedido da Sarah); acompte 50 %.
- Fluxo: todo pedido nasce `devis` (aba Devis). 4 étapes (prix, BAT, tailles, acompte) com
  hora e autor gravados pelo gatilho `sarah.devis_steps`; a 100 % vira commande (`novo`).
  Apagar: só webmaster e só `cancelado` (policy restritiva).
- Contrato assinado (Edge Function `sarah-contrat`, lógica pura em `lib.ts`, testável em Node/Deno):
  PDF congelado (pdf-lib) + SHA-256; Sarah assina ao gerar; cliente assina em `/signer/:token`
  (código por e-mail via SMTP Hostinger, assinatura desenhada); prova em `sarah.signature_events`
  (só inclusão, encadeada, cachet Ed25519 com chave no Vault, carimbo RFC 3161 FreeTSA);
  verificação pública em `/verifier`. Assinar marca « Prix validé ». Dados da empresa em `sarah.settings`.
- Design: identidade do flyer (creme, laranja queimado, Oswald + Great Vibes),
  regras do taste-skill (1 acento, sem travessão no texto visível, reduced-motion) e
  vidro só em camadas fixas (skill `glassmorphism` em `.claude/skills`).
- Banco: projeto Supabase compartilhado de microprojetos, schema `sarah` (nunca `public`).
  Migrações em `supabase/migrations/`; regras em `docs/banco-compartilhado.md`.
  Login é compartilhado: contas criadas aqui levam `user_metadata.app = 'sarah'`.
  Acesso ao painel = linha em `sarah.staff`; inscrição gera `sarah.access_requests`
  (gatilho em `auth.users` só para `app = 'sarah'`), aprovada pelo webmaster.
  Passkey (Supabase, experimental): RP ID `i7dev.com.br`, comum a todos os microprojetos;
  a origem `https://sarahcreations.i7dev.com.br` precisa estar em Relying Party Origins.
- Deploy: Cloudflare Workers Static Assets (`wrangler.jsonc`, SPA fallback), Worker
  `sarah-tshirst`, publicado pelo Workers Builds da Cloudflare ligado ao repositório
  (branch de produção: `main`). Manual: `npm ci && npm run build && npx wrangler deploy`
  (o `dist/` precisa existir antes do deploy).
- Pasta local do Iago (Windows): `E:\Vida Pessoal\i7dev\sarah-tshirst`.
- Manter este arquivo e o `README.md` em dia a cada mudança de stack, banco ou deploy.
