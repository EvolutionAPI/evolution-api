from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'evolution-helpdesk-middleware'
    app_env: str = 'development'
    app_host: str = '0.0.0.0'
    app_port: int = 8090

    database_url: str = 'postgresql+psycopg2://middleware_user:middleware_pass@localhost:5432/middleware_db'

    rabbitmq_url: str = 'amqp://guest:guest@localhost:5672/'
    rabbitmq_exchange: str = 'evolution_exchange'
    rabbitmq_queue_in: str = 'middleware.evolution.events'
    rabbitmq_queue_out: str = 'evolution.middleware.out'
    rabbitmq_routing_key_in: str = '#'
    rabbitmq_routing_key_out: str = 'helpdesk.out'

    evolution_api_base_url: str = 'http://localhost:8080'
    evolution_api_key: str = ''
    evolution_api_timeout: int = 20

    support_whatsapp_number: str = ''
    default_tenant_name: str = ''
    default_instance_name: str = ''


settings = Settings()
