# 2026-05-20 — Disco cheio nos servidores `whatsapp-*.einov.com`

Aplicado em: **whatsapp-2**, **whatsapp-1**, **whatsapp-3** e **whatsapp-4** (mesmo dia, mesmo procedimento base com variações por servidor).

## Sintoma
- `/dev/vda1`: 39G / 49G (81% de uso), com crescimento sustentado.
- Suspeita inicial: logs do PM2 (`/root/.pm2/logs/`).

## Diagnóstico real
- `/root/.pm2/logs/` tinha apenas **50M** — não era o problema.
- O culpado: **`/var/www/evolution-api/logs/` com 13G**, contendo 1.060 subdiretórios (um por instância — UUID), cada um com um `baileys-logs.log`.
- Maiores ofensores: 585M, 455M, 367M, 305M, 259M...
- Secundário: `/var/log/journal` com 1.4G (journald sem limite).

## Causa raiz
Configuração extremamente verbosa no `.env` da Evolution API:

```env
LOG_LEVEL=ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,WEBHOOKS,WEBSOCKET
LOG_BAILEYS=debug
```

O `LOG_BAILEYS=debug` faz o Baileys logar cada evento de socket / presença / recibo, multiplicado por ~1.060 instâncias → 13G.

`LOG_LEVEL` também tinha `DEBUG` e `VERBOSE` ligados desnecessariamente.

## Notas sobre `LOG_LEVEL` da Evolution
Não são todos níveis de severidade — alguns são **canais/categorias**:
- `ERROR`, `WARN`, `INFO`, `LOG`, `DEBUG`, `VERBOSE`: níveis de severidade.
- `DARK`: canal interno do core da Evolution (baixo volume).
- `WEBHOOKS`: log de envio/recebimento de webhooks (útil para depurar integração).
- `WEBSOCKET`: log de eventos do canal WS.

Os três últimos são baixo volume e podem ficar ligados sem impacto.

## Solução aplicada

### 1. Ajuste do `.env` (em `/var/www/evolution-api/.env`)
```diff
- LOG_LEVEL=ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,WEBHOOKS,WEBSOCKET
+ LOG_LEVEL=ERROR,WARN,INFO,LOG,DARK,WEBHOOKS,WEBSOCKET
- LOG_BAILEYS=debug
+ LOG_BAILEYS=error
```

Valores válidos de `LOG_BAILEYS` (mais verboso → mais silencioso):
`trace` < `debug` < `info` < `warn` < `error` < `fatal` < `silent`.

Aplicar com:
```bash
pm2 restart evolution-api --update-env
```

### 2. PM2 logrotate (preventivo — instalado mesmo não sendo o problema principal)
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```
> Importante: pm2-logrotate **só age** sobre `/root/.pm2/logs/`. Não toca em `/var/www/evolution-api/logs/`, pois esses são escritos pelo próprio app (Baileys/pino), não pelo stdout capturado pelo PM2.

### 3. Recuperação de espaço dos logs existentes (não-destrutiva)

**Premissa de segurança crítica**: vários `baileys-logs.log` estão **abertos** pelo processo node (verificado via `lsof`). Usar `gzip arquivo` direto **deleta** o original — o node continuaria escrevendo num inode deletado e o espaço só voltaria após restart.

Padrão seguro (preserva o inode e o file descriptor):
```bash
gzip -c arquivo > arquivo.gz && truncate -s 0 arquivo
```
- `gzip -c` escreve no stdout, sem tocar no original.
- `truncate -s 0` zera o conteúdo mantendo o inode → node continua escrevendo normalmente.

Comando aplicado em massa:
```bash
find /var/www/evolution-api/logs -name 'baileys-logs.log' -size +10M | while read f; do
  if [ ! -f "$f.gz" ]; then
    gzip -c "$f" > "$f.gz.tmp" && mv "$f.gz.tmp" "$f.gz" && truncate -s 0 "$f"
    echo "ok: $f"
  fi
