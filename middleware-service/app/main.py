import logging

from fastapi import FastAPI

from app.api.routes import get_router
from app.core.config import settings
from app.db.session import Base, engine
from app.services.consumer import start_consumer
from app.services.rabbitmq import RabbitMQService

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s - %(message)s')

app = FastAPI(title=settings.app_name)
rabbitmq_service = RabbitMQService()


@app.on_event('startup')
async def on_startup():
    Base.metadata.create_all(bind=engine)
    await rabbitmq_service.connect()
    await start_consumer(rabbitmq_service)


@app.on_event('shutdown')
async def on_shutdown():
    await rabbitmq_service.close()


app.include_router(get_router(rabbitmq_service), prefix='/api/v1', tags=['middleware'])
