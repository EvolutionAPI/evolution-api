import asyncio
import dataclasses
import io
import logging
from abc import ABC, abstractmethod, abstractproperty
from types import TracebackType
from typing import (
    Any, Awaitable, Callable, Coroutine, Dict, Iterable, Optional, Set, Tuple,
    Type, Union,
)

import pamqp
from pamqp import commands as spec
from pamqp.base import Frame
from pamqp.body import ContentBody
from pamqp.commands import Basic, Channel, Confirm, Exchange, Queue, Tx
from pamqp.common import FieldArray, FieldTable, FieldValue
from pamqp.constants import REPLY_SUCCESS
from pamqp.header import ContentHeader
from pamqp.heartbeat import Heartbeat
from yarl import URL


ExceptionType = Union[BaseException, Type[BaseException]]


# noinspection PyShadowingNames
class TaskWrapper:
    __slots__ = "_exception", "task"

    _exception: Union[BaseException, Type[BaseException]]
    task: asyncio.Task

    def __init__(self, task: asyncio.Task):
        self.task = task
        self._exception = asyncio.CancelledError

    def throw(self, exception: ExceptionType) -> None:
        self._exception = exception
        self.task.cancel()

    async def __inner(self) -> Any:
        try:
            return await self.task
        except asyncio.CancelledError as e:
            raise self._exception from e

    def __await__(self, *args: Any, **kwargs: Any) -> Any:
        return self.__inner().__await__()

    def cancel(self) -> None:
        return self.throw(asyncio.CancelledError())

    def __getattr__(self, item: str) -> Any:
        return getattr(self.task, item)

    def __repr__(self) -> str:
        return "<%s: %s>" % (self.__class__.__name__, repr(self.task))


TaskType = Union[asyncio.Task, TaskWrapper]
CoroutineType = Coroutine[Any, None, Any]
GetResultType = Union[Basic.GetEmpty, Basic.GetOk]


@dataclasses.dataclass(frozen=True)
class DeliveredMessage:
    delivery: Union[spec.Basic.Deliver, spec.Basic.Return, GetResultType]
    header: ContentHeader
    body: bytes
    channel: "AbstractChannel"

    @property
    def routing_key(self) -> Optional[str]:
        if isinstance(
            self.delivery, (
                spec.Basic.Return,
                spec.Basic.GetOk,
                spec.Basic.Deliver,
            ),
        ):
            return self.delivery.routing_key
        return None

    @property
    def exchange(self) -> Optional[str]:
        if isinstance(
            self.delivery, (
                spec.Basic.Return,
                spec.Basic.GetOk,
                spec.Basic.Deliver,
            ),
        ):
            return self.delivery.exchange
        return None

    @property
    def delivery_tag(self) -> Optional[int]:
        if isinstance(
            self.delivery, (
                spec.Basic.GetOk,
                spec.Basic.Deliver,
            ),
        ):
            return self.delivery.delivery_tag
        return None

    @property
    def redelivered(self) -> Optional[bool]:
        if isinstance(
            self.delivery, (
                spec.Basic.GetOk,
                spec.Basic.Deliver,
            ),
        ):
            return self.delivery.redelivered
        return None

    @property
    def consumer_tag(self) -> Optional[str]:
        if isinstance(self.delivery, spec.Basic.Deliver):
            return self.delivery.consumer_tag
        return None

    @property
    def message_count(self) -> Optional[int]:
        if isinstance(self.delivery, spec.Basic.GetOk):
            return self.delivery.message_count
        return None


ChannelRType = Tuple[int, Channel.OpenOk]

CallbackCoro = Coroutine[Any, Any, Any]
ConsumerCallback = Callable[[DeliveredMessage], CallbackCoro]
ReturnCallback = Callable[[DeliveredMessage], Any]

ArgumentsType = FieldTable

ConfirmationFrameType = Union[
    Basic.Ack, Basic.Nack, Basic.Reject,
]


