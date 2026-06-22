from __future__ import annotations

import asyncio
import inspect
import warnings
from functools import wraps
from itertools import chain
from threading import Lock
from typing import (
    AbstractSet, Any, Awaitable, Callable, Coroutine, Generator, Iterator,
    List,
    MutableSet, Optional, TypeVar, Union, Generic,
)

from weakref import ReferenceType, WeakSet, ref

from aio_pika.log import get_logger


try:
    from typing import ParamSpec, Protocol
except ImportError:
    from typing_extensions import ParamSpec, Protocol   # type: ignore


log = get_logger(__name__)
T = TypeVar("T")


def iscoroutinepartial(fn: Callable[..., Any]) -> bool:
    """
    Use Python 3.8's inspect.iscoroutinefunction() instead
    """
    warnings.warn(
        "Use inspect.iscoroutinefunction() instead.", DeprecationWarning
    )
    return asyncio.iscoroutinefunction(fn)


def _task_done(future: asyncio.Future) -> None:
    try:
        exc = future.exception()
        if exc is not None:
            raise exc
    except asyncio.CancelledError:
        pass


def create_task(
    func: Callable[..., Union[Coroutine[Any, Any, T], Awaitable[T]]],
    *args: Any,
    loop: Optional[asyncio.AbstractEventLoop] = None,
    **kwargs: Any,
) -> Awaitable[T]:
    loop = loop or asyncio.get_event_loop()

    if inspect.iscoroutinefunction(func):
        task = loop.create_task(func(*args, **kwargs))
        task.add_done_callback(_task_done)
        return task

    def run(future: asyncio.Future) -> Optional[asyncio.Future]:
        if future.done():
            return None

        try:
            future.set_result(func(*args, **kwargs))
        except Exception as e:
            future.set_exception(e)

        return future

    future = loop.create_future()
    future.add_done_callback(_task_done)
    loop.call_soon(run, future)
    return future


_Sender = TypeVar("_Sender", contravariant=True)
_Params = ParamSpec("_Params")
_Return = TypeVar("_Return", covariant=True)


class CallbackType(Protocol[_Sender, _Params, _Return]):
    def __call__(
        self,
        __sender: Optional[_Sender],
        /,
        *args: _Params.args,
        **kwargs: _Params.kwargs,
    ) -> Union[_Return, Awaitable[_Return]]:
        ...


class StubAwaitable:
    __slots__ = ()

    def __await__(self) -> Generator[Any, Any, None]:
        yield


STUB_AWAITABLE = StubAwaitable()


class CallbackCollection(
    MutableSet[
        Union[
            CallbackType[_Sender, _Params, Any],
            "CallbackCollection[Any, _Params]",
        ],
    ],
    Generic[_Sender, _Params],
):
    __slots__ = (
        "__weakref__",
        "__sender",
        "__callbacks",
        "__weak_callbacks",
        "__lock",
    )

    def __init__(self, sender: Union[_Sender, ReferenceType[_Sender]]):
        self.__sender: ReferenceType
        if isinstance(sender, ReferenceType):
            self.__sender = sender
        else:
            self.__sender = ref(sender)

        self.__callbacks: CallbackSetType = set()
        self.__weak_callbacks: MutableSet[
            Union[
                CallbackType[_Sender, _Params, Any],
                CallbackCollection[Any, _Params],
            ],
        ] = WeakSet()
        self.__lock: Lock = Lock()

    def add(
        self,
        callback: Union[
            CallbackType[_Sender, _Params, Any],
            CallbackCollection[Any, _Params],
        ],
        weak: bool = False
    ) -> None:
        if self.is_frozen:
            raise RuntimeError("Collection frozen")
        if not callable(callback):
            raise ValueError("Callback is not callable")

        with self.__lock:
            if weak or isinstance(callback, CallbackCollection):
                self.__weak_callbacks.add(callback)
            else:
                self.__callbacks.add(callback)      # type: ignore

    def remove(
        self,
        callback: Union[
            CallbackType[_Sender, _Params, Any],
            CallbackCollection[Any, _Params],
        ],
    ) -> None:
        if self.is_frozen:
            raise RuntimeError("Collection frozen")

        with self.__lock:
            try:
                self.__callbacks.remove(callback)    # type: ignore
            except KeyError:
                self.__weak_callbacks.remove(callback)

    def discard(
        self,
        callback: Union[
            CallbackType[_Sender, _Params, Any],
            CallbackCollection[Any, _Params],
        ],
    ) -> None:
        if self.is_frozen:
            raise RuntimeError("Collection frozen")

        with self.__lock:
            if callback in self.__callbacks:
                self.__callbacks.remove(callback)    # type: ignore
            elif callback in self.__weak_callbacks:
                self.__weak_callbacks.remove(callback)

    def clear(self) -> None:
        if self.is_frozen:
            raise RuntimeError("Collection frozen")

        with self.__lock:
            self.__callbacks.clear()        # type: ignore
            self.__weak_callbacks.clear()

    @property
    def is_frozen(self) -> bool:
        return isinstance(self.__callbacks, frozenset)

    def freeze(self) -> None:
        if self.is_frozen:
            raise RuntimeError("Collection already frozen")

        with self.__lock:
            self.__callbacks = frozenset(self.__callbacks)
            self.__weak_callbacks = WeakSet(self.__weak_callbacks)

    def unfreeze(self) -> None:
        if not self.is_frozen:
            raise RuntimeError("Collection is not frozen")

        with self.__lock:
            self.__callbacks = set(self.__callbacks)
            self.__weak_callbacks = WeakSet(self.__weak_callbacks)

    def __contains__(self, x: object) -> bool:
        return x in self.__callbacks or x in self.__weak_callbacks

    def __len__(self) -> int:
        return len(self.__callbacks) + len(self.__weak_callbacks)

    def __iter__(self) -> Iterator[
        Union[
            CallbackType[_Sender, _Params, Any],
            CallbackCollection[_Sender, _Params],
        ],
    ]:
        return iter(chain(self.__callbacks, self.__weak_callbacks))

    def __bool__(self) -> bool:
        return bool(self.__callbacks) or bool(self.__weak_callbacks)

    def __copy__(self) -> CallbackCollection[_Sender, _Params]:
        instance = self.__class__(self.__sender)

        with self.__lock:
            for cb in self.__callbacks:
                instance.add(cb, weak=False)

            for cb in self.__weak_callbacks:
                instance.add(cb, weak=True)

        if self.is_frozen:
            instance.freeze()

        return instance

    def __call__(
        self,
        *args: _Params.args,
        **kwargs: _Params.kwargs,
    ) -> Awaitable[Any]:
        futures: List[asyncio.Future] = []

        with self.__lock:
            sender = self.__sender()

            for cb in self:
                try:
                    if isinstance(cb, CallbackCollection):
                        result = cb(*args, **kwargs)
                    else:
                        result = cb(sender, *args, **kwargs)
                    if inspect.isawaitable(result):
                        futures.append(asyncio.ensure_future(result))
                except Exception:
                    log.exception("Callback %r error", cb)

        if not futures:
            return STUB_AWAITABLE

        return asyncio.gather(*futures, return_exceptions=True)

    def __hash__(self) -> int:
        return id(self)


