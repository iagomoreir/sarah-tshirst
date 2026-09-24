# Sarah Nani Créations

Site de T-shirts personnalisés (DTF / sublimation) com **bon de commande em massa**
e painel para organizar os pedidos. React 19 + Vite + Supabase + `motion`.

- Site: https://sarahcreations.i7dev.com.br (Hostinger, `public_html/sarahcreations`)
- `/` vitrine (francês): técnicas, preços, opções, modelos
- `/commande` bon de commande: uma linha por pessoa (grade, nome, modelo, técnica,
  tamanho, cor, quantidade, opções +1€, observações). Aceita **colar direto do Excel**
  (com ou sem cabeçalho; sem cabeçalho segue a ordem da planilha da Sarah). Rascunho
  salvo no navegador. Ao enviar, o pedido é gravado e o cliente manda o resumo no WhatsApp.
- `/painel` (login): Pedidos em quadro (Novo, Em produção, Pronto, Entregue), detalhe
  com resumo de produção por tamanho, exportação CSV (Excel) e impressão; Novo pedido
  (a Sarah lança pedidos recebidos em papel); Modelos e opções; Cadastro (só webmaster).

Os preços são sempre recalculados no banco (`create_order` em `schema.sql`); o que o
navegador mostra é só prévia.

## Configurar

1. Criar projeto no Supabase e rodar `schema.sql` no SQL Editor (já cria os modelos e
   opções do flyer).
2. `supabase functions deploy create-user` (aba Cadastro).
3. Criar o usuário webmaster em Authentication > Users e rodar o `insert into staff`
   do fim do `schema.sql`. A conta da Sarah é criada pelo painel.
4. Secrets do repositório (GitHub > Settings > Secrets):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_NUMBER`,
   `FTP_HOST`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_REMOTE_DIR`.
5. Hostinger: criar o subdomínio `sarahcreations.i7dev.com.br` apontando para
   `public_html/sarahcreations`. O `.htaccess` em `public/` cuida das rotas.

## Rodar local

```bash
cp .env.example .env.local   # preencher Supabase
npm install
npm run dev
```

Checks: `npm run lint`, `npm run build`.
