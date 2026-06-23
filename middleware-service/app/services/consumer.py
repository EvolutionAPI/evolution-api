import json
import logging

from app.core.config import settings
from app.db.session import SessionLocal
from app.repositories import EventLogRepository
from app.services.conversation_service import ConversationService
from app.services.evolution_api import EvolutionAPIService
from app.services.evolution_event_parser import EvolutionEventParser
from app.services.rabbitmq import RabbitMQService

logger = logging.getLogger(__name__)


async def start_consumer(rabbitmq: RabbitMQService):
    if not rabbitmq.channel:
        raise RuntimeError('RabbitMQ channel is not initialized')

    queue = await rabbitmq.channel.declare_queue(settings.rabbitmq_queue_in, durable=True)
    parser = EvolutionEventParser()

    async def handle_message(message):
        async with message.process():
            body = json.loads(message.body.decode('utf-8'))
            event_type = body.get('event') or body.get('event_type') or message.routing_key or 'unknown'
            payload = body.get('payload') if isinstance(body.get('payload'), dict) else body

            db = SessionLocal()
            try:
                EventLogRepository(db).create(
                    source='evolution-rabbitmq',
                    event_type=event_type,
                    payload=body,
                    status='consumed',
                )

                parsed = parser.parse_message(payload)
                if not parsed or parsed['author_type'] != 'customer':
                    return

                instance_name = parsed.get('instance')
                if not instance_name:
                    logger.warning('Ignoring Evolution message without instance: %s', parsed.get('message_id'))
                    return

                reply_text = ConversationService(db).process_message(
                    instance_name=instance_name,
                    phone_number=parsed['customer_phone_number'],
                    text=parsed['text'],
                    message_id=parsed.get('message_id'),
                )

                evo = EvolutionAPIService()
                try:
                    await evo.send_text_message(instance_name, parsed.get('recipient') or parsed['customer_phone_number'], reply_text)
                except Exception as e:
                    logger.warning('Failed to send reply via Evolution API: %s', e)

                logger.info(
                    'Conversation processed: instance=%s phone=%s reply_len=%d',
                    instance_name, parsed['customer_phone_number'], len(reply_text),
                )
            except Exception as e:
                logger.error('Error processing RabbitMQ message: %s', e, exc_info=True)
            finally:
                db.close()

    await queue.consume(handle_message)
    logger.info('Consumer started on queue %s', settings.rabbitmq_queue_in)
