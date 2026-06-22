import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    phone_number: str = Field(..., min_length=3, max_length=30)
    tenant_id: uuid.UUID
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, min_length=3, max_length=30)


class CustomerResponse(BaseModel):
    id: uuid.UUID
    phone_number: str
    name: str | None
    email: str | None
    tenant_id: uuid.UUID
    first_message_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}
