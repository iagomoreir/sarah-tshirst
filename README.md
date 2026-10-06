# Sarah Nani Créations

Site de T-shirts personnalisés (DTF / sublimation) com **bon de commande em massa**
e painel para organizar os pedidos. React 19 + Vite + Supabase + `motion`.

- Site: https://sarahcreations.i7dev.com.br (Cloudflare Workers, `wrangler.jsonc`;
  deploy pelo Workers Builds da Cloudflare, ligado a este repositório)
- `/` vitrine (francês): técnicas, preços, opções, modelos
- `/commande` bon de commande: uma linha por pessoa (grade, nome, modelo, técnica,
  tamanho, cor, quantidade, opções +1€, observações). Aceita **colar direto do Excel**
  (com ou sem cabeçalho; sem cabeçalho segue a ordem da planilha da Sarah). Rascunho
  salvo no navegador. Ao enviar, o pedido é gravado e o cliente manda o resumo no WhatsApp.
- `/painel` (login): Pedidos em quadro (Novo, Em produção, Pronto, Entregue), detalhe
  com resumo de produção por tamanho, exportação CSV (Excel) e impressão; Novo pedido
  (a Sarah lança pedidos recebidos em papel); Modelos e opções; Cadastro (só webmaster).

Os preços são sempre recalculados no banco (`sarah.create_order` em `supabase/migrations/`); o que o
navegador mostra é só prévia.

## Configurar

O banco é o **projeto Supabase compartilhado de microprojetos**; tudo da Sarah
fica no schema `sarah` (regras em `docs/banco-compartilhado.md`).

1. Aplicar as migrações de `supabase/migrations/` em ordem (`..._core.sql`,
   depois `..._sarah.sql`). Já criam os produtos, opções e o bucket de fotos.
2. Expor o schema: Project Settings > Data API > Exposed schemas > adicionar `sarah`.
3. `supabase functions deploy sarah-create-user` (aba Utilisateurs).
4. Webmaster: criar o usuário em Authentication > Users e registrá-lo em
   `core.admins` (vale para todos os microprojetos). A conta da Sarah é criada
   pelo painel.
5. Deploy: Workers Builds (Cloudflare > Workers & Pages > `sarah-tshirst` > Settings >
   Builds) ligado a este repositório; build `npm run build`, deploy `npx wrangler deploy`.
   Nenhum secret no GitHub. O `ci.yml` só roda lint + build nos PRs.
6. DNS: não pode existir registro para `sarahcreations` na zona `i7dev.com.br`; o
   deploy cria o domínio e o certificado (`custom_domain` no `wrangler.jsonc`).

## Rodar local

```bash
cp .env.example .env.local   # preencher Supabase
npm install
npm run dev
```

Checks: `npm run lint`, `npm run build`.
