# Stage 1: Build
FROM node:20-alpine AS builder

RUN apk update && \
  apk add git ffmpeg wget curl bash

LABEL version="2.2.0" description="API to control WhatsApp features through HTTP requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@atendai.com"

WORKDIR /evolution

COPY ./package.json ./tsconfig.json ./

RUN npm install -f

COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./manager ./manager
COPY ./runWithProvider.js ./
COPY ./tsup.config.ts ./

COPY ./Docker ./Docker

RUN chmod +x ./Docker/scripts/* && dos2unix ./Docker/scripts/*

RUN ./Docker/scripts/generate_database.sh

RUN npm run build

# Stage 2: Final
FROM node:20-alpine AS final

RUN apk update && \
  apk add tzdata ffmpeg bash

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

# Copy necessary files from builder
COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json
COPY --from=builder /evolution/node_modules ./node_modules
COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/manager ./manager
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/Docker ./Docker
COPY --from=builder /evolution/runWithProvider.js ./runWithProvider.js
COPY --from=builder /evolution/tsup.config.ts ./tsup.config.ts

# Accept build arguments and set as environment variables
# Server Configuration
ARG SERVER_TYPE
ARG SERVER_PORT
ARG SERVER_URL

ENV SERVER_TYPE=${SERVER_TYPE}
ENV SERVER_PORT=${SERVER_PORT}
ENV SERVER_URL=${SERVER_URL}

# CORS Configuration
ARG CORS_ORIGIN
ARG CORS_METHODS
ARG CORS_CREDENTIALS

ENV CORS_ORIGIN=${CORS_ORIGIN}
ENV CORS_METHODS=${CORS_METHODS}
ENV CORS_CREDENTIALS=${CORS_CREDENTIALS}

# Logging Configuration
ARG LOG_LEVEL
ARG LOG_COLOR
ARG LOG_BAILEYS

ENV LOG_LEVEL=${LOG_LEVEL}
ENV LOG_COLOR=${LOG_COLOR}
ENV LOG_BAILEYS=${LOG_BAILEYS}

# Event Emitter Configuration
ARG EVENT_EMITTER_MAX_LISTENERS

ENV EVENT_EMITTER_MAX_LISTENERS=${EVENT_EMITTER_MAX_LISTENERS}

# Instance Deletion Configuration
ARG DEL_INSTANCE

ENV DEL_INSTANCE=${DEL_INSTANCE}

# Database Configuration
ARG DATABASE_PROVIDER
ARG DATABASE_CONNECTION_URI
ARG DATABASE_CONNECTION_CLIENT_NAME

ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
ENV DATABASE_CONNECTION_URI=${DATABASE_CONNECTION_URI}
ENV DATABASE_CONNECTION_CLIENT_NAME=${DATABASE_CONNECTION_CLIENT_NAME}

# Database Save Options
ARG DATABASE_SAVE_DATA_INSTANCE
ARG DATABASE_SAVE_DATA_NEW_MESSAGE
ARG DATABASE_SAVE_MESSAGE_UPDATE
ARG DATABASE_SAVE_DATA_CONTACTS
ARG DATABASE_SAVE_DATA_CHATS
ARG DATABASE_SAVE_DATA_LABELS
ARG DATABASE_SAVE_DATA_HISTORIC
ARG DATABASE_SAVE_IS_ON_WHATSAPP
ARG DATABASE_SAVE_IS_ON_WHATSAPP_DAYS
ARG DATABASE_DELETE_MESSAGE

ENV DATABASE_SAVE_DATA_INSTANCE=${DATABASE_SAVE_DATA_INSTANCE}
ENV DATABASE_SAVE_DATA_NEW_MESSAGE=${DATABASE_SAVE_DATA_NEW_MESSAGE}
ENV DATABASE_SAVE_MESSAGE_UPDATE=${DATABASE_SAVE_MESSAGE_UPDATE}
ENV DATABASE_SAVE_DATA_CONTACTS=${DATABASE_SAVE_DATA_CONTACTS}
ENV DATABASE_SAVE_DATA_CHATS=${DATABASE_SAVE_DATA_CHATS}
ENV DATABASE_SAVE_DATA_LABELS=${DATABASE_SAVE_DATA_LABELS}
ENV DATABASE_SAVE_DATA_HISTORIC=${DATABASE_SAVE_DATA_HISTORIC}
ENV DATABASE_SAVE_IS_ON_WHATSAPP=${DATABASE_SAVE_IS_ON_WHATSAPP}
ENV DATABASE_SAVE_IS_ON_WHATSAPP_DAYS=${DATABASE_SAVE_IS_ON_WHATSAPP_DAYS}
ENV DATABASE_DELETE_MESSAGE=${DATABASE_DELETE_MESSAGE}

# Authentication Configuration
ARG AUTHENTICATION_API_KEY
ARG AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES

ENV AUTHENTICATION_API_KEY=${AUTHENTICATION_API_KEY}
ENV AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=${AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES}

# Language Configuration
ARG LANGUAGE

ENV LANGUAGE=${LANGUAGE}

# Additional Environment Variables
ENV DOCKER_ENV=true

EXPOSE 8080

ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod" ]
