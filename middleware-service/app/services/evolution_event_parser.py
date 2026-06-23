import re
from typing import Any

from app.core.config import settings


def normalize_phone_number(value: str | None) -> str | None:
    if not value:
        return None
    phone = value.split('@', maxsplit=1)[0]
    phone = phone.split(':', maxsplit=1)[0]
    digits = re.sub(r'\D+', '', phone)
    return digits or None


class EvolutionEventParser:
    def parse_message(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        data = payload.get('data') if isinstance(payload.get('data'), dict) else payload
        key = data.get('key', {}) if isinstance(data.get('key'), dict) else {}
        message = data.get('message', {}) if isinstance(data.get('message'), dict) else {}

        text = self._extract_text(data, message)
        if not text:
            return None

        remote_jid = data.get('remoteJid') or data.get('chatId') or key.get('remoteJid')
        from_me = bool(data.get('fromMe') or key.get('fromMe'))
        participant = data.get('participant') or key.get('participant') or data.get('pushName')
        sender = data.get('sender') or data.get('from') or data.get('source')

        support_phone = normalize_phone_number(settings.support_whatsapp_number)
        remote_phone = normalize_phone_number(remote_jid)
        sender_phone = normalize_phone_number(sender or participant) or remote_phone

        author_type = 'support' if from_me or (support_phone and sender_phone == support_phone) else 'customer'
        customer_phone = remote_phone if author_type == 'support' else sender_phone
        author_phone = support_phone if author_type == 'support' and support_phone else sender_phone

        if not customer_phone or not author_phone:
            return None

        return {
            'text': text,
            'message_id': data.get('messageId') or data.get('id') or key.get('id'),
            'author_type': author_type,
            'author_phone_number': author_phone,
            'customer_phone_number': customer_phone,
            'recipient': remote_jid or customer_phone,
            'instance': payload.get('instance') or data.get('instance'),
        }

    def _extract_text(self, data: dict[str, Any], message: dict[str, Any]) -> str | None:
        candidates = [
            data.get('text'),
            data.get('body'),
            data.get('messageText'),
            data.get('conversation'),
            message.get('conversation'),
        ]

        extended_text = message.get('extendedTextMessage')
        if isinstance(extended_text, dict):
            candidates.append(extended_text.get('text'))

        image_message = message.get('imageMessage')
        if isinstance(image_message, dict):
            candidates.append(image_message.get('caption'))

        video_message = message.get('videoMessage')
        if isinstance(video_message, dict):
            candidates.append(video_message.get('caption'))

        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

        return None