done
```
- `.gz.tmp` + `mv` evita `.gz` corrompido se o gzip falhar no meio.
- `if [ ! -f "$f.gz" ]` torna o comando idempotente.
- Filtro `>10M` evita CPU em arquivos pequenos.

## Resultado

| Métrica | Antes | Depois |
|---|---|---|
| `/dev/vda1` usado | 39G / 49G (81%) | 29G / 49G (60%) |
| `/var/www/evolution-api/logs/` | 13G | 2.1G |
| Arquivos `.gz` criados | 0 | 217 |
| `baileys-logs.log` > 10M restantes | dezenas | 0 |

Espaço recuperado: **~11G**, sem apagar nenhum log (apenas comprimidos + originais truncados in-place, com o processo node ativo).

## Prevenção (aplicada — não volta a crescer)

### logrotate do SO
Criado **`/etc/logrotate.d/evolution-api`**:
```
/var/www/evolution-api/logs/*/baileys-logs.log {
    weekly
    rotate 4
    size 50M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```
Nota: `size` sobrepõe `weekly` no logrotate — na prática rotaciona só quando passar de 50M (comportamento desejado para 1.060 instâncias, evita rotação ruidosa de instâncias inativas). Validado com `logrotate -d`. Roda diariamente via `/etc/cron.daily/logrotate`.

### journald
Override em **`/etc/systemd/journald.conf.d/size.conf`** (não toca o arquivo principal):
```
[Journal]
SystemMaxUse=200M
SystemKeepFree=500M
```
Aplicado com `systemctl restart systemd-journald` — o restart já reduziu de 1.3G para 120M no ato (vacuum subsequente liberou 0B porque já estava abaixo do limite).

## Pendências (não aplicadas — decisões futuras)
1. **Instâncias órfãs**: muitos UUIDs em `logs/` têm mtime de dezembro/2024 e janeiro/2025. Cruzar com instâncias ativas no banco da Evolution; se órfãs, podem ser removidas.
2. Verificar se `DEL_INSTANCE=10` (em minutos) está sendo respeitado — havia 1.060 dirs de log apesar dessa config.

## Resultado final consolidado

| Métrica | Início | Final |
|---|---|---|
| Disco `/dev/vda1` | 39G / 49G (81%) | **28G / 49G (57%)** |
| Espaço livre | 9.4G | **21G** |
| `/var/www/evolution-api/logs/` | 13G | 2.1G |
| journald | 1.3G | 120M |

Total recuperado: **~12G**, sem deletar nenhum log (originais comprimidos + truncados in-place; journald reciclado).

### whatsapp-1 (aplicado em seguida)

| Métrica | Início | Final |
|---|---|---|
| Disco `/dev/vda1` | 31G / 49G (64%) | **20G / 49G (40%)** |
| `/var/www/evolution-api/logs/` | 13G | 1.9G |
| `/root/.pm2/logs/` | 405M | 82M |
| journald | 232M | 128M |

Diferenças notáveis vs whatsapp-2:
- pm2-logrotate já estava instalado (v3.0.0) com `compress true`, mas tinha logs antigos não comprimidos (provavelmente compress setado depois do rotate inicial) — resolvido com `gzip` manual dos `evolution-api-out__*.log`.
- `DEL_INSTANCE=false` no `.env` (no whatsapp-2 era `10`). **Não alterado** — é decisão operacional.
- Backup do `.env` salvo como `.env.bak-2026-05-20`.

### whatsapp-3 (perfil diferente)

| Métrica | Início | Final |
|---|---|---|
| Disco `/dev/vda1` | 28G / 49G (57%) | **19G / 49G (39%)** |
| `/root/.pm2/logs/evolution-api-out.log` | **8.1G (arquivo único)** | 880M (.gz) + 0B (live) |
| `/var/www/evolution-api/logs/` | 318M | 227M |
| journald | 1.2G | 168M |

Diferenças importantes vs whatsapp-1/2:
- **Baileys já estava OK** (`LOG_BAILEYS=error` já configurado, logs em 318M).
- **Culpado era o stdout da aplicação** capturado pelo PM2 — `evolution-api-out.log` com 8.1G num único arquivo (sem pm2-logrotate instalado).
- Origem: `LOG_LEVEL` ainda tinha `DEBUG,VERBOSE` ligados.
- pm2-logrotate **instalado e configurado nessa intervenção** (não existia antes).
- `DEL_INSTANCE=false` também aqui — não alterado.
- Backup do `.env` em `.env.bak-2026-05-20`.

**Lição**: o vetor pode ser baileys (instâncias múltiplas) OU stdout da aplicação (arquivo único). Sempre checar ambos.

### whatsapp-4 (dois vetores combinados)

| Métrica | Início | Final |
|---|---|---|
| Disco `/dev/vda1` | 27G / 49G (56%) | **18G / 49G (37%)** |
| `/var/www/evolution-api/logs/` | 4.0G | 788M |
| `/root/.pm2/logs/evolution-api-out.log` | 6.7G (arquivo único) | 730M (.gz) |
| journald | 24M | 24M (já estava OK; cap aplicado) |

Combinava os dois problemas: `LOG_BAILEYS=debug` **e** `LOG_LEVEL` verboso com pm2-logrotate ausente. Procedimento completo aplicado (todas as etapas dos casos anteriores). `DEL_INSTANCE=false` também aqui — não alterado.

## Pegadinha pós-limpeza: arquivos deletados ainda abertos

Depois de toda a limpeza do whatsapp-2, ele continuava com **28G usados** enquanto os outros estavam em ~18–20G. Diagnóstico:

```bash
df -h /            # 28G usados
du -sh /           # 22G — diferença de 6G "fantasma"
```

Causa: `lsof | grep '(deleted)'` mostrou que o **pm2-logrotate** (PID do módulo, não da app) segurava um arquivo deletado de 8 GB. Provavelmente:
1. O usuário fez `rm` manual em `evolution-api-out.log` no início da intervenção (antes de saber que devia usar `truncate`).
2. O `pm2 reloadLogs` releou o fd do **evolution-api**, mas o **pm2-logrotate** mantinha um fd próprio do mesmo arquivo (usado durante a rotação).
3. Como o pm2-logrotate é um processo separado e long-lived, o inode ficou preso até ele ser reiniciado.

**Comando de diagnóstico** quando `df` e `du` discordam:
```bash
lsof -nP | grep '(deleted)' | sort -k7 -rn | head
```

**Correção**:
```bash
pm2 restart pm2-logrotate
```
Liberou 8 GB instantaneamente. Resultado final do whatsapp-2 alinhado com os demais (**20G / 42%**).

**Regra geral**: nunca usar `rm` em log que está sendo escrito por processo ativo. Sempre `gzip -c file > file.gz && truncate -s 0 file`. Se já fez `rm`, todos os processos que tinham o arquivo aberto precisam ser reiniciados (não só o emissor — utilitários como tail, logrotate, etc. também podem segurar fds).

## Validação pós-mudança
```bash
# crescimento nas próximas horas: tamanhos devem ficar na casa de KB, não MB
find /var/www/evolution-api/logs -name 'baileys-logs.log' -mmin -60 -printf '%s\t%p\n' | sort -rn | head
```

## Referências de comandos de diagnóstico úteis
```bash
df -h
du -h -d1 /var | sort -hr | head
du -h -d1 /var/www/evolution-api | sort -hr | head
du -sh /var/www/evolution-api/logs/*/ | sort -hr | head
lsof <arquivo>                           # ver se algum processo tem o arquivo aberto
lsof -p <PID> | grep <uuid>              # ver fds de um processo específico
```
