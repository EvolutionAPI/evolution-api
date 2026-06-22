import uuid

from sqlalchemy.orm import Session

from app.models.ticket_message import TicketMessage


class TicketMessageRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, ticket_id: uuid.UUID, content: str, from_whatsapp: bool = True) -> TicketMessage:
        msg = TicketMessage(ticket_id=ticket_id, content=content, from_whatsapp=from_whatsapp)
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return msg

    def list_by_ticket(self, ticket_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[TicketMessage]:
        return (
            self.db.query(TicketMessage)
            .filter(TicketMessage.ticket_id == ticket_id)
            .order_by(TicketMessage.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )
