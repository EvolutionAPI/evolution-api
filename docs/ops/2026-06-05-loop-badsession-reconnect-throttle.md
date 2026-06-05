# 2026-06-05 — Loop de reconexão `badSession`/500 (throttle não-destrutivo)

Servidor envolvido: **whatsapp-1** (`whatsapp-evolution-01` / `whatsapp-in-1.einov.com`).

- **Instância** (Evolution / instanceName): `062aaee3-97c9-4d25-826d-06cdd1b7dd6a`.
- **instanceId**: `39d0521a-e0af-4bba-a788-12315fd622f1`.
- **Número dono** (sender nos webhooks): `554832069277`.

> ⚠️ **Correção de atribuição:** esta instância (`062aaee3`) **NÃO é** o channel 5488 / "New Way Máquinas".
> Na investigação inicial ela foi achada por busca pelo nome "New Way Máquinas", mas ali esse nome era de um **contato** dessa conta — não a conta dela. O `instanceId` (`39d0521a`) não bate com o `external_id` do 5488 (`b9c12947`). O caso real do channel 5488 está em [2026-06-05-cliente-5488-newway-reconnect-fantasma.md](2026-06-05-cliente-5488-newway-reconnect-fantasma.md). Este doc trata **apenas** do loop `badSession`/500 da instância `062aaee3` (channel desconhecido) e da correção de código que ele motivou.

> Horários abaixo em **UTC** (timezone dos servidores = `Etc/UTC`, igual ao timestamp do PM2).
> Atenção ao **off-by-one da rotação do PM2**: o arquivo `evolution-api-out__2026-06-05_00-00-00.log` contém os logs de **04/06** (foi rotacionado à 00:00 de 05/06).

## Sintoma
Instância oscilando `open`/`close` repetidamente (~1600 closes em 3h em 04/06), martelando o host — o `close` aqui era **queda transitória** com reconexão automática, não logout.

## Diagnóstico real (logs do servidor)

### 1. Não é ban, não é `device_removed`, não é conflito de sessão
Distribuição dos `statusCode` das quedas desta instância (03–05/06):

```
1619  "statusCode":500   (DisconnectReason.badSession)
  29  "statusCode":428   (connectionClosed / keep-alive)
   8  "statusCode":503   (unavailableService / stream:error)
   1  "statusCode":408   (timedOut)
```

- **Todos com `shouldReconnect:true`.** Nenhum 401 (loggedOut), 403 (forbidden) ou `device_removed`. Nenhum `Skipping reconnection`. → nunca houve logout/ban.

### 2. O número está SAUDÁVEL (oposto do 5463)
Status de envio agregado da instância (03–05/06):

```
2968  DELIVERY_ACK
1489  READ
1013  SERVER_ACK     ← o WhatsApp aceitou os envios
 101  PLAYED
   1  ERROR
```

No 5463 eram **0 SERVER_ACK** (número queimado). Aqui é o contrário: **o número envia normalmente**. Não há nada de errado com o número.

### 3. Foi um loop de reconexão `badSession` (500), concentrado em 04/06 07h–10h
Quedas por hora no dia do storm (arquivo `__2026-06-05`, dados de 04/06):

```
246  Jun 04 2026 07h
812  Jun 04 2026 08h
561  Jun 04 2026 09h
  (1-2/hora no resto do dia)
```

≈ **1619 quedas em ~3h** (pico de ~13/min). Fora dessa janela, comportamento normal (1-2 quedas/hora).

### 4. É específico desta instância — não é a infra
Closes no whatsapp-1 em 04/06, por instância:

```
1642  062aaee3...  (esta conta)   ← 59% de todos os closes do host
  65  36d56d3b...
  62  ddf6baf2...
  57  60a87ea3...
  39  f880ba41...
```

25× mais que a segunda pior. Descarta "servidor caiu", "proxy caiu pra todos", bug global.

### 5. Já se recuperou sozinho (espontaneamente)
Último `close`: **05/06 08:31:30 UTC**; reabriu às **08:31:38 → `connection: open`** e ficou estável. Verificado às 14:37 UTC: **~6h sem nenhuma queda**, com uso real no período (120 `send.message`, 384 `messages.upsert`, 913 `messages.update`; último evento 14:37:21).

⚠️ A recuperação foi **espontânea** (o socket ruim morreu / a sessão estabilizou) — **não** pela correção de código abaixo, que à época não estava deployada. A correção evita que o próximo episódio vire tempestade e o torna auto-recuperável.

## Causa raiz

A sessão Baileys entrou em estado inválido (`badSession`/500) e **o reconnect ficou martelando a mesma credencial ruim**, em vez de tratar `badSession` como um caso que exige re-pareamento. Dois fatores no código transformaram isso numa tempestade:

1. **`badSession` (500) não tinha tratamento distinto** — caía no caminho de reconnect comum (`500` não está em `codesToNotReconnect = [401,403,402,406]`), reconectando indefinidamente na sessão ruim.
2. **`reconnectAttempts = 0` era resetado a cada `connection: 'open'`** (`whatsapp.baileys.service.ts`, bloco `connection === 'open'`). Como o socket alcançava `open` por poucos segundos antes de cair de novo, o backoff exponencial **nunca crescia** → ~800 reconexões/hora.

