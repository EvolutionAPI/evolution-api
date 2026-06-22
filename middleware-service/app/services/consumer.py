import json
import logging

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.conversation_service import ConversationService
from app.services.evolution_api import EvolutionAPIService
from app.services.rabbitmq import RabbitMQService
from app.repositories import EventLogRepository

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

                data = payload.get('data') if isinstance(payload.get('data'), dict) else payload
                key = data.get('key', {}) if isinstance(data.get('key'), dict) else {}
                message_obj = data.get('message', {}) if isinstance(data.get('message'), dict) else {}

                text = _extract_text(data, message_obj)
                if not text:
                    return

                remote_jid = data.get('remoteJid') or data.get('chatId') or key.get('remoteJid')
                from_me = bool(data.get('fromMe') or key.get('fromMe'))
                if from_me:
                    return

                phone_number = _normalize_phone(remote_jid)
                instance_name = payload.get('instance') or data.get('instance')
                if not phone_number or not instance_name:
                    return

                reply_text = ConversationService(db).process_message(
                    instance_name=instance_name,
                    phone_number=phone_number,
                    text=text,
                )

                evo = EvolutionAPIService()
                try:
                    await evo.send_text_message(instance_name, phone_number, reply_text)
                except Exception as e:
                    logger.warning('Failed to send reply via Evolution API: %s', e)

                logger.info(
                    'Conversation processed: instance=%s phone=%s reply_len=%d',
                    instance_name, phone_number, len(reply_text),
                )
            except Exception as e:
                logger.error('Error processing RabbitMQ message: %s', e, exc_info=True)
            finally:
                db.close()

    await queue.consume(handle_message)
    logger.info('Consumer started on queue %s', settings.rabbitmq_queue_in)


def _normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    phone = value.split('@', maxsplit=1)[0]
    phone = phone.split(':', maxsplit=1)[0]
    digits = ''.join(c for c in phone if c.isdigit())
    return digits or None


def _extract_text(data: dict, message: dict) -> str | None:
    candidates = [
        data.get('text'),
        data.get('body'),
        data.get('messageText'),
        data.get('conversation'),
        message.get('conversation'),
    ]
    extended = message.get('extendedTextMessage')
    if isinstance(extended, dict):
        candidates.append(extended.get('text'))
    img = message.get('imageMessage')
    if isinstance(img, dict):
        candidates.append(img.get('caption'))
    vid = message.get('videoMessage')
    if isinstance(vid, dict):
        candidates.append(vid.get('caption'))
    for c in candidates:
        if isinstance(c, str) and c.strip():
            return c.strip()
    return None
