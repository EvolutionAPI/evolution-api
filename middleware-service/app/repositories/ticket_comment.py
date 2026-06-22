import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.ticket_comment import TicketComment


class TicketCommentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_message_id(self, message_id: str | None) -> TicketComment | None:
        if not message_id:
            return None
        return self.db.query(TicketComment).filter(TicketComment.message_id == message_id).first()

    def get(self, comment_id: uuid.UUID) -> TicketComment | None:
        return (
            self.db.query(TicketComment)
            .filter(TicketComment.id == comment_id, TicketComment.deleted_at.is_(None))
            .first()
        )

    def create(
        self,
        ticket_id: uuid.UUID,
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

    def list_by_ticket(self, ticket_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[TicketComment]:
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
