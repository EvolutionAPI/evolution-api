import pickle
from typing import Any, Awaitable, Callable, TypeVar


T = TypeVar("T")
CallbackType = Callable[..., Awaitable[T]]


class Method:
    __slots__ = (
        "name",
        "func",
    )

    def __init__(self, name: str, func: Callable[..., Any]):
        self.name = name
        self.func = func

    def __getattr__(self, item: str) -> "Method":
        return Method(".".join((self.name, item)), func=self.func)

    def __call__(self, **kwargs: Any) -> Any:
        return self.func(self.name, kwargs=kwargs)


class Proxy:
    __slots__ = ("func",)

    def __init__(self, func: Callable[..., Any]):
        self.func = func

    def __getattr__(self, item: str) -> Method:
        return Method(item, self.func)


class Base:
    __slots__ = ()

    SERIALIZER = pickle
    CONTENT_TYPE = "application/python-pickle"

    def serialize(self, data: Any) -> bytes:
        """ Serialize data to the bytes.
        Uses `pickle` by default.
        You should overlap this method when you want to change serializer

        :param data: Data which will be serialized
        """
        return self.SERIALIZER.dumps(data)

    def deserialize(self, data: bytes) -> Any:
        """ Deserialize data from bytes.
        Uses `pickle` by default.
        You should overlap this method when you want to change serializer

        :param data: Data which will be deserialized
        """
        return self.SERIALIZER.loads(data)
