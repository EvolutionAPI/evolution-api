from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.command_log import CommandLog
from app.models.customer import Customer
from app.models.ticket import Ticket
from app.models.ticket_comment import TicketComment


class CustomerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_phone(self, phone_number: str) -> Customer | None:
        return self.db.query(Customer).filter(Customer.phone_number == phone_number).first()

    def get_or_create(self, phone_number: str, external_customer_id: str | None = None) -> Customer:
        customer = self.get_by_phone(phone_number)
        if customer:
            return customer

        customer = Customer(phone_number=phone_number, external_customer_id=external_customer_id)
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def list(self, limit: int = 50, offset: int = 0) -> list[Customer]:
        return self.db.query(Customer).order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()


class TicketRepository:
    def __init__(self, db: Session):
        self.db = db

    def next_ticket_number(self) -> str:
        next_id = (self.db.query(func.max(Ticket.id)).scalar() or 0) + 1
        return f'TKT-{next_id:06d}'

    def create(
        self,
        customer_id: int,
        subject: str,
        description: str | None = None,
        channel: str = 'whatsapp',
        source_instance: str | None = None,
    ) -> Ticket:
        ticket = Ticket(
            ticket_number=self.next_ticket_number(),
            customer_id=customer_id,
            subject=subject,
            description=description,
            channel=channel,
            source_instance=source_instance,
        )
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def get(self, ticket_id: int) -> Ticket | None:
        return (
            self.db.query(Ticket)
            .options(joinedload(Ticket.customer), joinedload(Ticket.comments))
            .filter(Ticket.id == ticket_id, Ticket.deleted_at.is_(None))
            .first()
        )

    def get_by_number(self, ticket_number: str) -> Ticket | None:
        normalized = ticket_number.upper().lstrip('#')
        return (
            self.db.query(Ticket)
            .filter(Ticket.ticket_number == normalized, Ticket.deleted_at.is_(None))
            .first()
        )

    def list(
        self,
        status: str | None = None,
        customer_id: int | None = None,
        customer_phone_number: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Ticket]:
        query = self.db.query(Ticket).filter(Ticket.deleted_at.is_(None))

        if status:
            query = query.filter(Ticket.status == status)
        if customer_id:
            query = query.filter(Ticket.customer_id == customer_id)
        if customer_phone_number:
            query = query.join(Customer).filter(Customer.phone_number == customer_phone_number)

        return query.order_by(Ticket.created_at.desc()).offset(offset).limit(limit).all()

    def update(self, ticket: Ticket, **values) -> Ticket:
        for key, value in values.items():
            if value is not None:
                setattr(ticket, key, value)

        if values.get('status') == 'closed' and not ticket.closed_at:
            ticket.closed_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def soft_delete(self, ticket: Ticket) -> Ticket:
        ticket.deleted_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def find_recent_active_for_customer(self, customer_id: int, hours: int = 24) -> Ticket | None:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return (
            self.db.query(Ticket)
            .filter(
                Ticket.customer_id == customer_id,
                Ticket.deleted_at.is_(None),
                Ticket.status.in_(('open', 'in_progress')),
                Ticket.updated_at >= cutoff,
            )
            .order_by(Ticket.updated_at.desc())
            .first()
        )


class TicketCommentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_message_id(self, message_id: str | None) -> TicketComment | None:
        if not message_id:
            return None
        return self.db.query(TicketComment).filter(TicketComment.message_id == message_id).first()

    def get(self, comment_id: int) -> TicketComment | None:
        return (
            self.db.query(TicketComment)
            .filter(TicketComment.id == comment_id, TicketComment.deleted_at.is_(None))
            .first()
        )

    def create(
        self,
        ticket_id: int,
        author_phone_number: str,
        author_type: str,
        message_text: str,
        message_id: str | None = None,
        channel: str = 'whatsapp',
    ) -> TicketComment:
        existing = self.get_by_message_id(message_id)
        if existing:
            return existing

        comment = TicketComment(
            ticket_id=ticket_id,
            author_phone_number=author_phone_number,
            author_type=author_type,
            message_text=message_text,
            message_id=message_id,
            channel=channel,
        )
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def list_by_ticket(self, ticket_id: int, limit: int = 50, offset: int = 0) -> list[TicketComment]:
        return (
            self.db.query(TicketComment)
            .filter(TicketComment.ticket_id == ticket_id, TicketComment.deleted_at.is_(None))
            .order_by(TicketComment.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def update(self, comment: TicketComment, message_text: str) -> TicketComment:
        comment.message_text = message_text
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def soft_delete(self, comment: TicketComment) -> TicketComment:
        comment.deleted_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(comment)
        return comment


class CommandLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        command_type: str,
        raw_text: str,
        parsed_payload: dict,
        source_message_id: str | None = None,
        ticket_id: int | None = None,
        status: str = 'processed',
        error_message: str | None = None,
    ) -> CommandLog:
        log = CommandLog(
            source_message_id=source_message_id,
            command_type=command_type,
            ticket_id=ticket_id,
            raw_text=raw_text,
            parsed_payload=parsed_payload,
            status=status,
            error_message=error_message,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log
