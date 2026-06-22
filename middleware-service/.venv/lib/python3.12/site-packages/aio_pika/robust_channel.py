import asyncio
import warnings
from collections import defaultdict
from itertools import chain
from typing import Any, DefaultDict, Dict, MutableSet, Optional, Type, Union
from warnings import warn
from weakref import WeakSet

import aiormq

from .abc import (
    AbstractConnection, AbstractRobustChannel, AbstractRobustExchange,
    AbstractRobustQueue, TimeoutType,
)
from .channel import Channel
from .exchange import Exchange, ExchangeType
from .log import get_logger
from .queue import Queue
from .robust_exchange import RobustExchange
from .robust_queue import RobustQueue
from .tools import CallbackCollection


log = get_logger(__name__)


class RobustChannel(Channel, AbstractRobustChannel):    # type: ignore
    """ Channel abstraction """

    QUEUE_CLASS: Type[Queue] = RobustQueue
    EXCHANGE_CLASS: Type[Exchange] = RobustExchange

    RESTORE_RETRY_DELAY: int = 2

    _exchanges: DefaultDict[str, MutableSet[AbstractRobustExchange]]
    _queues: DefaultDict[str, MutableSet[RobustQueue]]
    default_exchange: RobustExchange

    def __init__(
        self,
        connection: AbstractConnection,
        channel_number: Optional[int] = None,
        publisher_confirms: bool = True,
        on_return_raises: bool = False,
    ):
        """

        :param connection: :class:`aio_pika.adapter.AsyncioConnection` instance
        :param loop:
            Event loop (:func:`asyncio.get_event_loop()` when :class:`None`)
        :param future_store: :class:`aio_pika.common.FutureStore` instance
        :param publisher_confirms:
            False if you don't need delivery confirmations
            (in pursuit of performance)
        """

        super().__init__(
            connection=connection,
            channel_number=channel_number,
            publisher_confirms=publisher_confirms,
            on_return_raises=on_return_raises,
        )

        self._exchanges = defaultdict(WeakSet)
        self._queues = defaultdict(WeakSet)
        self._prefetch_count: int = 0
        self._prefetch_size: int = 0
        self._global_qos: bool = False
        self.reopen_callbacks = CallbackCollection(self)
        self.__restore_lock = asyncio.Lock()
        self.__restored = asyncio.Event()

        self.close_callbacks.remove(self._set_closed_callback)

    async def ready(self) -> None:
        await self._connection.ready()
        await self.__restored.wait()

    async def get_underlay_channel(self) -> aiormq.abc.AbstractChannel:
        await self._connection.ready()
        return await super().get_underlay_channel()

    async def restore(self, channel: Any = None) -> None:
        if channel is not None:
            warnings.warn(
                "Channel argument will be ignored because you "
                "don't need to pass this anymore.",
                DeprecationWarning,
            )

        async with self.__restore_lock:
            if self.__restored.is_set():
                return

            await self.reopen()
            self.__restored.set()

    async def _on_close(
        self,
        closing: asyncio.Future
    ) -> Optional[BaseException]:
        exc = await super()._on_close(closing)

        if isinstance(exc, asyncio.CancelledError):
            # This happens only if the channel is forced to close from the
            # outside, for example, if the connection is closed.
            # Of course, here you need to exit from this function
            # as soon as possible and to avoid a recovery attempt.
            self.__restored.clear()
            if not self._closed.done():
                self._closed.set_result(True)
            return exc

        in_restore_state = not self.__restored.is_set()
        self.__restored.clear()

        if self._closed.done() or in_restore_state:
            return exc

        await self.restore()

        return exc

    async def close(
        self,
        exc: Optional[aiormq.abc.ExceptionType] = None,
    ) -> None:
        # Avoid recovery when channel is explicitely closed using this method
        self.__restored.clear()
        await super().close(exc)

    async def reopen(self) -> None:
        await super().reopen()
        await self.reopen_callbacks()

    async def _on_open(self) -> None:
        if not hasattr(self, "default_exchange"):
            await super()._on_open()

        exchanges = tuple(chain(*self._exchanges.values()))
        queues = tuple(chain(*self._queues.values()))
        channel = await self.get_underlay_channel()

        await channel.basic_qos(
            prefetch_count=self._prefetch_count,
            prefetch_size=self._prefetch_size,
        )

        for exchange in exchanges:
            await exchange.restore()

        for queue in queues:
            await queue.restore()

        if hasattr(self, "default_exchange"):
            self.default_exchange.channel = self

        self.__restored.set()

    async def set_qos(
        self,
        prefetch_count: int = 0,
        prefetch_size: int = 0,
        global_: bool = False,
        timeout: TimeoutType = None,
        all_channels: Optional[bool] = None,
    ) -> aiormq.spec.Basic.QosOk:
        if all_channels is not None:
            warn('Use "global_" instead of "all_channels"', DeprecationWarning)
            global_ = all_channels

        await self.ready()

        self._prefetch_count = prefetch_count
        self._prefetch_size = prefetch_size
        self._global_qos = global_

        return await super().set_qos(
            prefetch_count=prefetch_count,
            prefetch_size=prefetch_size,
            global_=global_,
            timeout=timeout,
        )

    async def declare_exchange(
        self,
        name: str,
        type: Union[ExchangeType, str] = ExchangeType.DIRECT,
        durable: bool = False,
        auto_delete: bool = False,
        internal: bool = False,
        passive: bool = False,
        arguments: Optional[Dict[str, Any]] = None,
        timeout: TimeoutType = None,
        robust: bool = True,
    ) -> AbstractRobustExchange:
        await self.ready()
        exchange = (
            await super().declare_exchange(
                name=name,
                type=type,
                durable=durable,
                auto_delete=auto_delete,
                internal=internal,
                passive=passive,
                arguments=arguments,
                timeout=timeout,
            )
        )

        if not internal and robust:
            # noinspection PyTypeChecker
            self._exchanges[name].add(exchange)     # type: ignore

        return exchange     # type: ignore

    async def exchange_delete(
        self,
        exchange_name: str,
        timeout: TimeoutType = None,
        if_unused: bool = False,
        nowait: bool = False,
    ) -> aiormq.spec.Exchange.DeleteOk:
        await self.ready()
        result = await super().exchange_delete(
            exchange_name=exchange_name,
            timeout=timeout,
            if_unused=if_unused,
            nowait=nowait,
        )
        self._exchanges.pop(exchange_name, None)
        return result

    async def declare_queue(
        self,
        name: Optional[str] = None,
        *,
        durable: bool = False,
        exclusive: bool = False,
        passive: bool = False,
        auto_delete: bool = False,
        arguments: Optional[Dict[str, Any]] = None,
        timeout: TimeoutType = None,
        robust: bool = True,
    ) -> AbstractRobustQueue:
        await self.ready()
        queue: RobustQueue = await super().declare_queue(   # type: ignore
            name=name,
            durable=durable,
            exclusive=exclusive,
            passive=passive,
            auto_delete=auto_delete,
            arguments=arguments,
            timeout=timeout,
        )
        if robust:
            self._queues[queue.name].add(queue)
        return queue

    async def queue_delete(
        self,
        queue_name: str,
        timeout: TimeoutType = None,
        if_unused: bool = False,
        if_empty: bool = False,
        nowait: bool = False,
    ) -> aiormq.spec.Queue.DeleteOk:
        await self.ready()
        result = await super().queue_delete(
            queue_name=queue_name,
            timeout=timeout,
            if_unused=if_unused,
            if_empty=if_empty,
            nowait=nowait,
        )
        self._queues.pop(queue_name, None)
        return result


__all__ = ("RobustChannel",)
