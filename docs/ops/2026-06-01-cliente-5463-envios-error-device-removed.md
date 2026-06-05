# 2026-06-01 — Cliente não consegue disparar (envios em `ERROR` + `device_removed`)

Servidor envolvido no incidente: **whatsapp-3** (`whatsapp-evolution-03` / `whatsapp-in-3.einov.com`).
Conta migrada no fim para **whatsapp-1** (`whatsapp-in-1.einov.com`).

- **WhatsApp account** (CRM): `channel_id 5463`, `workspace_id 121238`.
- **Número da conta** (sender): `5516981064856@s.whatsapp.net` — "Eduardo Tosta".
- **Instância antiga** (Evolution): `a1ef76ff-4ac8-42cb-9db8-4b396c168772` (instanceId `233a50c9-...`), no whatsapp-3.
- **Instância nova** (pós-logout): `fbc6048e-2408-46a6-8b8f-784be3121f99` (instanceId `8c57a81a-...`), no whatsapp-1.

> Todos os horários abaixo em **UTC** (timezone dos servidores = `Etc/UTC`).

## Sintoma relatado
Cliente específico não conseguia disparar mensagens de WhatsApp no dia 2026-06-01. O backend registrou a conta oscilando `open`/`connecting` e terminando em `close` às 16:42:18.

Exemplo de disparo que falhou: `remoteJid 5516993141214@s.whatsapp.net`, message id `3EB0D6C0512D48BFA590ED` ("Boa tarde Wilson, tudo bem?").

## Timeline (2026-06-01, UTC)

| Hora | Evento | Fonte |
|---|---|---|
| 13:01:17 | `instance.create` da `a1ef76ff` no whatsapp-3 + proxy `dataimpulse:10381` atribuído | PM2 out / CRM `whatsapp_proxy` |
| 13:01:28 | `statusCode 515` (restart required, normal na subida) → reconecta | ChannelStartupService |
| 13:01:36 | `connection.update` → **open** | PM2 out |
| 13:04:01–35 | **Rajada de 32 mensagens em ~34s para 29 destinatários distintos** (28× "Como está sua agenda?" + 3× pitch Santander Empresas + 1× saudação), logo após conectar | PM2 out (`send.message`) |
| 13:11–14:11 | Disparos "Bom dia {Nome}, tudo bem?" a cada ~6 min | PM2 out |
| 15:15:03 | `statusCode 428` (conexão perdida / keep-alive) → reconecta | ChannelStartupService |
| 15:33:46 | `statusCode 428` de novo → reconecta | ChannelStartupService |
| ~14:39–16:42 | Disparos "Bom dia/Boa tarde {Nome}, tudo bem?" continuam, **todos em ERROR** | PM2 out |
| 16:42:10.445 | `send.message` "Boa tarde Wilson" → **PENDING** | PM2 out |
| 16:42:10.769 | `messages.update` keyId `3EB0D6C0...` → **ERROR** | PM2 out |
| 16:42:12 | `conflict / device_removed` (`statusCode 401`) → **LOGOUT**, `shouldReconnect:false` | baileys-logs / PM2 |
| 16:42:14 | Backend migra conta para whatsapp-1, nova instância `fbc6048e` + proxy `dataimpulse:10362` | CRM / PM2 (whatsapp-1) |
| 16:42:18 | Conta marcada `close` no CRM | CRM `audits` |

## Diagnóstico real

### O `connection: open` era enganoso
A conexão reportava `open` boa parte da tarde e **recebia** mensagens normalmente (181 `READ` de entrada no dia), mas **nenhum envio saía**. O `state` da conexão mascarou o problema o dia inteiro.

### 100% dos envios do dia foram rejeitados pelo WhatsApp
Contagem dos `messages.update` da instância no dia:

```
77 send.message (disparos de saída)
77 status ERROR
 0 status SERVER_ACK
```