Agravantes no `baileys-logs.log`: `stream:error code 503`, `error in sending keep alive`, `failed to decrypt message / No session record` — instabilidade de rede/proxy (dataimpulse rotativo) que provavelmente disparou a corrupção/rejeição da sessão.

## O que foi descartado
- ❌ **Ban / `device_removed` / logout (como no 5463):** zero códigos 401/403; envio com 1013 SERVER_ACK e 1 só ERROR.
- ❌ **Número queimado:** o número envia normalmente — não trocar.
- ❌ **Infra / host / proxy global:** 59% dos closes do host eram só desta instância; as outras ~contas iam bem.
- ❌ **Conflito de sessão / segunda conexão:** nenhum `connectionReplaced` (440) nos logs.

## Correção de código aplicada
`src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`:

1. **Backoff exponencial agora atua no flap (mudança principal):** removido o `reconnectAttempts = 0` do bloco `connection === 'open'`. O reset dos contadores passou a acontecer **só** quando a conexão fica estável por `RECONNECT_STABLE_RESET_MS` (30s), dentro do `scheduleReconnect()`. Assim um `open` de poucos segundos não zera mais o backoff, e o loop cai de ~800/h para ~1/60s.
2. **Throttle de `badSession` (500) — NÃO-destrutivo:** contador `consecutiveBadSessionCloses`; após `BAD_SESSION_MAX_RECONNECTS` (5) quedas 500 consecutivas, o `scheduleReconnect()` fixa o delay no teto (60s) e loga um `warn` (`badSession (500) reconnect loop — throttling...`). **Continua reconectando** — não apaga credencial, não força logout — então a instância ainda pode se recuperar sozinha.

### Por que NÃO tratar `badSession` como logout (decisão de segurança)
Uma versão inicial fazia `shouldReconnect = false` no badSession, mas isso foi **descartado** por risco a outras contas:
- **`500` é o *default* do Baileys** para um `stream:error` sem `code` (`getErrorCodeFromStreamError` em `generics.js`), **não** um sinal confiável de "sessão corrompida".
- O caminho de não-reconectar emite `logout.instance` → `monitor.service.ts::cleaningUp()`, que faz `rmSync` do diretório da instância (**apaga as credenciais**) + `session.deleteMany`.
- Logo, parar no badSession **apagaria a sessão e forçaria novo QR** de qualquer conta que caísse num loop de 500 transitório — inclusive contas que se recuperariam sozinhas (como a própria `062aaee3`, que voltou a `open` às 08:31 sem intervenção).

Por isso a correção é só **throttle** (reduz a taxa de retry), nunca teardown. O estado é **por-instância** (campos não-`static`), então não há efeito cruzado entre contas.

## Recomendações operacionais
1. **Não trocar o número** — ele está saudável (envia normal). O problema era sessão/reconexão.
2. **Deployar a correção de código** (build + `pm2 restart evolution-api`) — sem isso, um novo episódio pode virar tempestade de novo.
3. **Proxy dedicado fixo** (em vez do dataimpulse rotativo) reduz os `503`/keep-alive que disparam essas tempestades — ataca o gatilho.
4. **Monitorar contagem de closes por instância** (não só o connection state) — foi o volume de quedas que revelou o problema, mascarado pelo `open` momentâneo.

### Runbook: conta presa em loop de conexão
Para uma sessão que **não se recupera sozinha**:
- ❌ **NÃO** adianta só "ler o QR de novo": se a conta está em `CONNECTING`, o backend (`AbstractWhatsAppEvolutionIntegration::connectInstance`) cai em `restartInstance()` → `/instance/restart/{mesmo hash}` → reconecta com a **mesma credencial** (não recicla a sessão).
- ✅ **Excluir/desconectar e reconectar**: dispara `createInstance` com **hash novo** (`Str::uuid()`) → instância nova na Evolution → **sessão do zero** (novo QR), matando socket fantasma e credencial ruim.
- Motivo: só o caminho `createInstance` (status `WARNING_RECONNECT`, fallback `else`, ou quando o `restart` falha por instância já em `close`) gera hash novo. O `restart` reusa as credenciais.

## Comandos de diagnóstico úteis (read-only)
```bash
H=062aaee3-97c9-4d25-826d-06cdd1b7dd6a
cd /root/.pm2/logs

# distribuicao de statusCode das quedas
grep -ah "$H" evolution-api-out*.log | grep -a "evaluating reconnection" \
  | grep -ao '"statusCode":[0-9]*' | sort | uniq -c | sort -rn

# isolamento: top instancias com mais closes no dia
grep -ah "evaluating reconnection" evolution-api-out__<DATA>*.log \
  | grep -aoE 'instanceName":"[0-9a-f-]+' | sort | uniq -c | sort -rn | head

# saude de envio (deve ter SERVER_ACK; 0 SERVER_ACK = numero restrito)
grep -ah "$H" evolution-api-out*.log | grep -a "messages.update" \
  | grep -ao '"status":"[A-Z_]*"' | sort | uniq -c

# motivo no baileys-logs
tail -n 80 /var/www/evolution-api/logs/$H/baileys-logs.log
```

## Mapeamento de hosts (referência)
- `vm` no CRM `whatsapp-in-N.einov.com` ↔ host SSH `whatsapp-N.einov.com` ↔ hostname `whatsapp-evolution-0N`.