@dataclasses.dataclass(frozen=True)
class SSLCerts:
    cert: Optional[str]
    key: Optional[str]
    capath: Optional[str]
    cafile: Optional[str]
    cadata: Optional[bytes]
    verify: bool


@dataclasses.dataclass(frozen=True)
class FrameReceived:
    channel: int
    frame: str


URLorStr = Union[URL, str]
DrainResult = Awaitable[None]
TimeoutType = Optional[Union[float, int]]
FrameType = Union[Frame, ContentHeader, ContentBody]
RpcReturnType = Optional[
    Union[
        Basic.CancelOk,
        Basic.ConsumeOk,
        Basic.GetOk,
        Basic.QosOk,
        Basic.RecoverOk,
        Channel.CloseOk,
        Channel.FlowOk,
        Channel.OpenOk,
        Confirm.SelectOk,
        Exchange.BindOk,
        Exchange.DeclareOk,
        Exchange.DeleteOk,
        Exchange.UnbindOk,
        Queue.BindOk,
        Queue.DeleteOk,
        Queue.DeleteOk,
        Queue.PurgeOk,
        Queue.UnbindOk,
        Tx.CommitOk,
        Tx.RollbackOk,
        Tx.SelectOk,
    ]
]


@dataclasses.dataclass(frozen=True)
class ChannelFrame:
    payload: bytes
    should_close: bool
    drain_future: Optional[asyncio.Future] = None

    def drain(self) -> None:
        if not self.should_drain:
            return

        if self.drain_future is not None and not self.drain_future.done():
            self.drain_future.set_result(None)

    @property
    def should_drain(self) -> bool:
        return self.drain_future is not None and not self.drain_future.done()

    @classmethod
    def marshall(
        cls, channel_number: int,
        frames: Iterable[Union[FrameType, Heartbeat, ContentBody]],
        drain_future: Optional[asyncio.Future] = None,
    ) -> "ChannelFrame":
        should_close = False

        with io.BytesIO() as fp:
            for frame in frames:
                if should_close:
                    logger = logging.getLogger(
                        "aiormq.connection",
                    ).getChild(
                        "marshall",
                    )

                    logger.warning(
                        "It looks like you are going to send a frame %r after "
                        "the connection is closed, it's pointless, "
                        "the frame is dropped.", frame,
                    )
                    continue
                if isinstance(frame, spec.Connection.CloseOk):
                    should_close = True
                fp.write(pamqp.frame.marshal(frame, channel_number))

            return cls(
                payload=fp.getvalue(),
                drain_future=drain_future,
                should_close=should_close,
            )


class AbstractFutureStore:
    futures: Set[Union[asyncio.Future, TaskType]]
    loop: asyncio.AbstractEventLoop

    @abstractmethod
    def add(self, future: Union[asyncio.Future, TaskWrapper]) -> None:
        raise NotImplementedError

    @abstractmethod
    def reject_all(self, exception: Optional[ExceptionType]) -> Any:
        raise NotImplementedError

    @abstractmethod
    def create_task(self, coro: CoroutineType) -> TaskType:
        raise NotImplementedError

    @abstractmethod
    def create_future(self) -> asyncio.Future:
        raise NotImplementedError

    @abstractmethod
    def get_child(self) -> "AbstractFutureStore":
        raise NotImplementedError


