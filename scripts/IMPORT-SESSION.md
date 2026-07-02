# Importar sessão do WhatsApp Web no Evolution LOCAL (sem QR)

Fluxo para conectar a **sua** instância local quando o passkey bloqueia o QR.
LOCAL DEV, sua conta/número. Não usar com sessões de terceiros.

Aplicado neste fork (`E-inov/evolution-api`, branch `without-database`) via rota
`POST /instance/importSession/:instanceName`, protegida por `ALLOW_SESSION_IMPORT`.

## Passos

1. **Habilite a flag** no `.env` do Evolution:
   ```
   ALLOW_SESSION_IMPORT=true
   ```
   (sem ela a rota responde 404). Suba o Evolution.

2. **Crie a instância** (gera o `id`/nome):
   ```bash
   curl -s -X POST http://localhost:8080/instance/create \
     -H "apikey: <SUA_APIKEY>" -H "content-type: application/json" \
     -d '{"instanceName":"minha-instancia","integration":"WHATSAPP-BAILEYS"}' | jq
   ```

3. **Extraia + importe** — pela extensão (`wa-session-tool/extension`): preencha
   `INSTANCE` e `APIKEY` no `background.js`, carregue no Chrome, abra o
   web.whatsapp.com logado e clique no ícone. Ela extrai e faz o POST direto.

   Ou manualmente com o `wa-session.json` (do `extract-console.js`):
   ```bash
   curl -s -X POST http://localhost:8080/instance/importSession/minha-instancia \
     -H "apikey: <SUA_APIKEY>" -H "content-type: application/json" \
     --data-binary @wa-session.json | jq
   ```

   A rota grava creds/keys pelo próprio `defineAuthState()` da instância (formato
   garantido conforme o provider configurado), roda sanity checks e **reconecta**
   o socket automaticamente.

   Se o dump trouxer `waVersion: [maj, min, patch]` (o extrator lê do
   `localStorage['WAVersion']`), a rota persiste essa versão **dentro do `creds`**
   e a usa como **piso** na reconexão: a versão efetiva é `max(importedWaVersion,
   fetchLatestWaWebVersion)`. Ou seja, nunca faz downgrade da sessão importada,
   mas ainda acompanha upgrades quando a mais recente estiver à frente. Como fica
   no `creds`, sobrevive a restart do processo. Se ausente/malformada, cai no
   comportamento padrão (versão mais recente).

   > O campo `importedWaVersion` é lido **só** pelo nosso código para decidir a
   > versão local antes de abrir o socket. Não vaza para o WhatsApp: o Baileys
   > monta o handshake a partir de campos nomeados do `creds` (`me`, `noiseKey`,
   > `signedIdentityKey`, `account`…) e o login node é um protobuf de schema fixo
   > que ignora chaves desconhecidas — não há `JSON.stringify(creds)` no socket.

4. **Confirme**: `GET /instance/connectionState/minha-instancia` → deve ir a `open`.

## Se não conectar

- **`me.id` sem `:<device>`** — o JID precisa ser o do device companion
  (`<phone>:<device>@s.whatsapp.net`). Confira o `id`/`_raw` no dump.
- **Candidato Noise errado** — a rota usa o `#0`. Reenvie o dump com um campo
  `"noiseIdx": 1` no JSON para tentar outro candidato.

## Ressalvas

- Sessão origem-navegador reconectada headless é o padrão que o passkey vigia:
  pode ser derrubada. Fluxo para a **sua** conta, risco assumido.
- Mantenha `ALLOW_SESSION_IMPORT` desligada por padrão — a rota aceita
  credenciais cruas; não deve existir viva em produção.
- `wa-session.json` contém a chave de identidade da sua conta — não versione.
