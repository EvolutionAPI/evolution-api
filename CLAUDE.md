# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- **Run development server**: `npm run dev:server` - Starts the server with hot reload using tsx watch
- **Build project**: `npm run build` - Runs TypeScript check and builds with tsup
- **Start production**: `npm run start:prod` - Runs the compiled application from dist/
- **Lint code**: `npm run lint` - Runs ESLint with auto-fix on TypeScript files
- **Check lint**: `npm run lint:check` - Runs ESLint without auto-fix

### Database Commands
The project uses Prisma with support for multiple database providers (PostgreSQL, MySQL, psql_bouncer). Commands automatically use the DATABASE_PROVIDER from .env:

- **Generate Prisma client**: `npm run db:generate`
- **Deploy migrations**: `npm run db:deploy` (Unix/Mac) or `npm run db:deploy:win` (Windows)
- **Open Prisma Studio**: `npm run db:studio`
- **Create new migration**: `npm run db:migrate:dev` (Unix/Mac) or `npm run db:migrate:dev:win` (Windows)

## Architecture Overview

### Project Structure
Evolution API is a WhatsApp integration platform built with TypeScript and Express, supporting both Baileys (WhatsApp Web) and WhatsApp Cloud API connections.

### Core Components

**API Layer** (`src/api/`)
- **Controllers**: Handle HTTP requests for different resources (instance, chat, group, sendMessage, etc.)
- **Services**: Business logic layer containing auth, cache, channel, monitor, proxy services
- **Routes**: RESTful API endpoints with authentication guards
- **DTOs**: Data transfer objects for request/response validation using class-validator
- **Repository**: Database access layer using Prisma ORM

**Integrations** (`src/api/integrations/`)
- **Chatbot**: Supports multiple chatbot platforms (Typebot, Chatwoot, Dify, OpenAI, Flowise, N8N)
- **Event**: WebSocket, RabbitMQ, Amazon SQS event systems
- **Storage**: S3/Minio file storage integration
- **Channel**: Multi-channel messaging support

**Configuration** (`src/config/`)
- Environment configuration management
- Database provider switching (PostgreSQL/MySQL/PgBouncer)
- Multi-tenant support via DATABASE_CONNECTION_CLIENT_NAME

### Key Design Patterns

1. **Multi-Provider Database**: Uses `runWithProvider.js` to dynamically select database provider and migrations
2. **Module System**: Path aliases configured in tsconfig.json (@api, @cache, @config, @utils, @validate)
3. **Event-Driven**: EventEmitter2 for internal events, supports multiple external event systems
4. **Instance Management**: Each WhatsApp connection is managed as an instance with memory lifecycle (DEL_INSTANCE config)

### Database Schema
- Supports multiple providers with provider-specific schemas in `prisma/`
- Separate migration folders for each provider (postgresql-migrations, mysql-migrations)
- psql_bouncer uses PostgreSQL migrations but with connection pooling

### Authentication & Security
- JWT-based authentication
- API key support
- Instance-specific authentication
- Configurable CORS settings

### Messaging Features
- WhatsApp Web (Baileys library) and WhatsApp Cloud API support
- Message queue support (RabbitMQ, SQS)
- Real-time updates via WebSocket
- Media file handling with S3/Minio storage
- Multiple chatbot integrations with trigger management

### Environment Variables
Critical configuration in `.env`:
- SERVER_TYPE, SERVER_PORT, SERVER_URL
- DATABASE_PROVIDER and DATABASE_CONNECTION_URI
- Log levels and Baileys-specific logging
- Instance lifecycle management (DEL_INSTANCE)
- Feature toggles for data persistence (DATABASE_SAVE_*)