import re
from dataclasses import dataclass


TICKET_NUMBER_PATTERN = re.compile(r'#?(TKT-\d+)', re.IGNORECASE)
VALID_STATUSES = {'open', 'in_progress', 'resolved', 'closed'}


@dataclass(frozen=True)
class ParsedCommand:
    command_type: str
    args: dict
    raw_text: str


class CommandParserService:
    def parse(self, text: str | None) -> ParsedCommand | None:
        if not text:
            return None

        raw_text = text.strip()
        if not raw_text.startswith('#'):
            return None

        command, _, remainder = raw_text.partition(' ')
        command = command.lower()
        remainder = remainder.strip()

        if command == '#create_ticket':
            return ParsedCommand(command_type='create_ticket', args=self._parse_create_ticket(remainder), raw_text=raw_text)

        if command == '#add_comment':
            ticket_number, message = self._extract_ticket_number(remainder)
            return ParsedCommand(
                command_type='add_comment',
                args={'ticket_number': ticket_number, 'message_text': message.strip()},
                raw_text=raw_text,
            )

        if command == '#list_my_tickets':
            return ParsedCommand(command_type='list_my_tickets', args={}, raw_text=raw_text)

        if command in {'#close_ticket', '#close'}:
            ticket_number, _ = self._extract_ticket_number(remainder)
            return ParsedCommand(command_type='close_ticket', args={'ticket_number': ticket_number}, raw_text=raw_text)

        if command == '#status':
            ticket_number, status_text = self._extract_ticket_number(remainder)
            status = self._normalize_status(status_text)
            return ParsedCommand(
                command_type='status',
                args={'ticket_number': ticket_number, 'status': status},
                raw_text=raw_text,
            )

        return ParsedCommand(command_type='unknown', args={'command': command, 'text': remainder}, raw_text=raw_text)

    def _parse_create_ticket(self, text: str) -> dict:
        subject, separator, description = text.partition('|')
        subject = subject.strip() or 'WhatsApp support request'
        return {'subject': subject[:200], 'description': description.strip() if separator else text.strip()}

    def _extract_ticket_number(self, text: str) -> tuple[str | None, str]:
        match = TICKET_NUMBER_PATTERN.search(text)
        if not match:
            return None, text

        ticket_number = match.group(1).upper()
        remaining = (text[: match.start()] + text[match.end() :]).strip()
        return ticket_number, remaining

    def _normalize_status(self, text: str) -> str | None:
        status = text.strip().lower().replace('-', '_').replace(' ', '_')
        return status if status in VALID_STATUSES else None
