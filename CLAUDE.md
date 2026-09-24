# sarah-tshirst (Sarah Nani Créations)

React 19 + Vite + Supabase + `motion`, sem Tailwind (tokens CSS em `src/index.css`).
Checks: `npm run lint`, `npm run build`.

- Tudo em francês (site e painel `/painel`): a cliente é francesa.
- Mangas: insigne e drapeau français na manga esquerda; drapeau de nationalité na direita.
- Pedidos são bons de commande em massa: lógica pura em `src/lib/orderSheet.ts`
  (preço, colar do Excel, resumo, CSV). Preço final sempre do banco (`create_order`).
- Design: identidade do flyer (creme, laranja queimado, Oswald + Great Vibes),
  regras do taste-skill (1 acento, sem travessão no texto visível, reduced-motion) e
  vidro só em camadas fixas (skill `glassmorphism` em `.claude/skills`).
- Deploy: `.github/workflows/deploy.yml` (FTP Hostinger, `public_html/sarahcreations`).
