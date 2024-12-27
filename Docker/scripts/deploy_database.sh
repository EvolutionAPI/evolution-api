#!/bin/bash

# Fonte das variáveis de ambiente
source ./Docker/scripts/env_functions.sh

# Carregar variáveis de ambiente se não estiver no ambiente Docker
if [ "$DOCKER_ENV" != "true" ]; then
    export_env_vars
fi

# Verificar se o banco de dados é PostgreSQL ou MySQL
if [[ "$DATABASE_PROVIDER" == "postgresql" || "$DATABASE_PROVIDER" == "mysql" ]]; then
    export DATABASE_URL
    echo "Deploying migrations for $DATABASE_PROVIDER"
    echo "Database URL: $DATABASE_URL"

    # Verificar se há migrações pendentes com Prisma
    MIGRATION_STATUS=$(npx prisma migrate status)

    if echo "$MIGRATION_STATUS" | grep -q "Pending"; then
        echo "Migrações pendentes encontradas. Executando deploy..."
        npm run db:deploy  # Aplica as migrações pendentes
        if [ $? -ne 0 ]; then
            echo "Migration failed"
            exit 1
        else
            echo "Migration succeeded"
        fi
    else
        echo "Nenhuma migração pendente. Pulando deploy."
    fi

    # Gerar o Prisma Client após o deploy
    npm run db:generate
    if [ $? -ne 0 ]; then
        echo "Prisma generate failed"
        exit 1
    else
        echo "Prisma generate succeeded"
    fi

else
    echo "Error: Database provider $DATABASE_PROVIDER invalid."
    exit 1
fi
