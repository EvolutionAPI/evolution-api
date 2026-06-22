import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SessionResponse(BaseModel):
    id: uuid.UUID
    phone_number: str
    tenant_id: uuid.UUID
    customer_id: uuid.UUID | None
    state: str
    ticket_draft: dict[str, Any] | None
    last_activity: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}
