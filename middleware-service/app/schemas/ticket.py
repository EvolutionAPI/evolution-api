from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.customer import CustomerResponse
from app.schemas.ticket_comment import TicketCommentResponse


TICKET_STATUS_PATTERN = '^(open|in_progress|resolved|closed)$'


class TicketCreate(BaseModel):
    customer_phone_number: str = Field(..., min_length=3, max_length=30)
    subject: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    channel: str = Field(default='whatsapp', max_length=30)
    source_instance: str | None = Field(default=None, max_length=100)


class TicketUpdate(BaseModel):
    status: str | None = Field(default=None, pattern=TICKET_STATUS_PATTERN)
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    customer_id: int
    status: str
    channel: str
    subject: str
    description: str | None
    source_instance: str | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    deleted_at: datetime | None

    model_config = {'from_attributes': True}


class TicketDetailResponse(TicketResponse):
    customer: CustomerResponse
    comments: list[TicketCommentResponse] = []
