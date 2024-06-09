export_env_vars() {
    if [ -f .env ]; then
        while IFS='=' read -r key value; do
            if [[ -z "$key" || "$key" =~ ^\s*# || -z "$value" ]]; then
                continue
            fi

            key=$(echo "$key" | tr -d '[:space:]')
            value=$(echo "$value" | tr -d '[:space:]')
            value=$(echo "$value" | tr -d "'" | tr -d "\"")

            export "$key=$value"
        done < .env
    else
        echo ".env file not found"
        exit 1
    fi
}
