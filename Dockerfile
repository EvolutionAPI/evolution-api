FROM node:20-alpine AS builder

RUN apk update && \
    apk add --no-cache git ffmpeg wget curl bash openssl

LABEL version="2.3.1" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@evolution-api.com"

WORKDIR /evolution

# Define variáveis de ambiente padrão para o build
COPY ./package.json ./tsconfig.json ./

# Instala todas as dependências (incluindo dev para build)
RUN npm install

# Copia código fonte
COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./manager ./manager
COPY ./.env.example ./.env
COPY ./runWithProvider.js ./
COPY ./tsup.config.ts ./

# Copia scripts Docker
COPY ./Docker ./Docker

RUN chmod +x ./Docker/scripts/* && dos2unix ./Docker/scripts/*

# Cria um arquivo .env básico com as variáveis de ambiente para o build
RUN echo "DOCKER_ENV=true" > .env && \
    echo "DATABASE_PROVIDER=${DATABASE_PROVIDER}" >> .env && \
    echo "DATABASE_URL=${DATABASE_URL}" >> .env

# Executa o script de geração de banco - agora com variáveis definidas
RUN ./Docker/scripts/generate_database.sh

# Build do projeto
RUN npm run build

FROM node:20-alpine AS final

RUN apk update && \
    apk add tzdata ffmpeg bash openssl

ENV TZ=America/Sao_Paulo
ENV DOCKER_ENV=true

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json

COPY --from=builder /evolution/node_modules ./node_modules
COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/manager ./manager
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/.env ./.env
COPY --from=builder /evolution/Docker ./Docker
COPY --from=builder /evolution/runWithProvider.js ./runWithProvider.js
COPY --from=builder /evolution/tsup.config.ts ./tsup.config.ts

ENV DOCKER_ENV=true

EXPOSE 8080

ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod" ]
