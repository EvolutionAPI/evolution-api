#!/bin/bash

# Definir cores para melhor legibilidade
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}
log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}
log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Verificar se está rodando como root
if [ "$(id -u)" = "0" ]; then
    log_error "Este script não deve ser executado como root"
    exit 1
fi

# Verificar sistema operacional
OS="$(uname -s)"
case "${OS}" in
    Linux*)     
        if [ ! -x "$(command -v curl)" ]; then
            log_warning "Curl não está instalado. Tentando instalar..."
            if [ -x "$(command -v apt-get)" ]; then
                sudo apt-get update && sudo apt-get install -y curl
            elif [ -x "$(command -v yum)" ]; then
                sudo yum install -y curl
            else
                log_error "Não foi possível instalar curl automaticamente. Por favor, instale manualmente."
                exit 1
            fi
        fi
        ;;
    Darwin*)    
        if [ ! -x "$(command -v curl)" ]; then
            log_error "Curl não está instalado. Por favor, instale o Xcode Command Line Tools."
            exit 1
        fi
        ;;
    *)          
        log_error "Sistema operacional não suportado: ${OS}"
        exit 1
        ;;
esac

# Verificar conexão com a internet antes de prosseguir
if ! ping -c 1 8.8.8.8 &> /dev/null; then
    log_error "Sem conexão com a internet. Por favor, verifique sua conexão."
    exit 1
fi

# Adicionar verificação de espaço em disco
REQUIRED_SPACE=1000000 # 1GB em KB
AVAILABLE_SPACE=$(df -k . | awk 'NR==2 {print $4}')
if [ $AVAILABLE_SPACE -lt $REQUIRED_SPACE ]; then
    log_error "Espaço em disco insuficiente. Necessário pelo menos 1GB livre."
    exit 1
fi

# Adicionar tratamento de erro para comandos npm
npm_install_with_retry() {
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Tentativa $attempt de $max_attempts para npm install"
        if npm install; then
            return 0
        fi
        attempt=$((attempt + 1))
        [ $attempt -le $max_attempts ] && log_warning "Falha na instalação. Tentando novamente em 5 segundos..." && sleep 5
    done
    
    log_error "Falha ao executar npm install após $max_attempts tentativas"
    return 1
}

# Adicionar timeout para comandos
execute_with_timeout() {
    timeout 300 $@ || log_error "Comando excedeu o tempo limite de 5 minutos: $@"
}

# Verificar se o NVM já está instalado
if [ -d "$HOME/.nvm" ]; then
    log "NVM já está instalado."
else
    log "Instalando NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Carregar o NVM no ambiente atual
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Verificar se a versão do Node.js já está instalada
if command -v node >/dev/null 2>&1 && [ "$(node -v)" = "v20.10.0" ]; then
    log "Node.js v20.10.0 já está instalado."
else
    log "Instalando Node.js v20.10.0..."
    nvm install v20.10.0
fi

nvm use v20.10.0

# Verificar as versões instaladas
log "Verificando as versões instaladas:"
log "Node.js: $(node -v)"
log "npm: $(npm -v)"

# Instala dependências do projeto
log "Instalando dependências do projeto..."
rm -rf node_modules
npm install

# Deploy do banco de dados
log "Deploy do banco de dados..."
npm run db:generate
npm run db:deploy

# Iniciar o projeto
log "Iniciando o projeto..."
if [ "$1" = "-dev" ]; then
    npm run dev:server
else
    npm run build
    npm run start:prod
fi

log "Instalação concluída com sucesso!"

# Criar arquivo de log
LOGFILE="./installation_log_$(date +%Y%m%d_%H%M%S).log"
exec 1> >(tee -a "$LOGFILE")
exec 2>&1

# Adicionar trap para limpeza em caso de interrupção
cleanup() {
    log "Limpando recursos temporários..."
    # Adicione comandos de limpeza aqui
}
trap cleanup EXIT
