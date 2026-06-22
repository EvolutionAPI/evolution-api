import abc
from enum import Enum
from typing import Optional

from .abc import AbstractConnection


class AuthBase:
    value: Optional[str]

    def __init__(self, connector: AbstractConnection):
        self.connector = connector
        self.value = None

    @abc.abstractmethod
    def encode(self) -> str:
        raise NotImplementedError

    def marshal(self) -> str:
        if self.value is None:
            self.value = self.encode()
        return self.value


class PlainAuth(AuthBase):
    def encode(self) -> str:
        return (
            "\x00"
            + (self.connector.url.user or "guest")
            + "\x00"
            + (self.connector.url.password or "guest")
        )


class ExternalAuth(AuthBase):
    def encode(self) -> str:
        return ""


class AuthMechanism(Enum):
    PLAIN = PlainAuth
    EXTERNAL = ExternalAuth
