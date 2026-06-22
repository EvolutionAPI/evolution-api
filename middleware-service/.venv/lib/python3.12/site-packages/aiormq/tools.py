import asyncio
import platform
import time
from functools import wraps
from types import TracebackType
from typing import (
    Any, AsyncContextManager, Awaitable, Callable, Coroutine, Optional, Type,
    TypeVar, Union,
)

from yarl import URL

from aiormq.abc import TimeoutType


T = TypeVar("T")


def censor_url(url: URL) -> URL:
    if url.password is not None:
        return url.with_password("******")
    return url


def shield(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
    @wraps(func)
    def wrap(*args: Any, **kwargs: Any) -> Awaitable[T]:
        return asyncio.shield(func(*args, **kwargs))

    return wrap


def awaitable(
    func: Callable[..., Union[T, Awaitable[T]]],
) -> Callable[..., Coroutine[Any, Any, T]]:
    # Avoid python 3.8+ warning
    if asyncio.iscoroutinefunction(func):
        return func     # type: ignore

    @wraps(func)
    async def wrap(*args: Any, **kwargs: Any) -> T:
        result = func(*args, **kwargs)

        if hasattr(result, "__await__"):
            return await result     # type: ignore
        if asyncio.iscoroutine(result) or asyncio.isfuture(result):
            return await result

        return result               # type: ignore

    return wrap


class Countdown:
    __slots__ = "loop", "deadline"

    if platform.system() == "Windows":
        @staticmethod
        def _now() -> float:
            # windows monotonic timer resolution is not enough.
            # Have to use time.time()
            return time.time()
    else:
        @staticmethod
        def _now() -> float:
            return time.monotonic()

    def __init__(self, timeout: TimeoutType = None):
        self.loop: asyncio.AbstractEventLoop = asyncio.get_event_loop()
        self.deadline: TimeoutType = None

        if timeout is not None:
            self.deadline = self._now() + timeout

    def get_timeout(self) -> TimeoutType:
        if self.deadline is None:
            return None

        current = self._now()
        if current >= self.deadline:
            raise asyncio.TimeoutError

        return self.deadline - current

    async def __call__(self, coro: Awaitable[T]) -> T:
        try:
            timeout = self.get_timeout()
        except asyncio.TimeoutError:
            fut = asyncio.ensure_future(coro)
            fut.cancel()
            await asyncio.gather(fut, return_exceptions=True)
            raise

        if self.deadline is None and not timeout:
            return await coro
        return await asyncio.wait_for(coro, timeout=timeout)

    def enter_context(
        self, ctx: AsyncContextManager[T],
    ) -> AsyncContextManager[T]:
        return CountdownContext(self, ctx)


class CountdownContext(AsyncContextManager):
    def __init__(self, countdown: Countdown, ctx: AsyncContextManager):
        self.countdown: Countdown = countdown
        self.ctx: AsyncContextManager = ctx

    async def __aenter__(self) -> T:
        return await self.countdown(self.ctx.__aenter__())

    async def __aexit__(
        self, exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException], exc_tb: Optional[TracebackType],
    ) -> Any:
        return await self.countdown(
            self.ctx.__aexit__(exc_type, exc_val, exc_tb),
        )
