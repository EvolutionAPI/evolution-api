import logging

from fastapi import FastAPI

from app.api.routes import get_router
from app.core.config import settings
from app.db.session import Base, engine
from app.models.command_log import CommandLog  # noqa: F401
from app.models.customer import Customer  # noqa: F401
from app.models.event_log import EventLog  # noqa: F401
from app.models.instance_tenant import InstanceTenant  # noqa: F401
from app.models.tenant import Tenant  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.ticket_comment import TicketComment  # noqa: F401
from app.models.ticket_message import TicketMessage  # noqa: F401
from app.models.whatsapp_session import WhatsappSession  # noqa: F401
from app.db.session import SessionLocal
from app.services.bootstrap import bootstrap_default_instance
from app.services.consumer import start_consumer
from app.services.rabbitmq import RabbitMQService

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s - %(message)s')

app = FastAPI(title=settings.app_name)
rabbitmq_service = RabbitMQService()


@app.on_event('startup')
async def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        bootstrap_default_instance(db)
    finally:
        db.close()
    await rabbitmq_service.connect()
    await start_consumer(rabbitmq_service)


@app.on_event('shutdown')
async def on_shutdown():
    await rabbitmq_service.close()


app.include_router(get_router(rabbitmq_service), prefix='/api/v1', tags=['middleware'])
