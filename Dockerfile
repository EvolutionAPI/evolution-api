FROM node:20-bullseye-slim AS base

RUN apt-get update -y
RUN apt-get upgrade -y

RUN apt-get install -y git tzdata ffmpeg wget curl

RUN npm i -g npm@latest

FROM base AS builder

LABEL version="1.8.0" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@agenciadgcode.com"

WORKDIR /evolution

COPY ./package.json ./tsconfig.json ./

RUN npm install

COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./views ./views
COPY ./.env.dev ./.env

COPY ./Docker ./Docker

RUN chmod +x ./Docker/deploy_database.sh

ENV DATABASE_CONNECTION_URI=postgres://postgres:pass@localhost/evolution

RUN ./Docker/deploy_database.sh

RUN npm run build

FROM node:20.7.0-alpine AS final

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json

RUN npm install --omit=dev

COPY --from=builder /evolution .

ENV DOCKER_ENV=true

ENTRYPOINT ["/bin/bash", "-c", ". ./scripts/run_database_operation_deploy.sh && npm run start:prod" ]
