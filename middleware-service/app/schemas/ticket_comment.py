import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TicketCommentCreate(BaseModel):
    message_text: str = Field(..., min_length=1)
    author_phone_number: str = Field(..., min_length=3, max_length=30)
    author_type: str = Field(..., pattern='^(customer|support|system)$')
    message_id: str | None = Field(default=None, max_length=120)
    channel: str = Field(default='whatsapp', max_length=30)


class TicketCommentUpdate(BaseModel):
    message_text: str = Field(..., min_length=1)


class TicketCommentResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_phone_number: str
    author_type: str
    message_text: str
    message_id: str | None
    channel: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = {'from_attributes': True}
