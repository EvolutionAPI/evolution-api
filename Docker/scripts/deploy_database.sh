#!/bin/bash

source ./Docker/scripts/env_functions.sh

if [ "$DOCKER_ENV" != "true" ]; then
    export_env_vars
fi

if [[ "$DATABASE_PROVIDER" == "postgresql" || "$DATABASE_PROVIDER" == "mysql" ]]; then
    export DATABASE_URL
    ./node_modules/.bin/prisma migrate dev --name init --schema ./prisma/$DATABASE_PROVIDER-schema.prisma
else
    echo "Error: Database provider $DATABASE_PROVIDER invalid."
    exit 1
fi