class AbstractBase(ABC):
    loop: asyncio.AbstractEventLoop

    @abstractmethod
    def _future_store_child(self) -> AbstractFutureStore:
        raise NotImplementedError

    @abstractmethod
    def create_task(self, coro: CoroutineType) -> TaskType:
        raise NotImplementedError

    def create_future(self) -> asyncio.Future:
        raise NotImplementedError

    @abstractmethod
    async def _on_close(self, exc: Optional[Exception] = None) -> None:
        raise NotImplementedError

    @abstractmethod
    async def close(
        self, exc: Optional[ExceptionType] = asyncio.CancelledError(),
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def __str__(self) -> str:
        raise NotImplementedError

    @abstractproperty
    def is_closed(self) -> bool:
        raise NotImplementedError


class AbstractChannel(AbstractBase):
    frames: asyncio.Queue
    connection: "AbstractConnection"
    number: int
    on_return_callbacks: Set[ReturnCallback]
    closing: asyncio.Future

    @abstractmethod
    async def open(self) -> spec.Channel.OpenOk:
        pass

    @abstractmethod
    async def basic_get(
        self, queue: str = "", no_ack: bool = False,
        timeout: TimeoutType = None,
    ) -> DeliveredMessage:
        raise NotImplementedError

    @abstractmethod
    async def basic_cancel(
        self, consumer_tag: str, *, nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.CancelOk:
        raise NotImplementedError

    @abstractmethod
    async def basic_consume(
        self,
        queue: str,
        consumer_callback: ConsumerCallback,
        *,
        no_ack: bool = False,
        exclusive: bool = False,
        arguments: Optional[ArgumentsType] = None,
        consumer_tag: Optional[str] = None,
        timeout: TimeoutType = None,
    ) -> spec.Basic.ConsumeOk:
        raise NotImplementedError

    @abstractmethod
    def basic_ack(
        self, delivery_tag: int, multiple: bool = False, wait: bool = True,
    ) -> DrainResult:
        raise NotImplementedError

    @abstractmethod
    def basic_nack(
        self,
        delivery_tag: int,
        multiple: bool = False,
        requeue: bool = True,
        wait: bool = True,
    ) -> DrainResult:
        raise NotImplementedError

    @abstractmethod
    def basic_reject(
        self, delivery_tag: int, *, requeue: bool = True, wait: bool = True,
    ) -> DrainResult:
        raise NotImplementedError

    @abstractmethod
    async def basic_publish(
        self,
        body: bytes,
        *,
        exchange: str = "",
        routing_key: str = "",
        properties: Optional[spec.Basic.Properties] = None,
        mandatory: bool = False,
        immediate: bool = False,
        timeout: TimeoutType = None,
    ) -> Optional[ConfirmationFrameType]:
        raise NotImplementedError

    @abstractmethod
    async def basic_qos(
        self,
        *,
        prefetch_size: Optional[int] = None,
        prefetch_count: Optional[int] = None,
        global_: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.QosOk:
        raise NotImplementedError

    @abstractmethod
    async def basic_recover(
        self, *, nowait: bool = False, requeue: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.RecoverOk:
        raise NotImplementedError

    @abstractmethod
    async def exchange_declare(
        self,
        exchange: str = "",
        *,
        exchange_type: str = "direct",
        passive: bool = False,
        durable: bool = False,
        auto_delete: bool = False,
        internal: bool = False,
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.DeclareOk:
        raise NotImplementedError

    @abstractmethod
    async def exchange_delete(
        self,
        exchange: str = "",
        *,
        if_unused: bool = False,
        nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.DeleteOk:
        raise NotImplementedError

    @abstractmethod
    async def exchange_bind(
        self,
        destination: str = "",
        source: str = "",
        routing_key: str = "",
        *,
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.BindOk:
        raise NotImplementedError

    @abstractmethod
    async def exchange_unbind(
        self,
        destination: str = "",
        source: str = "",
        routing_key: str = "",
        *,
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.UnbindOk:
        raise NotImplementedError

    @abstractmethod
    async def flow(
        self, active: bool,
        timeout: TimeoutType = None,
    ) -> spec.Channel.FlowOk:
        raise NotImplementedError

    @abstractmethod
    async def queue_bind(
        self,
        queue: str,
        exchange: str,
        routing_key: str = "",
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Queue.BindOk:
        raise NotImplementedError

    @abstractmethod
    async def queue_declare(
        self,
        queue: str = "",
        *,
        passive: bool = False,
        durable: bool = False,
        exclusive: bool = False,
        auto_delete: bool = False,
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Queue.DeclareOk:
        raise NotImplementedError

    @abstractmethod
    async def queue_delete(
        self,
        queue: str = "",
        if_unused: bool = False,
        if_empty: bool = False,
        nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Queue.DeleteOk:
        raise NotImplementedError

    @abstractmethod
    async def queue_purge(
        self, queue: str = "", nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Queue.PurgeOk:
        raise NotImplementedError

    @abstractmethod
    async def queue_unbind(
        self,
        queue: str = "",
        exchange: str = "",
        routing_key: str = "",
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Queue.UnbindOk:
        raise NotImplementedError

    @abstractmethod
    async def tx_commit(
        self, timeout: TimeoutType = None,
    ) -> spec.Tx.CommitOk:
        raise NotImplementedError

    @abstractmethod
    async def tx_rollback(
        self, timeout: TimeoutType = None,
    ) -> spec.Tx.RollbackOk:
        raise NotImplementedError

    @abstractmethod
    async def tx_select(self, timeout: TimeoutType = None) -> spec.Tx.SelectOk:
        raise NotImplementedError

    @abstractmethod
    async def confirm_delivery(
        self, nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Confirm.SelectOk:
        raise NotImplementedError


class AbstractConnection(AbstractBase):
    FRAME_BUFFER_SIZE: int = 10
    # Interval between sending heartbeats based on the heartbeat(timeout)
    HEARTBEAT_INTERVAL_MULTIPLIER: TimeoutType

    # Allow three missed heartbeats (based on heartbeat(timeout)
    HEARTBEAT_GRACE_MULTIPLIER: int

    server_properties: ArgumentsType
    connection_tune: spec.Connection.Tune
    channels: Dict[int, Optional[AbstractChannel]]
    write_queue: asyncio.Queue
    url: URL
    closing: asyncio.Future

    @abstractmethod
    def set_close_reason(
        self, reply_code: int = REPLY_SUCCESS,
        reply_text: str = "normally closed",
        class_id: int = 0, method_id: int = 0,
    ) -> None:
        raise NotImplementedError

    @abstractproperty
    def is_opened(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def __str__(self) -> str:
        raise NotImplementedError

    @abstractmethod
    async def connect(
        self, client_properties: Optional[FieldTable] = None,
    ) -> bool:
        raise NotImplementedError

    @abstractproperty
    def server_capabilities(self) -> ArgumentsType:
        raise NotImplementedError

    @abstractproperty
    def basic_nack(self) -> bool:
        raise NotImplementedError

    @abstractproperty
    def consumer_cancel_notify(self) -> bool:
        raise NotImplementedError

    @abstractproperty
    def exchange_exchange_bindings(self) -> bool:
        raise NotImplementedError

    @abstractproperty
    def publisher_confirms(self) -> Optional[bool]:
        raise NotImplementedError

    async def channel(
        self,
        channel_number: Optional[int] = None,
        publisher_confirms: bool = True,
        frame_buffer_size: int = FRAME_BUFFER_SIZE,
        timeout: TimeoutType = None,
        **kwargs: Any,
    ) -> AbstractChannel:
        raise NotImplementedError

    @abstractmethod
    async def __aenter__(self) -> "AbstractConnection":
        raise NotImplementedError

    @abstractmethod
    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> Optional[bool]:
        raise NotImplementedError

    @abstractmethod
    async def ready(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def update_secret(
        self, new_secret: str, *,
        reason: str = "", timeout: TimeoutType = None,
    ) -> spec.Connection.UpdateSecretOk:
        raise NotImplementedError


__all__ = (
    "AbstractBase", "AbstractChannel", "AbstractConnection",
    "AbstractFutureStore", "ArgumentsType", "CallbackCoro", "ChannelFrame",
    "ChannelRType", "ConfirmationFrameType", "ConsumerCallback",
    "CoroutineType", "DeliveredMessage", "DrainResult", "ExceptionType",
    "FieldArray", "FieldTable", "FieldValue", "FrameReceived", "FrameType",
    "GetResultType", "ReturnCallback", "RpcReturnType", "SSLCerts",
    "TaskType", "TaskWrapper", "TimeoutType", "URLorStr",
)
