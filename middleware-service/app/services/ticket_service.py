import uuid
import re

from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.models.ticket_comment import TicketComment
from app.schemas.ticket import TicketCreate, TicketUpdate
from app.schemas.ticket_comment import TicketCommentCreate
from app.services.command_parser import CommandParserService, ParsedCommand
from app.services.evolution_event_parser import EvolutionEventParser
from app.repositories import (
    CommandLogRepository,
    CustomerRepository,
    TicketCommentRepository,
    TicketRepository,
)


ACTIVE_STATUSES = {'open', 'in_progress'}


class TicketService:
    def __init__(self, db: Session):
        self.db = db
        self.customers = CustomerRepository(db)
        self.tickets = TicketRepository(db)
        self.comments = TicketCommentRepository(db)
        self.command_logs = CommandLogRepository(db)
        self.command_parser = CommandParserService()
        self.event_parser = EvolutionEventParser()

    def create_ticket(self, data: TicketCreate) -> Ticket:
        return self.tickets.create(
            tenant_id=data.tenant_id,
            customer_id=data.customer_id,
            subject=data.subject,
            description=data.description,
            category=data.category,
            source=data.source or 'whatsapp',
        )

    def update_ticket(self, ticket_id: uuid.UUID, data: TicketUpdate) -> Ticket | None:
        ticket = self.tickets.get(ticket_id)
        if not ticket:
            return None
        values = data.model_dump(exclude_unset=True)
        return self.tickets.update(ticket, **values)

    def add_comment(self, ticket_id: uuid.UUID, data: TicketCommentCreate) -> TicketComment | None:
        ticket = self.tickets.get(ticket_id)
        if not ticket:
            return None
        comment = self.comments.create(ticket_id=ticket.id, **data.model_dump())
        if ticket.status == 'open' and data.author_type == 'support':
            self.tickets.update(ticket, status='in_progress')
        return comment

    def soft_delete_ticket(self, ticket_id: uuid.UUID) -> Ticket | None:
        ticket = self.tickets.get(ticket_id)
        if not ticket:
            return None
        return self.tickets.soft_delete(ticket)

    def process_evolution_payload(self, payload: dict) -> dict | None:
        message = self.event_parser.parse_message(payload)
        if not message:
            return None

        customer_phone = message['customer_phone_number']
        instance_name = message.get('instance', '')
        tenant_id = self._resolve_tenant_id(instance_name)
        if not tenant_id:
            return None

        customer = self.customers.get_or_create(customer_phone, tenant_id)
        command = self.command_parser.parse(message['text'])

        if command:
            return self._process_command(command, customer.id, message, tenant_id)

        return self._process_non_command(customer.id, message)

    def _resolve_tenant_id(self, instance_name: str) -> uuid.UUID | None:
        from app.models.instance_tenant import InstanceTenant
        link = self.db.query(InstanceTenant).filter(InstanceTenant.instance_name == instance_name).first()
        return link.tenant_id if link else None

    def _process_command(self, command: ParsedCommand, customer_id: uuid.UUID, message: dict, tenant_id: uuid.UUID) -> dict:
        ticket: Ticket | None = None
        command_status = 'processed'
        error_message = None

        try:
            if command.command_type == 'create_ticket':
                ticket = self.tickets.create(
                    tenant_id=tenant_id,
                    customer_id=customer_id,
                    subject=command.args['subject'],
                    description=command.args.get('description'),
                    source='whatsapp',
                )
                comment = self.comments.create(
                    ticket_id=ticket.id,
                    author_phone_number=message['author_phone_number'],
                    author_type=message['author_type'],
                    message_text=command.args.get('description') or command.args['subject'],
                    message_id=message.get('message_id'),
                )
                result = {'action': 'ticket_created', 'ticket': ticket, 'comment': comment}

            elif command.command_type == 'add_comment':
                ticket = self._resolve_ticket(command.args.get('ticket_number'), customer_id, tenant_id)
                self._ensure_ticket(ticket, 'No active ticket found for comment')
                comment = self.comments.create(
                    ticket_id=ticket.id,
                    author_phone_number=message['author_phone_number'],
                    author_type=message['author_type'],
                    message_text=command.args['message_text'],
                    message_id=message.get('message_id'),
                )
                if ticket.status == 'open' and message['author_type'] == 'support':
                    ticket = self.tickets.update(ticket, status='in_progress')
                result = {'action': 'comment_added', 'ticket': ticket, 'comment': comment}

            elif command.command_type == 'close_ticket':
                ticket = self._resolve_ticket(command.args.get('ticket_number'), customer_id, tenant_id)
                self._ensure_ticket(ticket, 'No active ticket found to close')
                ticket = self.tickets.update(ticket, status='closed')
                result = {'action': 'ticket_closed', 'ticket': ticket}

            elif command.command_type == 'status':
                ticket = self._resolve_ticket(command.args.get('ticket_number'), customer_id, tenant_id)
                self._ensure_ticket(ticket, 'No ticket found for status update')
                if not command.args.get('status'):
                    raise ValueError('Invalid status. Use open, in_progress, resolved, or closed')
                ticket = self.tickets.update(ticket, status=command.args['status'])
                result = {'action': 'status_changed', 'ticket': ticket}

            elif command.command_type == 'list_my_tickets':
                tickets = self.tickets.list_all(customer_id=customer_id, limit=10)
                result = {'action': 'tickets_listed', 'tickets': tickets}

            else:
                raise ValueError(f'Unknown command: {command.args.get("command")}')

        except Exception as error:
            command_status = 'failed'
            error_message = str(error)
            result = {'action': 'command_failed', 'error': error_message}

        self.command_logs.create(
            command_type=command.command_type,
            raw_text=command.raw_text,
            parsed_payload=command.args,
            source_message_id=message.get('message_id'),
            ticket_id=ticket.id if ticket else None,
            status=command_status,
            error_message=error_message,
        )
        return result

    def _process_non_command(self, customer_id: uuid.UUID, message: dict) -> dict:
        ticket = self.tickets.find_recent_active_for_customer(customer_id)
        if not ticket:
            return {'action': 'ignored', 'reason': 'No command or active ticket found'}
        comment = self.comments.create(
            ticket_id=ticket.id,
            author_phone_number=message['author_phone_number'],
            author_type=message['author_type'],
            message_text=message['text'],
            message_id=message.get('message_id'),
        )
        return {'action': 'comment_added', 'ticket': ticket, 'comment': comment}

    def _resolve_ticket(self, ticket_number: str | None, customer_id: uuid.UUID, tenant_id: uuid.UUID | None = None) -> Ticket | None:
        if ticket_number:
            return self.tickets.get_by_number(ticket_number, tenant_id)
        return self.tickets.find_recent_active_for_customer(customer_id)

    def _ensure_ticket(self, ticket: Ticket | None, message: str):
        if not ticket:
            raise ValueError(message)
