### Deploy da Evolution API (Railway e VPS)

Este guia cobre dois cenários: deploy no Railway (PaaS) e em uma VPS usando Docker Compose.

## Requisitos
- Node/TS não necessários no servidor (usaremos Docker)
- Banco: PostgreSQL
- Cache: Redis

## 1) Railway

O repositório já possui `Dockerfile` e `railway.json` (raiz) para build via Docker. Passos:

1. Crie um projeto no Railway.
2. Adicione dois serviços gerenciados: PostgreSQL e Redis.
3. Adicione um serviço "Deploy from Repo" apontando para este repositório.
   - Builder: Dockerfile (automaticamente detectado pelo `railway.json`).
4. Configure as variáveis de ambiente no serviço da API:
   - `DATABASE_PROVIDER=postgresql`
   - `DATABASE_CONNECTION_URI` = string de conexão do PostgreSQL fornecida pelo Railway
   - `CACHE_REDIS_URI` = URL do Redis fornecida pelo Railway
   - `AUTHENTICATION_API_KEY` = defina uma chave forte
   - Opcional: `SERVER_PORT=8080` (padrão já é 8080), `LANGUAGE=pt-BR`, `CORS_ORIGIN=*`

O container roda `./Docker/scripts/deploy_database.sh` no entrypoint e aplica as migrations automaticamente. A porta exposta é 8080.

Observações:
- Armazenamento local do diretório `/evolution/instances` é efêmero no Railway. Se precisar persistência de sessões do WhatsApp, use volumes persistentes do Railway (se disponível) ou uma estratégia externa de storage.

## 2) VPS (Docker Compose)

Arquivos preparados:
- `docker-compose.vps.yaml` (API, Postgres, Redis)
- `.env.vps.example` (variáveis mínimas para subir)
- `scripts/install_vps.sh` (instala Docker e sobe a stack)

Passos:
1. Copie `.env.vps.example` para `.env` e ajuste se necessário:
   - `AUTHENTICATION_API_KEY` (será gerada automaticamente pelo script se não setada)
   - `SERVER_URL` com IP/host público
2. Execute o script (como root ou com sudo):

```bash
bash scripts/install_vps.sh
```

3. Verifique serviços:

```bash
docker compose -f docker-compose.vps.yaml ps
```

4. A API ficará disponível em `http://SEU_IP:8080`.

Atualizações:
```bash
docker compose -f docker-compose.vps.yaml pull
docker compose -f docker-compose.vps.yaml up -d --build
```

Logs:
```bash
docker compose -f docker-compose.vps.yaml logs -f api
```

## Variáveis essenciais
- `DATABASE_PROVIDER=postgresql`
- `DATABASE_CONNECTION_URI` (ex.: `postgresql://user:pass@postgres:5432/db`)
- `CACHE_REDIS_URI` (ex.: `redis://redis:6379`)
- `AUTHENTICATION_API_KEY` (chave da sua API)

## Segurança
- Use uma chave forte em `AUTHENTICATION_API_KEY`.
- Restrinja acesso à porta 8080 via firewall se necessário e exponha via proxy (Nginx) com HTTPS.