Ciclo de vida de um disparo (exemplo 16:00, "Boa tarde Marcio"):
```
16:00:56.392  event=send.message    status=PENDING
16:00:56.753  event=messages.update status=ERROR   (~360ms depois)
```

### Por que isso prova rejeição do servidor WhatsApp (e não falha local)
Confirmado no código (`src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`):

1. `sendMessageWithTyping` chama `this.client.sendMessage()` (relay real) na linha ~2235 e **só depois** emite o webhook `send.message`/PENDING (linha ~2372). Se o relay falhasse localmente (socket morto/proxy caído), cairia no `catch` da linha ~2385 e lançaria `BadRequestException` — **nenhum PENDING seria emitido**.
2. O status `ERROR` vem de `status[update.status]` (linha ~1479), e em `src/utils/renderStatus.ts` `status[0] = 'ERROR'`. Esse `0` é o `WAMessageStatus.ERROR` **emitido pelo Baileys ao receber um ACK de erro do servidor do WhatsApp**.

Logo: `PENDING → ERROR (~360ms)` significa **a mensagem chegou ao servidor do WhatsApp (relay OK) e o WhatsApp respondeu com ACK de erro**. Não é timeout, não é socket morto, não é o proxy derrubando o envio.

### O gatilho: padrão de spam + reputação de IP
Conteúdo dos disparos (PM2 out, `send.message`):
```
13:04:01–35  RAJADA: 32 msgs em ~34s para 29 destinatários distintos:
               28× "Como está sua agenda?"  (idênticas)
                3× "Olá, tudo bem {Nome}? Meu nome é Eduardo e sou Gerente de
                    Relacionamento do Santander Empresas. Gostaria de agendar um
                    momento contigo pessoalmente para te apresentar os benefícios
                    da nossa conta PJ."     (Thiago / Lucas / Laila)
                1× "Bom dia Eduarda, tudo bem?"
13:11  "Bom dia Joao, tudo bem?"
13:23  "Bom dia Liliandre, tudo bem?"
...
16:42  "Boa tarde Wilson, tudo bem?"
```
Campanha de **cold outreach** automatizada: saudações idênticas personalizadas só com o primeiro nome + pitch comercial do Santander Empresas em sequência (os 3 que receberam o pitch longo também receberam "Como está sua agenda?" no fim da rajada). Disparos para contatos que não iniciaram conversa, **com rajada de ~32 mensagens em 34s logo após conectar**. É o padrão que o anti-spam do WhatsApp pune.

Histórico de proxy da conta (CRM `proxies`/`whatsapp_proxy`): sempre `gw.dataimpulse.com` em **rotação constante de portas/IP** (alguns proxies duraram 25s, 4min, 14min antes de serem trocados). Pool compartilhado + IP rotativo = reputação ruim, que amplifica a suspeita de spam.

## Isolamento: é a conta, não a infra (decisivo)

Status de envio agregado de **todas** as instâncias do whatsapp-3 hoje:

| Status | Qtd |
|---|---|
| SERVER_ACK (envio aceito pelo WhatsApp) | 2.314 |
| DELIVERY_ACK | 6.156 |
| READ | 4.361 |
| PLAYED | 2.234 |
| **ERROR** | **132** |

- **27 de 36 instâncias** tiveram SERVER_ACK (enviam normalmente), na **mesma infra e mesmo provedor de proxy**.
- Dos 132 erros do servidor inteiro, **77 são só dessa conta** (~58%).

→ Descarta "servidor bloqueado", "dataimpulse caiu pra todos" e "bug de código global". O problema é **específico desta conta**.

## Histórico: o problema NÃO é de hoje (decisivo)

Pelo audit do CRM (channel 5463) + logs, a conta vem **thrashing há dias**: em 29/05 trocou de hash 4× (`36834487 → 2b980366 → fcedd15c → c77228fe`), migrou whatsapp-3↔whatsapp-1 duas vezes e teve dezenas de `open/close/connecting` (515/428). Ficou `close` de 29/05 19:00 até 01/06 13:01.

