import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}
