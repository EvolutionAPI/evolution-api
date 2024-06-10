FROM node:20-bullseye-slim AS base

RUN apt-get update -y && apt-get upgrade -y && \
    apt-get install -y git tzdata ffmpeg wget curl && \
    npm i -g npm@latest

FROM base AS builder

LABEL version="2.0.0" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@agenciadgcode.com"

WORKDIR /evolution

COPY ./package.json ./tsconfig.json ./

RUN npm install

COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./views ./views
COPY ./.env.example ./.env

COPY ./Docker ./Docker

RUN chmod +x ./Docker/scripts/*

RUN ./Docker/scripts/generate_database.sh

RUN npm run build

FROM base AS final

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json

RUN npm install --omit=dev

COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/views ./views
COPY --from=builder /evolution/.env ./.env
COPY --from=builder /evolution/Docker ./Docker

ENV DOCKER_ENV=true

ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod" ]
