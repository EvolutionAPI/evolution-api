#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Comando necessário não encontrado: $1"; exit 1; }
}

ensure_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      export SUDO=sudo
    else
      err "Execute como root ou instale sudo"; exit 1
    fi
  else
    export SUDO=
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker já instalado: $(docker --version)"
  else
    log "Instalando Docker Engine..."
    . /etc/os-release
    case "$ID" in
      ubuntu|debian)
        $SUDO apt-get update -y
        $SUDO apt-get install -y ca-certificates curl gnupg lsb-release
        install -d -m 0755 /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$ID/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $(. /etc/os-release && echo $VERSION_CODENAME) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
        $SUDO apt-get update -y
        $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
      centos|rhel|rocky|almalinux)
        $SUDO yum install -y yum-utils
        $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        $SUDO systemctl enable --now docker
        ;;
      *)
        err "Distribuição não suportada automaticamente ($ID). Instale Docker manualmente."; exit 1;
        ;;
    esac
    $SUDO systemctl enable --now docker || true
  fi

  if docker compose version >/dev/null 2>&1; then
    log "Docker Compose plugin detectado."
  else
    warn "Docker Compose plugin não encontrado. Tentando instalar via pipx (fallback)."
    $SUDO apt-get install -y python3-pip python3-venv || true
    $SUDO pip3 install docker-compose || true
    require_cmd docker-compose || warn "Instale manualmente o compose se necessário."
  fi
}

prepare_env() {
  if [ ! -f .env ]; then
    log "Gerando .env a partir de .env.vps.example"
    cp .env.vps.example .env
    # gerar chave aleatória
    local key
    key=$(openssl rand -hex 24)
    sed -i "s/^AUTHENTICATION_API_KEY=.*/AUTHENTICATION_API_KEY=${key}/" .env
  else
    log ".env já existe, mantendo configurações atuais."
  fi

  # Garantir que variáveis mínimas existam
  grep -q '^DATABASE_PROVIDER=' .env || echo 'DATABASE_PROVIDER=postgresql' >> .env
  grep -q '^SERVER_PORT=' .env || echo 'SERVER_PORT=8080' >> .env
}

bring_up() {
  log "Subindo stack com docker compose (api, postgres, redis)..."
  docker compose -f docker-compose.vps.yaml up -d --build
  log "Aguardando containers iniciarem..."
  sleep 5
  docker compose -f docker-compose.vps.yaml ps
}

main() {
  ensure_root
  install_docker
  prepare_env
  bring_up
  log "Pronto! API ouvindo em http://SEU_IP:8080"
}

main "$@"

