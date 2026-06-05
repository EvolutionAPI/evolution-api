# 2026-06-05 — Cliente 5488 (New Way Máquinas) não reconecta: sessão morta + "reconectar" reusa estado fantasma

Servidor: **whatsapp-3** (`whatsapp-evolution-03` / `whatsapp-in-3.einov.com`).

- **WhatsApp account** (CRM): `channel_id 5488` — "New Way Máquinas".
- **Telefone**: `554185129080` (`whatsapp_number_id 2622`).
- **hash** (instanceName): `36558daf-e1fd-4ef5-b7be-7efd06fff2e7`.
- **external_id** (instanceId): `b9c12947-fa43-4507-9e72-7b5084a618cc`.
- **status no CRM**: `close`.

> Não confundir com [2026-06-05-loop-badsession-reconnect-throttle.md](2026-06-05-loop-badsession-reconnect-throttle.md): aquele é a instância `062aaee3` (channel desconhecido), que só *conversava* com a New Way. Identificação do 5488 confirmada pelo `external_id`/`hash` do registro do CRM e pelo telefone `554185129080`.
> Horários em **UTC**.

## Sintoma relatado
"Conecta o WhatsApp e desconecta da plataforma logo em seguida, desde quarta (03/06). Já tentou ler o QR várias vezes e nunca funciona."

## Diagnóstico (logs do servidor + comportamento ao vivo)

### 1. A sessão morreu em 28/05 por instabilidade de rede/proxy — NÃO é ban
`baileys-logs.log` da instância `36558daf` (whatsapp-3): última escrita **28/05 16:07**, e o conteúdo é só:
```
stream:error code 503  (unavailableService)
stream:error code 515  (restartRequired)
error in sending keep alive
```
**Nenhum 401, nenhum `device_removed`, nenhum 500/badSession.** → instabilidade de rede/proxy derrubou o socket. Bate com o audit do CRM: channel 5488 foi a `close` em **28/05 16:15**.

### 2. Morta desde então — zero presença na Evolution em junho
- O hash `36558daf` tem **zero ocorrências** nos logs do app (30/05 em diante), em whatsapp-1 e whatsapp-3.
- O telefone `554185129080` **nunca aparece como dono** (`sender`/`ownerJid`/`wuid`) em nenhum log disponível.
- Busca pelo ID fixo da foto do avatar (`1455811272892407`) em 03/06: nada.
→ Os `open/close` de 03/06 no audit do CRM **não correspondem a nenhuma sessão real** no servidor (tentativas de reconectar que não subiram sessão).

### 3. O "reconectar" reusa a sessão morta (estado fantasma) — não recria
Reconexão pelo frontend em **05/06 18:22:42** retornou:
```json
{ "message": "Conta de WhatsApp reinicializada com sucesso",
  "status": "open", "hash": "36558daf…", "external_id": "b9c12947…" }
```
- `hash` e `external_id` **inalterados** → foi **restart/reuso**, não `createInstance` (que geraria UUID novo + proxy novo). **Nenhum proxy novo.**
- O `status: open` é **fantasma**: o whatsapp-3 não teve nenhuma atividade do hash às 18:22 (baileys-logs ainda em 28/05, nada no log live). O socket não subiu de verdade → caiu logo em seguida via broadcasting.

## Causa raiz (por que "ler QR" nunca funciona pra essa conta)
No backend (`cnpj.biz.back`, `AbstractWhatsAppEvolutionIntegration::connectInstance`), para uma conta `close`:
1. Chama `connectionState()` → a Evolution devolve um `'open'` **obsoleto** (estado em memória que não reflete o socket morto).
2. O `connectInstance` **confiava** nesse `'open'` e **retornava cedo** (marcava open, sem reconectar de verdade) → fantasma → cai logo.
3. Pior: o `connectionState(): string` tinha um **landmine de TypeError** — se a chamada falhasse de um jeito que a mensagem não contivesse "instance does not exist", caía no fim em `return $connection['instance']['state']` com `$connection` indefinido → TypeError → `connectInstance` abortava **antes** de recriar (o controller devolvia 500 "connect failed"). Por isso o hash/proxy nunca trocavam e o cliente via "tentou e não funcionou".

Não é número queimado: o número envia/conecta normalmente quando a sessão é válida; o problema é (a) a sessão morta por rede/proxy e (b) o fluxo de reconexão reusar estado fantasma em vez de recriar.

## Correção de código aplicada (`cnpj.biz.back`)
`app/Abstracts/WhatsApp/AbstractWhatsAppEvolutionIntegration.php`:
1. **`connectionState()` blindado:** nunca mais dá TypeError. Qualquer falha/estado não reconhecido → retorna `CHANNEL_NOT_EXIST` (em vez de abortar), garantindo que o `connectInstance` siga para o `createInstance` (recria com hash/proxy/QR novos).
2. **`connectInstance` não confia mais no `open` fantasma:** quando a Evolution reporta `open` mas o nosso lado estava derrubado (contradição), em vez de aceitar o estado obsoleto ele **força uma reconexão real** via `restartInstance()`; se o restart falhar, cai para a recriação. Afeta só o caso de dessincronia (conta saudável já `open` não entra nessa condição).

## Proxy (decisão)
Proxy dedicado fixo por cliente **não** será adotado (custo alto). Verificado: o CRM **não** rotaciona proxy com a sessão aberta (o `ProxyService::newProxy` só roda no `createInstance`); a "rotação constante" é do **provedor** (gateway dataimpulse gira o IP de saída atrás de uma porta fixa). Logo, quedas ocasionais por rede vão continuar — o foco passa a ser **recuperação automática** (correção acima), não evitar 100% das quedas.

## Ação operacional imediata
Para destravar a conta agora: **excluir/remover a conexão e criar uma nova** (não só "reconectar"):
- Excluir → remove o objeto da memória da Evolution + sessão velha.
- Criar → `connectInstance` cai em `createInstance` → **hash novo + proxy novo + QR novo**.
- Validar que `hash`/`external_id` **mudaram** (deixaram de ser `36558daf`/`b9c12947`) e que a conta fica `open` e **permanece**.

## Comandos de diagnóstico (read-only)
```bash
H=36558daf-e1fd-4ef5-b7be-7efd06fff2e7
# motivo da morte (so 503/515/keepalive = rede/proxy; 401/500 = outra coisa)
cat /var/www/evolution-api/logs/$H/baileys-logs.log
# presenca recente do hash / do numero como dono
grep -ac "$H" /root/.pm2/logs/evolution-api-out*.log
grep -a '"sender":"554185129080@s.whatsapp.net"' /root/.pm2/logs/evolution-api-out*.log | tail
```
