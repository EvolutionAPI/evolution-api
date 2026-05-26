from typing import Any

from pydantic import BaseModel, Field


class IncomingEvent(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100)
    payload: dict[str, Any]


class PublishMessage(BaseModel):
    routing_key: str | None = None
    message: dict[str, Any]
