from datetime import datetime

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    phone_number: str = Field(..., min_length=3, max_length=30)
    external_customer_id: str | None = Field(default=None, max_length=100)


class CustomerResponse(BaseModel):
    id: int
    phone_number: str
    external_customer_id: str | None
    first_message_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}
