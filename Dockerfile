FROM node:20.7.0-alpine AS builder

LABEL version="1.8.0" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@agenciadgcode.com"

RUN apk update && apk upgrade && \
    apk add --no-cache git tzdata ffmpeg wget curl

WORKDIR /evolution

COPY ./package.json .

RUN npm install

COPY . .

ENV DATABASE_CONNECTION_URI=postgres://postgres:pass@localhost/evolution
RUN npx prisma generate

RUN npm run build

FROM node:20.7.0-alpine AS final

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

COPY --from=builder /evolution .

ENV DOCKER_ENV=true

RUN npx prisma migrate deploy
RUN npx prisma generate

CMD [ "node", "./dist/src/main.js" ]
