import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class CommandLog(Base):
    __tablename__ = 'command_logs'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    source_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    command_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('tickets.id'), nullable=True, index=True)
    raw_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    parsed_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default='processed', index=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    ticket = relationship('Ticket', back_populates='command_logs')
