import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.customer import CustomerResponse
from app.schemas.ticket_message import TicketMessageResponse


TICKET_STATUSES = {'open', 'in_progress', 'resolved', 'closed'}


class TicketCreate(BaseModel):
    tenant_id: uuid.UUID
    customer_id: uuid.UUID
    subject: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    source: str = Field(default='whatsapp', max_length=50)


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = Field(default=None, max_length=50)
    category: str | None = Field(default=None, max_length=100)


class TicketResponse(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str | None
    status: str
    category: str | None
    source: str
    tenant_id: uuid.UUID
    customer_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    deleted_at: datetime | None

    model_config = {'from_attributes': True}


class TicketDetailResponse(TicketResponse):
    customer: CustomerResponse | None = None
    messages: list[TicketMessageResponse] = []
