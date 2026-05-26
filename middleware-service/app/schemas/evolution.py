from pydantic import BaseModel


class RabbitMQInstanceConfig(BaseModel):
    enabled: bool = True
    events: list[str]
