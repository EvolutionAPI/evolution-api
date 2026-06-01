from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TicketComment(Base):
    __tablename__ = 'ticket_comments'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), nullable=False, index=True)
    author_phone_number: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    author_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    message_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True, index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False, default='whatsapp', index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    ticket = relationship('Ticket', back_populates='comments')
