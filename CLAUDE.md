# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Evolution API is a REST API for WhatsApp communication that supports both Baileys (WhatsApp Web) and official WhatsApp Business API. It's built with TypeScript/Node.js and provides extensive integrations with various platforms.

## Common Development Commands

### Build and Run
```bash
# Development
npm run dev:server    # Run in development with hot reload (tsx watch)

# Production
npm run build        # TypeScript check + tsup build
npm run start:prod   # Run production build

# Direct execution
npm start           # Run with tsx
```

### Code Quality
```bash
npm run lint        # ESLint with auto-fix
npm run lint:check  # ESLint check only
npm run commit      # Interactive commit with commitizen
```

### Database Management
```bash
# Generate Prisma client (automatically uses DATABASE_PROVIDER env)
npm run db:generate

# Deploy migrations
npm run db:deploy      # Unix/Mac
npm run db:deploy:win  # Windows

# Open Prisma Studio
npm run db:studio

# Development migrations
npm run db:migrate:dev      # Unix/Mac
npm run db:migrate:dev:win  # Windows
```

### Testing
```bash
npm test    # Run tests with watch mode
```

## Architecture Overview

### Core Structure
- **Multi-provider database support**: PostgreSQL and MySQL via Prisma ORM with provider-specific schemas
- **Connection management**: Each WhatsApp instance maintains its own connection state and session
- **Event-driven architecture**: Uses EventEmitter2 for internal events and supports multiple external event systems

### Directory Layout
```
src/
├── api/
│   ├── controllers/     # HTTP route handlers
│   ├── services/        # Business logic
│   ├── repository/      # Data access layer (Prisma)
│   ├── dto/            # Data validation schemas
│   ├── guards/         # Authentication/authorization
│   ├── integrations/   # External service integrations
│   └── routes/         # Express route definitions
├── config/             # Environment and app configuration
├── cache/             # Redis and local cache implementations
├── exceptions/        # Custom exception classes
├── utils/            # Shared utilities
└── validate/         # Validation schemas
```

### Key Services Integration Points

**WhatsApp Service** (`src/api/integrations/channel/whatsapp/`):
- Manages Baileys connections and Meta Business API
- Handles message sending, receiving, and status updates
- Connection lifecycle management per instance

**Integration Services** (`src/api/integrations/`):
- Chatwoot: Customer service platform integration
- Typebot: Conversational bot builder
- OpenAI: AI capabilities including audio transcription
- Dify: AI agent platform
- RabbitMQ/SQS: Message queue integrations
- S3/Minio: Media storage

### Database Schema Management
- Separate schema files: `postgresql-schema.prisma` and `mysql-schema.prisma`
- Environment variable `DATABASE_PROVIDER` determines active database
- Migration folders are provider-specific and auto-selected during deployment

### Authentication & Security
- API key-based authentication via `apikey` header
- Instance-specific authentication for WhatsApp connections
- Guards system for route protection
- Input validation using `class-validator`

## Important Implementation Details

### WhatsApp Instance Management
- Each WhatsApp connection is an "instance" with unique name
- Instance data stored in database with connection state
- Session persistence in database or file system (configurable)
- Automatic reconnection handling with exponential backoff

### Message Queue Architecture
- Supports RabbitMQ, Amazon SQS, and WebSocket for events
- Event types: message.received, message.sent, connection.update, etc.
- Configurable per instance which events to send

### Media Handling
- Local storage or S3/Minio for media files
- Automatic media download from WhatsApp
- Media URL generation for external access
- Support for audio transcription via OpenAI

### Multi-tenancy Support
- Instance isolation at database level
- Separate webhook configurations per instance
- Independent integration settings per instance

## Environment Configuration

Key environment variables are defined in `.env.example`. The system uses a strongly-typed configuration system via `src/config/env.config.ts`.

Critical configurations:
- `DATABASE_PROVIDER`: postgresql or mysql
- `DATABASE_CONNECTION_URI`: Database connection string
- `AUTHENTICATION_API_KEY`: Global API authentication
- `REDIS_ENABLED`: Enable Redis cache
- `RABBITMQ_ENABLED`/`SQS_ENABLED`: Message queue options

## Development Guidelines from Cursor Instructions

The project includes specific development instructions in `.cursor/instructions`:
- Always respond in Portuguese Brazilian
- Follow established architecture patterns
- Robust error handling with retry logic
- Multi-database compatibility requirements
- Security validations and rate limiting
- Performance optimizations with caching
- Minimum 70% test coverage target

## Testing Approach

Tests are located alongside source files or in dedicated test directories. The project uses:
- Unit tests for services
- Integration tests for critical APIs
- Mock external dependencies
- Test command runs with watch mode for development

## Deployment Considerations

- Docker support with `Dockerfile` and `docker-compose.yaml`
- Graceful shutdown handling for connections
- Health check endpoints for monitoring
- Sentry integration for error tracking
- Telemetry for usage analytics (non-sensitive data only)