class OneShotCallback:
    __slots__ = ("loop", "finished", "__lock", "callback", "__task")

    def __init__(self, callback: Callable[..., Awaitable[T]]):
        self.callback: Callable[..., Awaitable[T]] = callback
        self.loop = asyncio.get_event_loop()
        self.finished: asyncio.Event = asyncio.Event()
        self.__lock: asyncio.Lock = asyncio.Lock()
        self.__task: Optional[asyncio.Future] = None

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}: cb={self.callback!r}>"

    def wait(self) -> Awaitable[Any]:
        try:
            return self.finished.wait()
        except asyncio.CancelledError:
            if self.__task is not None:
                self.__task.cancel()
            raise

    async def __task_inner(self, *args: Any, **kwargs: Any) -> None:
        async with self.__lock:
            if self.finished.is_set():
                return

            try:
                await self.callback(*args, **kwargs)
            finally:
                self.loop.call_soon(self.finished.set)
                del self.callback

    def __call__(self, *args: Any, **kwargs: Any) -> Awaitable[Any]:
        if self.finished.is_set() or self.__task is not None:
            return STUB_AWAITABLE

        self.__task = self.loop.create_task(
            self.__task_inner(*args, **kwargs),
        )
        return self.__task


def ensure_awaitable(
    func: Callable[_Params, Union[T, Awaitable[T]]],
) -> Callable[_Params, Awaitable[T]]:
    if inspect.iscoroutinefunction(func):
        return func

    if inspect.isfunction(func):
        warnings.warn(
            f"You probably registering the non-coroutine function {func!r}. "
            "This is deprecated and will be removed in future releases. "
            "Moreover, it can block the event loop",
            DeprecationWarning,
        )

    @wraps(func)
    async def wrapper(*args: _Params.args, **kwargs: _Params.kwargs) -> T:
        nonlocal func

        result = func(*args, **kwargs)
        if not hasattr(result, "__await__"):
            warnings.warn(
                f"Function {func!r} returned a non awaitable result."
                "This may be bad for performance or may blocks the "
                "event loop, you should pay attention to this. This "
                "warning is here in an attempt to maintain backwards "
                "compatibility and will simply be removed in "
                "future releases.",
                DeprecationWarning,
            )
            return result

        return await result

    return wrapper


CallbackSetType = AbstractSet[
    Union[
        CallbackType[_Sender, _Params, None],
        CallbackCollection[_Sender, _Params],
    ],
]


__all__ = (
    "CallbackCollection",
    "CallbackSetType",
    "CallbackType",
    "OneShotCallback",
    "create_task",
    "ensure_awaitable",
    "iscoroutinepartial",
)