Comparando envios da conta nos dias em que esteve ativa:

| Dia / hash | Servidor | send.message (saída) | SERVER_ACK | ERROR |
|---|---|---|---|---|
| 29/05 `2b980366` | whatsapp-1 | 44 | **0** | 44 |
| 29/05 `fcedd15c` | whatsapp-1 | 17 | **0** | 17 |
| 01/06 `a1ef76ff` | whatsapp-3 | 77 | **0** | 77 |

**Zero `SERVER_ACK` desde pelo menos 29/05** — o servidor do WhatsApp não aceitou **um único** envio dessa conta em dias. No mesmo whatsapp-1, em 29/05, havia **2.049 SERVER_ACK em 30 outras instâncias** (logging OK; os outros enviavam). A conta está em **restrição de envio persistente**, não num incidente pontual de hoje.

## Decisivo: é o NÚMERO, e a troca de número em 29/05

O channel 5463 **trocou o número de WhatsApp** em 29/05 13:03:34 (audit id 91500): `whatsapp_number_id` 2610 → 2601.

| `whatsapp_number_id` | phone | nome | usado por 5463 |
|---|---|---|---|
| 2610 | `5516981416669` | "Eduardo Tosta - Santander" | **antigo** (até 29/05 12:25) |
| 2601 | `5516981064856` | "Eduardo Tosta" | **novo** (desde 29/05 13:03) |

Comparando os dois números — **mesmo channel, mesma campanha, mesma infra**:

| Número (hash) | Período | send.message | **SERVER_ACK** | ERROR | Veredito |
|---|---|---|---|---|---|
| ANTIGO `5516981416669` (`5bf951d1`) | até 29/05 12:25 | 85 | **91** | **0** | enviava normal (340 DELIVERY_ACK, 303 READ, 28 PLAYED) |
| NOVO `5516981064856` (`2b980366`+`fcedd15c`+`a1ef76ff`) | 29/05 13:03 → hoje | 138 | **0** | 138 | nunca enviou |

O número **antigo** rodava a mesma campanha e enviava perfeitamente. O **novo** nunca conseguiu enviar uma única mensagem desde que foi acoplado. → O problema é **específico do número `5516981064856`** (restrição/ban de envio do WhatsApp), não da infra/channel/código. Padrão clássico de **queima de números**: número frio colocado direto em cold outreach em massa → restrito de cara.

## Causa raiz

**O número `5516981064856` está em restrição de envio persistente do WhatsApp (shadow-ban de envio):** conecta e recebe normalmente, mas **rejeita 100% das saídas com ACK de erro** desde que foi acoplado ao channel (29/05), culminando em remoção do dispositivo (`device_removed`/401). É **específico do número** — o número anterior (`5516981416669`), na mesma campanha e infra, enviava perfeitamente (91 SERVER_ACK, 0 ERROR).

Gatilho mais provável: **número frio colocado direto em cold outreach em massa** (campanha "Santander Empresas": pitch comercial + template idêntico + rajada de ~32 msgs em 34s a estranhos) → WhatsApp restringe o envio do número novo de cara. Reputação ruim de IP (proxy dataimpulse compartilhado/rotativo) é agravante. Padrão de **queima de números**.

O re-pareamento de hoje + a nova rajada apenas repetiram a mesma falha — o número já estava restrito.

## O que foi descartado

- ❌ **Bug de código / "client fantasma":** o relay teve sucesso e o WhatsApp respondeu com ACK — não é socket morto nem cleanup mal feito. Os commits `fix(client): properly clean up previous client connections...` são melhoria real, mas para **outro** problema (tempestades de reconexão / `428` connectionReplaced / vazamento de listeners), não para o `ERROR` de envio.
- ❌ **Proxy como mecanismo direto do ERROR:** o proxy explica os `428` (quedas), não a rejeição dos envios. Entra como *gatilho de reputação*, não como causa do ERROR.
- ❌ **Infra / channel / ferramenta de campanha:** o número anterior, no mesmo channel/infra/campanha, enviava com 91 SERVER_ACK e 0 ERROR. Logo o problema não é nada disso — é o número novo.

