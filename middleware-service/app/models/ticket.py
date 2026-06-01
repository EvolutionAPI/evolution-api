from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Ticket(Base):
    __tablename__ = 'tickets'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_number: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey('customers.id'), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default='open', index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False, default='whatsapp', index=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_instance: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    customer = relationship('Customer', back_populates='tickets')
    comments = relationship('TicketComment', back_populates='ticket')
    command_logs = relationship('CommandLog', back_populates='ticket')
