# Sarah Nani Creations — loja

Catálogo de camisetas + carrinho que envia o pedido pelo WhatsApp + painel (`/painel`)
para organizar as comandas. React 19 + Vite + Supabase + `motion` (animações).

- Site: https://sarahcreations.i7dev.com.br
- Servidor: Hostinger, `public_html/sarahcreations` (mesma conta do i7dev-portfolio —
  a pasta precisa estar no `exclude:` do deploy do portfólio).
- WhatsApp da loja: +33 6 95 67 16 40 (`VITE_WHATSAPP_NUMBER=33695671640`).
- Referência de marca/arte: https://www.instagram.com/sarahnanicreations

## Status (WIP)

Feito: `schema.sql` (produtos, pedidos, equipe webmaster/loja, RLS, `create_order`
com preço calculado no banco, bucket de fotos), `supabase/functions/create-user`
(aba Cadastro, só webmaster), `src/lib/*`, carrinho, auth, `components/motion.tsx`,
`pages/StorePage.tsx`.

Falta: `ProductDialog`, `CartDrawer` (checkout → `create_order` → wa.me),
`App.tsx`/`main.tsx` (rotas + `MotionConfig reducedMotion="user"`), `index.css`
(identidade tirada do Instagram — nada provisório), painel (Pedidos em kanban com
realtime, Produtos com upload de foto, Cadastro), workflow de deploy FTP.

## Rodar

```bash
cp .env.example .env.local   # preencher Supabase
npm install
npm run dev
```
