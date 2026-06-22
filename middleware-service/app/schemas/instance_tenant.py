import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class InstanceLinkCreate(BaseModel):
    instance_name: str = Field(..., min_length=1, max_length=255)
    tenant_id: uuid.UUID


class InstanceLinkResponse(BaseModel):
    id: uuid.UUID
    instance_name: str
    tenant_id: uuid.UUID
    created_at: datetime

    model_config = {'from_attributes': True}


class InstanceLinkDetailResponse(InstanceLinkResponse):
    tenant_name: str | None = None