## Estado pós-incidente (verificado)
A instância nova `fbc6048e` no whatsapp-1 foi apenas **criada** (16:42:14) e nunca conectou:
- `GET /instance/connectionState` → `{ "state": "close" }`.
- `fetchInstances` → `connectionStatus: close`, `ownerJid: null`, `number: null`, `_count` zerado, `createdAt == updatedAt`.
- Sem pasta `logs/fbc6048e...`, sem `qrcode.updated`, sem `connection.update`.

Ou seja: a conta segue **desconectada, aguardando pareamento**.

## Ressalva de confiança
Confiança da conclusão: **muito alta** (~95%). Provado: isolamento (só esta conta), histórico (0 SERVER_ACK há dias) e — o mais forte — o **controle do número anterior** (mesmo channel/campanha/infra, 91 SERVER_ACK, 0 ERROR). O único ponto não capturado é o **código de erro específico** do ACK do WhatsApp (`LOG_BAILEYS=error` só registrou `device_removed`, `Bad MAC` de entrada e keep-alive) — o que diferenciaria *rate-limit temporário* de *restrição/ban mais duro*. Para capturar em incidentes futuros, subir temporariamente `LOG_BAILEYS=debug` numa instância isolada.

## Recomendações

1. **Reparear NÃO resolve — é o número.** O `5516981064856` nunca enviou (0 SERVER_ACK) desde 29/05, mesmo reconectando. Tratar como **número queimado**: **substituir/aposentar o número**. Como nasceu sem nunca enviar, não há warmup que recupere rápido; cooldown só faz sentido com o comportamento corrigido.
2. **Atacar o comportamento de envio (causa real):**
   - Reduzir drasticamente volume/cadência; **eliminar bursts**.
   - Variar conteúdo (nada de template idêntico para contatos frios).
   - Aquecer o número (warmup) antes de campanhas.
3. **Trocar o proxy rotativo/compartilhado por IP dedicado fixo** — melhora reputação e elimina os `428`. Evitar troca de proxy com a sessão aberta (dispara `device_removed`).
4. **Para envio ativo/massa, considerar a WhatsApp Business API oficial** (templates aprovados) em vez do Baileys (WhatsApp Web), frágil para esse caso de uso.
5. **Monitorar `SERVER_ACK`/status de mensagem**, não só o `connection state` — foi o `open` que mascarou o problema.

## Comandos de diagnóstico úteis (read-only)
```bash
# status de envio agregado de uma instância no dia
cd /root/.pm2/logs
grep -a "messages.update" evolution-api-out*.log | grep -a "<hash>" \
  | grep -ao '"status":"[A-Z_]*"' | sort | uniq -c

# ciclo de vida de um disparo específico
grep -a "<messageId>" evolution-api-out.log

# conteúdo/cadência dos disparos de saída
grep -a '"event":"send.message"' evolution-api-out*.log | grep -a "<hash>" \
  | grep -oE '("conversation":"[^"]*"|date_time":"[^"]*)'

# motivo de desconexão
cat /var/www/evolution-api/logs/<hash>/baileys-logs.log
grep -aE "device_removed|statusCode|LOGOUT" evolution-api-out.log | grep "<hash>"

# estado atual da instância (API local)
curl -s "http://localhost:8080/instance/connectionState/<hash>" -H "apikey: <token>"
curl -s "http://localhost:8080/instance/fetchInstances?instanceName=<hash>" -H "apikey: <token>"
```

## Mapeamento de hosts (referência)
- `vm` no CRM `whatsapp-in-N.einov.com` ↔ host SSH `whatsapp-N.einov.com` ↔ hostname `whatsapp-evolution-0N`.
