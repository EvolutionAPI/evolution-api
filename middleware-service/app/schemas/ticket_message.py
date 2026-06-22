import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TicketMessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    from_whatsapp: bool = True


class TicketMessageResponse(BaseModel):
    id: uuid.UUID
    content: str
    from_whatsapp: bool
    ticket_id: uuid.UUID
    created_at: datetime

    model_config = {'from_attributes': True}
