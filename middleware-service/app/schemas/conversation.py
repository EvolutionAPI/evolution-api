import uuid
from typing import Any

from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    instance_name: str = Field(..., min_length=1)
    phone_number: str = Field(..., min_length=3)
    text: str = Field(..., min_length=1)
    message_id: str | None = None
    push_name: str | None = None


class BotReply(BaseModel):
    instance_name: str
    phone_number: str
    text: str


class ConversationStateResponse(BaseModel):
    session_id: uuid.UUID
    phone_number: str
    tenant_id: uuid.UUID
    customer_id: uuid.UUID | None
    state: str
    ticket_draft: dict[str, Any] | None
    reply: str
