import json
import logging

from app.db.session import SessionLocal
from app.core.config import settings
from app.services.repository import EventLogRepository
from app.services.rabbitmq import RabbitMQService

logger = logging.getLogger(__name__)


async def start_consumer(rabbitmq: RabbitMQService):
    if not rabbitmq.channel:
        raise RuntimeError('RabbitMQ channel is not initialized')

    queue = await rabbitmq.channel.declare_queue(settings.rabbitmq_queue_in, durable=True)

    async def handle_message(message):
        async with message.process():
            body = json.loads(message.body.decode('utf-8'))
            event_type = body.get('event') or message.routing_key or 'unknown'

            db = SessionLocal()
            try:
                repo = EventLogRepository(db)
                repo.create(
                    source='evolution-rabbitmq',
                    event_type=event_type,
                    payload=body,
                    status='consumed',
                )
            finally:
                db.close()

            logger.info(
                'Message consumed from queue=%s routing_key=%s event=%s',
                settings.rabbitmq_queue_in,
                message.routing_key,
                event_type,
            )

    await queue.consume(handle_message)
    logger.info('Consumer started on queue %s', settings.rabbitmq_queue_in)
