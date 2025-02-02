FROM golang:1.23.4-alpine3.21 AS go_build

WORKDIR /build

RUN apk update \
    && apk add --no-cache \
    build-base \
    git

RUN git clone https://github.com/tianon/gosu.git .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o gosu

FROM postgres:16-alpine3.21 AS pgvector_build

WORKDIR /pgvector

RUN apk update \
    && apk add --no-cache \
    build-base \
    git \
    clang \
    llvm \
    postgresql16-dev

RUN git clone https://github.com/pgvector/pgvector.git . \
    && make \
    && make install

FROM postgres:16-alpine3.21

COPY --from=go_build /build/gosu /usr/local/bin
COPY --from=pgvector_build /pgvector/vector.so /usr/local/lib/postgresql
COPY --from=pgvector_build /pgvector/vector.control /usr/local/share/postgresql/extension
COPY --from=pgvector_build /pgvector/sql/vector--0.8.0.sql /usr/local/share/postgresql/extension
