import uuid
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.ticket import Ticket


class TicketRepository:
    def __init__(self, db: Session):
        self.db = db

    def next_ticket_number(self) -> str:
        prefix = 'INC-'
        count = (self.db.query(func.count(Ticket.id)).scalar() or 0) + 1
        return f'{prefix}{count:05d}'

    def create(
        self,
        tenant_id: uuid.UUID,
        customer_id: uuid.UUID,
        subject: str,
        description: str | None = None,
        category: str | None = None,
        source: str = 'whatsapp',
    ) -> Ticket:
        ticket = Ticket(
            ticket_number=self.next_ticket_number(),
            tenant_id=tenant_id,
            customer_id=customer_id,
            subject=subject,
            description=description,
            category=category,
            source=source,
        )
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def get(self, ticket_id: uuid.UUID) -> Ticket | None:
        return (
            self.db.query(Ticket)
            .options(joinedload(Ticket.customer), joinedload(Ticket.messages))
            .filter(Ticket.id == ticket_id, Ticket.deleted_at.is_(None))
            .first()
        )

    def get_by_number(self, ticket_number: str, tenant_id: uuid.UUID | None = None) -> Ticket | None:
        normalized = ticket_number.upper().lstrip('#')
        query = self.db.query(Ticket).filter(
            Ticket.ticket_number == normalized,
            Ticket.deleted_at.is_(None),
        )
        if tenant_id is not None:
            query = query.filter(Ticket.tenant_id == tenant_id)
        return query.first()

    def list_all(
        self,
        tenant_id: uuid.UUID | None = None,
        customer_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Ticket]:
        query = self.db.query(Ticket).filter(Ticket.deleted_at.is_(None))
        if tenant_id is not None:
            query = query.filter(Ticket.tenant_id == tenant_id)
        if customer_id is not None:
            query = query.filter(Ticket.customer_id == customer_id)
        if status:
            query = query.filter(Ticket.status == status)
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

    def find_recent_active_for_customer(self, customer_id: uuid.UUID, hours: int = 24) -> Ticket | None:
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
