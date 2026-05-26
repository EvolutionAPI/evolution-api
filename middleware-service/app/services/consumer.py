import json
import logging

from app.core.config import settings
from app.services.rabbitmq import RabbitMQService

logger = logging.getLogger(__name__)


async def start_consumer(rabbitmq: RabbitMQService):
    if not rabbitmq.channel:
        raise RuntimeError('RabbitMQ channel is not initialized')

    queue = await rabbitmq.channel.declare_queue(settings.rabbitmq_queue_in, durable=True)

    async def handle_message(message):
        async with message.process():
            body = json.loads(message.body.decode('utf-8'))
            logger.info('Message received from queue %s: %s', settings.rabbitmq_queue_in, body)

    await queue.consume(handle_message)
    logger.info('Consumer started on queue %s', settings.rabbitmq_queue_in)
