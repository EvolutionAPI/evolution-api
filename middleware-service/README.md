# Evolution x Helpdesk Middleware (FastAPI)

Middleware microservice to bridge communication between Evolution API and your helpdesk system using RabbitMQ and PostgreSQL.

## What is implemented

- FastAPI service in a separate folder (`middleware-service`)
- PostgreSQL persistence (`event_logs` table)
- RabbitMQ exchange and queues initialization
- HTTP endpoints to receive events from Evolution and Helpdesk
- Event publishing to RabbitMQ
- Base queue consumer for inbound events
- Evolution API integration endpoints:
  - Get API information (`GET /` from Evolution API)
  - Configure RabbitMQ for a specific Evolution instance (`POST /rabbitmq/set/{instance}`)

## Folder structure

```text
middleware-service/
  app/
    api/routes.py
    core/config.py
    db/session.py
    models/event_log.py
    schemas/events.py
    schemas/evolution.py
    services/consumer.py
    services/evolution_api.py
    services/rabbitmq.py
    services/repository.py
    main.py
  .env.example
  docker-compose.yaml
  Dockerfile
  requirements.txt
  README.md
```

## Environment setup

```bash
cd middleware-service
cp .env.example .env
```

Set at least:

- `DATABASE_URL`
- `RABBITMQ_URL`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY` (if your Evolution API requires `apikey` header)

## Run with Docker (recommended)

```bash
cd middleware-service
docker compose up -d --build
```

Services started:

- FastAPI middleware: `http://localhost:8090`
- PostgreSQL: `localhost:5435`
- RabbitMQ AMQP: `localhost:5672`
- RabbitMQ Management UI: `http://localhost:15672`

## Run locally without Docker for API

1. Start infra only:

```bash
docker compose up -d postgres rabbitmq
```

2. Run FastAPI:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## API endpoints

- `GET /api/v1/health`
- `GET /api/v1/evolution/info`
- `POST /api/v1/evolution/rabbitmq/set/{instance_name}`
- `POST /api/v1/events/evolution`
- `POST /api/v1/events/helpdesk`
- `POST /api/v1/publish`

## Example requests

Configure RabbitMQ events in Evolution instance:

```bash
curl -X POST 'http://localhost:8090/api/v1/evolution/rabbitmq/set/my-instance' \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "events": [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE"
    ]
  }'
```

Receive Evolution event in middleware:

```bash
curl -X POST 'http://localhost:8090/api/v1/events/evolution' \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "MESSAGES_UPSERT",
    "payload": {
      "instance": "my-instance",
      "data": {"key": "value"}
    }
  }'
```

## Notes

- This implementation is middleware-ready and stores all incoming events.
- Helpdesk-specific ticket mapping/transformation is the next layer to implement when you provide the helpdesk API contract.
