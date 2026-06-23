import json
import logging
import asyncio

from aio_pika import Channel, ExchangeType, Message, connect_robust

from app.core.config import settings

logger = logging.getLogger(__name__)


class RabbitMQService:
    def __init__(self):
        self.connection = None
        self.channel: Channel | None = None
        self.exchange = None

    async def connect(self):
        max_retries = 30
        retry_delay_seconds = 2

        for attempt in range(1, max_retries + 1):
            try:
                self.connection = await connect_robust(settings.rabbitmq_url)
                self.channel = await self.connection.channel()
                self.exchange = await self.channel.declare_exchange(
                    settings.rabbitmq_exchange,
                    ExchangeType.TOPIC,
                    durable=True,
                )

                queue_in = await self.channel.declare_queue(settings.rabbitmq_queue_in, durable=True)
                queue_out = await self.channel.declare_queue(settings.rabbitmq_queue_out, durable=True)

                await queue_in.bind(self.exchange, routing_key=settings.rabbitmq_routing_key_in)
                await queue_out.bind(self.exchange, routing_key=settings.rabbitmq_routing_key_out)

                logger.info('RabbitMQ connected and queues declared')
                return
            except Exception as error:
                logger.warning(
                    'RabbitMQ connection failed (attempt %s/%s): %s',
                    attempt,
                    max_retries,
                    error,
                )
                if attempt == max_retries:
                    raise
                await asyncio.sleep(retry_delay_seconds)

    async def publish(self, payload: dict, routing_key: str):
        if not self.exchange:
            raise RuntimeError('RabbitMQ exchange is not initialized')

        message = Message(
            body=json.dumps(payload, default=str).encode('utf-8'),
            content_type='application/json',
        )
        await self.exchange.publish(message, routing_key=routing_key)

    async def close(self):
        if self.connection:
            await self.connection.close()
