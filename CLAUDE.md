# sarah-tshirst (Sarah Nani Créations)

React 19 + Vite + Supabase + `motion`, sem Tailwind (tokens CSS em `src/index.css`).
Checks: `npm run lint`, `npm run build`.

- Tudo em francês (site e painel `/painel`): a cliente é francesa.
- Mangas: insigne e drapeau français na manga esquerda; drapeau de nationalité na direita.
- Produtos têm `kind`: `textile` (bon de commande) ou `objet` (coques, mugs, cadeaux: vitrine + devis no WhatsApp). Linha militar: MILI by NANI.
- Pedidos são bons de commande em massa: lógica pura em `src/lib/orderSheet.ts`
  (preço, colar do Excel, resumo, CSV). Preço final sempre do banco (`sarah.create_order`).
- Design: identidade do flyer (creme, laranja queimado, Oswald + Great Vibes),
  regras do taste-skill (1 acento, sem travessão no texto visível, reduced-motion) e
  vidro só em camadas fixas (skill `glassmorphism` em `.claude/skills`).
- Banco: projeto Supabase compartilhado de microprojetos, schema `sarah` (nunca `public`).
  Migrações em `supabase/migrations/`; regras em `docs/banco-compartilhado.md`.
- Deploy: Cloudflare Workers Static Assets (`wrangler.jsonc`, SPA fallback), Worker
  `sarah-tshirst`, publicado pelo Workers Builds da Cloudflare ligado ao repositório.
