# Evolution API Helpdesk Middleware

Standalone FastAPI microservice that bridges WhatsApp (via Evolution API) to a helpdesk ticketing system. Fully independent from the Evolution API — host it separately.

## Architecture

```
WhatsApp User → Evolution API → HTTP Webhook / RabbitMQ → Middleware Service → Helpdesk DB
                                                                    ↓
                                                             Evolution API ← Send reply
```

### Key Concepts

- **Tenant** — A company/brand receiving support requests (e.g., "Company A")
- **Customer** — A person sending WhatsApp messages, scoped to a tenant
- **Instance-Tenant Link** — Maps a WhatsApp instance name to a tenant
- **WhatsApp Session** — Per-phone per-tenant conversation state machine
- **Ticket** — Support ticket with subject, description, category, status

## Quick Start

```bash
cd middleware-service
cp .env.example .env
# Edit .env with your database, RabbitMQ, and Evolution API settings
docker compose up -d --build
```

The API will be available at `http://localhost:8090`.

## API Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Service health check |

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tenants` | Create tenant |
| GET | `/api/v1/tenants` | List tenants |
| GET | `/api/v1/tenants/{id}` | Get tenant |
| PUT | `/api/v1/tenants/{id}` | Update tenant |
| DELETE | `/api/v1/tenants/{id}` | Delete tenant |

### Instance-Tenant Linking

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/instances/link` | Link instance to tenant |
| GET | `/api/v1/instances` | List all links |
| GET | `/api/v1/instances/{instance_name}` | Get link by instance |
| DELETE | `/api/v1/instances/{instance_name}` | Unlink instance |

### Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/customers` | Create customer |
| GET | `/api/v1/customers` | List customers |
| GET | `/api/v1/customers/phone/{phone}` | Find by phone + tenant |
| GET | `/api/v1/customers/{id}` | Get customer |
| PUT | `/api/v1/customers/{id}` | Update customer |

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tickets` | Create ticket |
| GET | `/api/v1/tickets` | List tickets |
| GET | `/api/v1/tickets/{id}` | Get ticket detail |
| PUT | `/api/v1/tickets/{id}` | Update ticket |
| DELETE | `/api/v1/tickets/{id}` | Soft delete ticket |

### Ticket Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tickets/{id}/messages` | Add message to ticket |
| GET | `/api/v1/tickets/{id}/messages` | List ticket messages |

### Webhook (Evolution API Integration)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/webhook/evolution` | Receive WhatsApp message & reply |
| POST | `/api/v1/events/evolution` | Receive Evolution event (legacy) |

### Evolution API Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/evolution/info` | Get Evolution API info |
| POST | `/api/v1/evolution/rabbitmq/set/{instance}` | Configure RabbitMQ on instance |

## Setup Guide

### 1. Create a Tenant

```bash
curl -X POST http://localhost:8090/api/v1/tenants \
  -H 'Content-Type: application/json' \
  -d '{"name": "Acme Corp"}'
```

### 2. Create a WhatsApp Instance in Evolution API

Follow the Evolution API documentation to create an instance (e.g., `acme-support`).

### 3. Link the Instance to the Tenant

```bash
curl -X POST http://localhost:8090/api/v1/instances/link \
  -H 'Content-Type: application/json' \
  -d '{"instance_name": "acme-support", "tenant_id": 1}'
```

### 4. Configure Evolution to Send Events to Middleware

Via RabbitMQ:
```bash
curl -X POST 'http://localhost:8090/api/v1/evolution/rabbitmq/set/acme-support' \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }'
```

Or configure the Evolution API webhook to send to `POST /api/v1/webhook/evolution`.

### 5. Done

When a user sends a WhatsApp message, the middleware will:
1. Identify the tenant via instance name
2. Find or create the customer
3. Start/continue a conversation session
4. Guide the user through ticket creation
5. Send replies back via Evolution API

## Conversation Flow

```
User: "Hi"
Bot:  Welcome to Support!
      1. Create Ticket
      2. Check Ticket Status
      3. Speak to Agent

User: "1"
Bot:  Please briefly describe your issue.

User: "My internet is not working"
Bot:  Which category?
      1. Network
      2. Billing
      3. Technical Support
      4. Other

User: "1"
Bot:  Please confirm:
      Issue: My internet is not working
      Category: Network
      1. Submit
      2. Edit Description
      3. Cancel

User: "1"
Bot:  Ticket INC-00001 created! Status: Open.
```

## Folder Structure

```
middleware-service/
├── app/
│   ├── main.py                  # FastAPI entry point
│   ├── api/
│   │   ├── routes.py            # Main router
│   │   ├── tenants.py           # Tenant CRUD
│   │   ├── customers.py         # Customer CRUD
│   │   ├── tickets.py           # Ticket CRUD
│   │   ├── ticket_messages.py   # Ticket message endpoints
│   │   ├── comments.py          # Legacy comment endpoints
│   │   ├── instances.py         # Instance-tenant linking
│   │   └── webhook.py           # Evolution webhook handler
│   ├── core/
│   │   └── config.py            # Pydantic Settings
│   ├── db/
│   │   └── session.py           # SQLAlchemy session
│   ├── models/                  # SQLAlchemy models
│   │   ├── tenant.py
│   │   ├── customer.py
│   │   ├── ticket.py
│   │   ├── ticket_message.py
│   │   ├── instance_tenant.py
│   │   ├── whatsapp_session.py
│   │   ├── command_log.py
│   │   ├── event_log.py
│   │   └── ticket_comment.py
│   ├── schemas/                 # Pydantic schemas
│   │   ├── tenant.py
│   │   ├── customer.py
│   │   ├── ticket.py
│   │   ├── ticket_message.py
│   │   ├── instance_tenant.py
│   │   ├── whatsapp_session.py
│   │   ├── conversation.py
│   │   ├── events.py
│   │   ├── evolution.py
│   │   └── ticket_comment.py
│   └── services/               # Business logic
│       ├── conversation_service.py
│       ├── ticket_service.py
│       ├── evolution_api.py
│       ├── rabbitmq.py
│       ├── consumer.py
│       ├── ticket_repository.py
│       └── ...
├── docker-compose.yaml
├── Dockerfile
├── requirements.txt
└── README.md
```
