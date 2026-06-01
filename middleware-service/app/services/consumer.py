import json
import logging

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.rabbitmq import RabbitMQService
from app.services.repository import EventLogRepository
from app.services.ticket_event_publisher import TicketEventPublisher
from app.services.ticket_pipeline import publish_ticket_result, summarize_ticket_result
from app.services.ticket_service import TicketService

logger = logging.getLogger(__name__)


async def start_consumer(rabbitmq: RabbitMQService):
    if not rabbitmq.channel:
        raise RuntimeError('RabbitMQ channel is not initialized')

    queue = await rabbitmq.channel.declare_queue(settings.rabbitmq_queue_in, durable=True)

    async def handle_message(message):
        async with message.process():
            body = json.loads(message.body.decode('utf-8'))
            event_type = body.get('event') or body.get('event_type') or message.routing_key or 'unknown'
            payload = body.get('payload') if isinstance(body.get('payload'), dict) else body

            db = SessionLocal()
            try:
                repo = EventLogRepository(db)
                repo.create(
                    source='evolution-rabbitmq',
                    event_type=event_type,
                    payload=body,
                    status='consumed',
                )

                ticket_result = TicketService(db).process_evolution_payload(payload)
                if ticket_result:
                    await publish_ticket_result(TicketEventPublisher(rabbitmq), ticket_result)
            finally:
                db.close()

            logger.info(
                'Message consumed from queue=%s routing_key=%s event=%s ticket_result=%s',
                settings.rabbitmq_queue_in,
                message.routing_key,
                event_type,
                summarize_ticket_result(ticket_result) if 'ticket_result' in locals() else None,
            )

    await queue.consume(handle_message)
    logger.info('Consumer started on queue %s', settings.rabbitmq_queue_in)
