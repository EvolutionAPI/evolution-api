from app.core.config import settings
from app.models.ticket import Ticket
from app.models.ticket_comment import TicketComment
from app.services.rabbitmq import RabbitMQService


class TicketEventPublisher:
    def __init__(self, rabbitmq: RabbitMQService):
        self.rabbitmq = rabbitmq

    async def ticket_created(self, ticket: Ticket):
        await self.publish(
            'ticket.created',
            {
                'ticket_id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'customer_id': ticket.customer_id,
                'tenant_id': ticket.tenant_id,
                'status': ticket.status,
                'channel': ticket.source,
                'subject': ticket.subject,
            },
        )

    async def comment_added(self, ticket: Ticket, comment: TicketComment):
        await self.publish(
            'ticket.comment_added',
            {
                'ticket_id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'comment_id': comment.id,
                'author_type': comment.author_type,
                'author_phone_number': comment.author_phone_number,
                'message_text': comment.message_text,
            },
        )

    async def status_changed(self, ticket: Ticket):
        await self.publish(
            'ticket.status_changed',
            {
                'ticket_id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'tenant_id': ticket.tenant_id,
                'status': ticket.status,
            },
        )

    async def publish(self, event_type: str, payload: dict):
        await self.rabbitmq.publish(
            payload={'source': 'ticketing', 'event_type': event_type, 'payload': payload},
            routing_key=settings.rabbitmq_routing_key_out,
        )
