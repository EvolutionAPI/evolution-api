import asyncio
import io
import logging
from collections import OrderedDict
from contextlib import suppress
from functools import partial
from io import BytesIO
from random import getrandbits
from types import MappingProxyType
from typing import (
    Any, Awaitable, Callable, Dict, List, Mapping, Optional, Set, Tuple, Type,
    Union,
)
from uuid import UUID

import pamqp.frame
from pamqp import commands as spec
from pamqp.base import Frame
from pamqp.body import ContentBody
from pamqp.constants import REPLY_SUCCESS
from pamqp.exceptions import AMQPFrameError
from pamqp.header import ContentHeader

from aiormq.tools import Countdown, awaitable

from .abc import (
    AbstractChannel, AbstractConnection, ArgumentsType, ChannelFrame,
    ConfirmationFrameType, ConsumerCallback, DeliveredMessage, ExceptionType,
    FrameType, GetResultType, ReturnCallback, RpcReturnType, TimeoutType,
)
from .base import Base, task
from .exceptions import (
    AMQPChannelError, AMQPError, ChannelAccessRefused, ChannelClosed,
    ChannelInvalidStateError, ChannelLockedResource, ChannelNotFoundEntity,
    ChannelPreconditionFailed, DeliveryError, DuplicateConsumerTag,
    InvalidFrameError, MethodNotImplemented, PublishError,
)


log = logging.getLogger(__name__)


EXCEPTION_MAPPING: Mapping[int, Type[AMQPChannelError]] = MappingProxyType({
    403: ChannelAccessRefused,
    404: ChannelNotFoundEntity,
    405: ChannelLockedResource,
    406: ChannelPreconditionFailed,
})


def exception_by_code(frame: spec.Channel.Close) -> AMQPError:
    if frame.reply_code is None:
        return ChannelClosed(frame.reply_code, frame.reply_text)

    exception_class = EXCEPTION_MAPPING.get(frame.reply_code)

    if exception_class is None:
        return ChannelClosed(frame.reply_code, frame.reply_text)

    return exception_class(frame.reply_text)


def _check_routing_key(key: str) -> None:
    if len(key) > 255:
        raise ValueError("Routing key too long (max 255 bytes)")


class Returning(asyncio.Future):
    pass


ConfirmationType = Union[asyncio.Future, Returning]


class Channel(Base, AbstractChannel):
    # noinspection PyTypeChecker
    CONTENT_FRAME_SIZE = len(pamqp.frame.marshal(ContentBody(b""), 0))
    CHANNEL_CLOSE_TIMEOUT = 10
    confirmations: Dict[int, ConfirmationType]

    def __init__(
        self,
        connector: AbstractConnection,
        number: int,
        publisher_confirms: bool = True,
        frame_buffer: Optional[int] = None,
        on_return_raises: bool = True,
    ):

        super().__init__(loop=connector.loop, parent=connector)

        self.connection = connector

        if (
            publisher_confirms and not connector.publisher_confirms
        ):  # pragma: no cover
            raise ValueError("Server doesn't support publisher confirms")

        self.consumers: Dict[str, ConsumerCallback] = {}
        self.confirmations = OrderedDict()
        self.message_id_delivery_tag: Dict[str, int] = dict()

        self.delivery_tag = 0

        self.getter: Optional[asyncio.Future] = None
        self.getter_lock = asyncio.Lock()

        self.frames: asyncio.Queue = asyncio.Queue(maxsize=frame_buffer or 0)

        self.max_content_size = (
            connector.connection_tune.frame_max - self.CONTENT_FRAME_SIZE
        )

        self.__lock = asyncio.Lock()
        self.number: int = number
        self.publisher_confirms = publisher_confirms
        self.rpc_frames: asyncio.Queue = asyncio.Queue(
            maxsize=frame_buffer or 0,
        )
        self.write_queue = connector.write_queue
        self.on_return_raises = on_return_raises
        self.on_return_callbacks: Set[ReturnCallback] = set()
        self._close_exception = None

        self.create_task(self._reader())

        self.__close_reply_code: int = REPLY_SUCCESS
        self.__close_reply_text: str = ""
        self.__close_class_id: int = 0
        self.__close_method_id: int = 0
        self.__close_event: asyncio.Event = asyncio.Event()

    def set_close_reason(
        self, reply_code: int = REPLY_SUCCESS,
        reply_text: str = "", class_id: int = 0, method_id: int = 0,
    ) -> None:
        self.__close_reply_code = reply_code
        self.__close_reply_text = reply_text
        self.__close_class_id = class_id
        self.__close_method_id = method_id

    @property
    def lock(self) -> asyncio.Lock:
        if self.is_closed:
            raise ChannelInvalidStateError("%r closed" % self)

        return self.__lock

    async def _get_frame(self) -> FrameType:
        weight, frame = await self.frames.get()
        self.frames.task_done()
        return frame

    def __str__(self) -> str:
        return str(self.number)

    @task
    async def rpc(
        self, frame: Frame, timeout: TimeoutType = None,
    ) -> RpcReturnType:

        if self.__close_event.is_set():
            raise ChannelInvalidStateError("Channel closed by RPC timeout")

        countdown = Countdown(timeout)
        lock = self.lock

        async with countdown.enter_context(lock):
            try:
                await countdown(
                    self.write_queue.put(
                        ChannelFrame.marshall(
                            channel_number=self.number,
                            frames=[frame],
                        ),
                    ),
                )

                if not (frame.synchronous or getattr(frame, "nowait", False)):
                    return None

                result = await countdown(self.rpc_frames.get())

                self.rpc_frames.task_done()

                if result.name not in frame.valid_responses:  # pragma: no cover
                    raise InvalidFrameError(frame)

                return result
            except (asyncio.CancelledError, asyncio.TimeoutError):
                if self.is_closed:
                    raise

                log.warning(
                    "Closing channel %r because RPC call %s cancelled",
                    self, frame,
                )

                self.__close_event.set()
                await self.write_queue.put(
                    ChannelFrame.marshall(
                        channel_number=self.number,
                        frames=[
                            spec.Channel.Close(
                                class_id=0,
                                method_id=0,
                                reply_code=504,
                                reply_text=(
                                    "RPC timeout on frame {!s}".format(frame)
                                ),
                            ),
                        ],
                    ),
                )

                raise

    async def open(self, timeout: TimeoutType = None) -> spec.Channel.OpenOk:
        frame: spec.Channel.OpenOk = await self.rpc(
            spec.Channel.Open(), timeout=timeout,
        )

        if self.publisher_confirms:
            await self.rpc(spec.Confirm.Select())

        if frame is None:  # pragma: no cover
            raise AMQPFrameError(frame)
        return frame

    async def __get_content_frame(self) -> ContentBody:
        content_frame = await self._get_frame()
        if not isinstance(content_frame, ContentBody):
            raise ValueError(
                "Unexpected frame {!r}".format(content_frame),
                content_frame,
            )
        return content_frame

    async def _read_content(
        self,
        frame: Union[spec.Basic.Deliver, spec.Basic.Return, GetResultType],
        header: ContentHeader,
    ) -> DeliveredMessage:
        with BytesIO() as body:
            content: Optional[ContentBody] = None

            if header.body_size:
                content = await self.__get_content_frame()

            while content and body.tell() < header.body_size:
                body.write(content.value)

                if body.tell() < header.body_size:
                    content = await self.__get_content_frame()

            return DeliveredMessage(
                delivery=frame,
                header=header,
                body=body.getvalue(),
                channel=self,
            )

    async def __get_content_header(self) -> ContentHeader:
        frame: FrameType = await self._get_frame()

        if not isinstance(frame, ContentHeader):
            raise ValueError(
                "Unexpected frame {!r} instead of ContentHeader".format(frame),
                frame,
            )

        return frame

    async def _on_deliver_frame(self, frame: spec.Basic.Deliver) -> None:
        header: ContentHeader = await self.__get_content_header()
        message = await self._read_content(frame, header)

        if frame.consumer_tag is None:
            log.warning("Frame %r has no consumer tag", frame)
            return

        consumer = self.consumers.get(frame.consumer_tag)
        if consumer is not None:
            # noinspection PyAsyncCall
            self.create_task(consumer(message))

    async def _on_get_frame(
        self, frame: Union[spec.Basic.GetOk, spec.Basic.GetEmpty],
    ) -> None:
        message = None
        if isinstance(frame, spec.Basic.GetOk):
            header: ContentHeader = await self.__get_content_header()
            message = await self._read_content(frame, header)
        if isinstance(frame, spec.Basic.GetEmpty):
            message = DeliveredMessage(
                delivery=frame,
                header=ContentHeader(),
                body=b"",
                channel=self,
            )

        getter = getattr(self, "getter", None)

        if getter is None:
            raise RuntimeError("Getter is None")

        if getter.done():
            log.error("Got message but no active getter")
            return

        getter.set_result((frame, message))
        return

    async def _on_return_frame(self, frame: spec.Basic.Return) -> None:
        header: ContentHeader = await self.__get_content_header()
        message = await self._read_content(frame, header)
        message_id = message.header.properties.message_id

        if message_id is None:
            log.error("message_id if None on returned message %r", message)
            return

        delivery_tag = self.message_id_delivery_tag.get(message_id)

        if delivery_tag is None:  # pragma: nocover
            log.error("Unhandled message %r returning", message)
            return

        confirmation = self.confirmations.pop(delivery_tag, None)
        if confirmation is None:  # pragma: nocover
            return

        self.confirmations[delivery_tag] = Returning()

        if self.on_return_raises:
            confirmation.set_exception(PublishError(message, frame))
            return

        for cb in self.on_return_callbacks:
            # noinspection PyBroadException
            try:
                cb(message)
            except Exception:
                log.exception("Unhandled return callback exception")

        confirmation.set_result(message)

    def _confirm_delivery(
        self, delivery_tag: Optional[int],
        frame: ConfirmationFrameType,
    ) -> None:
        if delivery_tag not in self.confirmations:
            return

        confirmation = self.confirmations.pop(delivery_tag)

        if isinstance(confirmation, Returning):
            return
        elif confirmation.done():  # pragma: nocover
            log.warning(
                "Delivery tag %r confirmed %r was ignored", delivery_tag, frame,
            )
            return
        elif isinstance(frame, spec.Basic.Ack):
            confirmation.set_result(frame)
            return

        confirmation.set_exception(
            DeliveryError(None, frame),
        )  # pragma: nocover

    async def _on_confirm_frame(self, frame: ConfirmationFrameType) -> None:
        if not self.publisher_confirms:  # pragma: nocover
            return

        if frame.delivery_tag not in self.confirmations:
            log.error("Unexpected confirmation frame %r from broker", frame)
            return

        multiple = getattr(frame, "multiple", False)

        if multiple:
            for delivery_tag in self.confirmations.keys():
                if frame.delivery_tag >= delivery_tag:
                    # Should be called later to avoid keys copying
                    self.loop.call_soon(
                        self._confirm_delivery, delivery_tag, frame,
                    )
        else:
            self._confirm_delivery(frame.delivery_tag, frame)

    async def _on_cancel_frame(
        self,
        frame: Union[spec.Basic.CancelOk, spec.Basic.Cancel],
    ) -> None:
        if frame.consumer_tag is not None:
            self.consumers.pop(frame.consumer_tag, None)

    async def _on_close_frame(self, frame: spec.Channel.Close) -> None:
        exc: BaseException = exception_by_code(frame)
        with suppress(asyncio.QueueFull):
            self.write_queue.put_nowait(
                ChannelFrame.marshall(
                    channel_number=self.number,
                    frames=[spec.Channel.CloseOk()],
                ),
            )
        self.connection.channels.pop(self.number, None)
        self.__close_event.set()
        raise exc

    async def _on_close_ok_frame(self, _: spec.Channel.CloseOk) -> None:
        self.connection.channels.pop(self.number, None)
        self.__close_event.set()
        raise ChannelClosed(None, None)

    async def _reader(self) -> None:
        hooks: Mapping[Any, Tuple[bool, Callable[[Any], Awaitable[None]]]]

        hooks = {
            spec.Basic.Deliver: (False, self._on_deliver_frame),
            spec.Basic.GetOk: (True, self._on_get_frame),
            spec.Basic.GetEmpty: (True, self._on_get_frame),
            spec.Basic.Return: (False, self._on_return_frame),
            spec.Basic.Cancel: (False, self._on_cancel_frame),
            spec.Basic.CancelOk: (True, self._on_cancel_frame),
            spec.Channel.Close: (False, self._on_close_frame),
            spec.Channel.CloseOk: (False, self._on_close_ok_frame),
            spec.Basic.Ack: (False, self._on_confirm_frame),
            spec.Basic.Nack: (False, self._on_confirm_frame),
        }

        last_exception: Optional[BaseException] = None

        try:
            while True:
                frame = await self._get_frame()
                should_add_to_rpc, hook = hooks.get(type(frame), (True, None))

                if hook is not None:
                    await hook(frame)

                if should_add_to_rpc:
                    await self.rpc_frames.put(frame)
        except asyncio.CancelledError as e:
            self.__close_event.set()
            last_exception = e
            return
        except Exception as e:
            last_exception = e
            raise
        finally:
            await self.close(
                last_exception, timeout=self.CHANNEL_CLOSE_TIMEOUT,
            )

    @task
    async def _on_close(self, exc: Optional[ExceptionType] = None) -> None:
        if not self.connection.is_opened or self.__close_event.is_set():
            return

        await self.rpc(
            spec.Channel.Close(
                reply_code=self.__close_reply_code,
                class_id=self.__close_class_id,
                method_id=self.__close_method_id,
            ),
            timeout=self.connection.connection_tune.heartbeat or None,
        )

        await self.__close_event.wait()

    async def basic_get(
        self, queue: str = "", no_ack: bool = False,
        timeout: TimeoutType = None,
    ) -> DeliveredMessage:

        countdown = Countdown(timeout)
        async with countdown.enter_context(self.getter_lock):
            self.getter = self.create_future()

            await self.rpc(
                spec.Basic.Get(queue=queue, no_ack=no_ack),
                timeout=countdown.get_timeout(),
            )

            frame: Union[spec.Basic.GetEmpty, spec.Basic.GetOk]
            message: DeliveredMessage

            frame, message = await countdown(self.getter)
            del self.getter

        return message

    async def basic_cancel(
        self, consumer_tag: str, *, nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.CancelOk:
        return await self.rpc(
            spec.Basic.Cancel(consumer_tag=consumer_tag, nowait=nowait),
            timeout=timeout,
        )

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

        consumer_tag = consumer_tag or "ctag%i.%s" % (
            self.number,
            UUID(int=getrandbits(128), version=4).hex,
        )

        if consumer_tag in self.consumers:
            raise DuplicateConsumerTag(self.number)

        self.consumers[consumer_tag] = awaitable(consumer_callback)

        return await self.rpc(
            spec.Basic.Consume(
                queue=queue,
                no_ack=no_ack,
                exclusive=exclusive,
                consumer_tag=consumer_tag,
                arguments=arguments,
            ),
            timeout=timeout,
        )

    async def basic_ack(
        self, delivery_tag: int, multiple: bool = False, wait: bool = True,
    ) -> None:
        drain_future = self.create_future() if wait else None

        await self.write_queue.put(
            ChannelFrame.marshall(
                frames=[
                    spec.Basic.Ack(
                        delivery_tag=delivery_tag,
                        multiple=multiple,
                    ),
                ],
                channel_number=self.number,
                drain_future=drain_future,
            ),
        )

        if drain_future is not None:
            await drain_future

    async def basic_nack(
        self,
        delivery_tag: int,
        multiple: bool = False,
        requeue: bool = True,
        wait: bool = True,
    ) -> None:
        if not self.connection.basic_nack:
            raise MethodNotImplemented

        drain_future = self.create_future() if wait else None

        await self.write_queue.put(
            ChannelFrame.marshall(
                frames=[
                    spec.Basic.Nack(
                        delivery_tag=delivery_tag,
                        multiple=multiple,
                        requeue=requeue,
                    ),
                ],
                channel_number=self.number,
                drain_future=drain_future,
            ),
        )

        if drain_future is not None:
            await drain_future

    async def basic_reject(
        self, delivery_tag: int, *, requeue: bool = True, wait: bool = True,
    ) -> None:
        drain_future = self.create_future()
        await self.write_queue.put(
            ChannelFrame.marshall(
                channel_number=self.number,
                frames=[
                    spec.Basic.Reject(
                        delivery_tag=delivery_tag,
                        requeue=requeue,
                    ),
                ],
                drain_future=drain_future,
            ),
        )

        if drain_future is not None:
            await drain_future

    def _split_body(self, body: bytes) -> List[ContentBody]:
        if not body:
            return []

        if len(body) < self.max_content_size:
            return [ContentBody(body)]

        with io.BytesIO(body) as fp:
            reader = partial(fp.read, self.max_content_size)
            return list(map(ContentBody, iter(reader, b"")))

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
        wait: bool = True,
    ) -> Optional[ConfirmationFrameType]:
        _check_routing_key(routing_key)
        countdown = Countdown(timeout=timeout)

        publish_frame = spec.Basic.Publish(
            exchange=exchange,
            routing_key=routing_key,
            mandatory=mandatory,
            immediate=immediate,
        )

        content_header = ContentHeader(
            properties=properties or spec.Basic.Properties(delivery_mode=1),
            body_size=len(body),
        )

        if not content_header.properties.message_id:
            # UUID compatible random bytes
            rnd_uuid = UUID(int=getrandbits(128), version=4)
            content_header.properties.message_id = rnd_uuid.hex

        confirmation: Optional[ConfirmationType] = None

        async with countdown.enter_context(self.lock):
            self.delivery_tag += 1

            if self.publisher_confirms:
                message_id = content_header.properties.message_id

                if self.delivery_tag not in self.confirmations:
                    self.confirmations[
                        self.delivery_tag
                    ] = self.create_future()

                confirmation = self.confirmations[self.delivery_tag]
                self.message_id_delivery_tag[message_id] = self.delivery_tag

                if confirmation is None:
                    return

                confirmation.add_done_callback(
                    lambda _: self.message_id_delivery_tag.pop(
                        message_id, None,
                    ),
                )

            body_frames: List[Union[FrameType, ContentBody]]
            body_frames = [publish_frame, content_header]
            body_frames += self._split_body(body)

            drain_future = self.create_future() if wait else None
            await countdown(
                self.write_queue.put(
                    ChannelFrame.marshall(
                        frames=body_frames,
                        channel_number=self.number,
                        drain_future=drain_future,
                    ),
                ),
            )

            if drain_future:
                await drain_future

            if not self.publisher_confirms:
                return None

            if confirmation is None:
                return None

        return await countdown(confirmation)

    async def basic_qos(
        self,
        *,
        prefetch_size: Optional[int] = None,
        prefetch_count: Optional[int] = None,
        global_: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.QosOk:
        return await self.rpc(
            spec.Basic.Qos(
                prefetch_size=prefetch_size or 0,
                prefetch_count=prefetch_count or 0,
                global_=global_,
            ),
            timeout=timeout,
        )

    async def basic_recover(
        self, *, nowait: bool = False, requeue: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Basic.RecoverOk:
        frame: Union[spec.Basic.RecoverAsync, spec.Basic.Recover]
        if nowait:
            frame = spec.Basic.RecoverAsync(requeue=requeue)
        else:
            frame = spec.Basic.Recover(requeue=requeue)

        return await self.rpc(frame, timeout=timeout)

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
        arguments: Optional[Dict[str, Any]] = None,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.DeclareOk:
        return await self.rpc(
            spec.Exchange.Declare(
                exchange=str(exchange),
                exchange_type=str(exchange_type),
                passive=bool(passive),
                durable=bool(durable),
                auto_delete=bool(auto_delete),
                internal=bool(internal),
                nowait=bool(nowait),
                arguments=arguments,
            ),
            timeout=timeout,
        )

    async def exchange_delete(
        self,
        exchange: str = "",
        *,
        if_unused: bool = False,
        nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Exchange.DeleteOk:
        return await self.rpc(
            spec.Exchange.Delete(
                exchange=exchange, nowait=nowait, if_unused=if_unused,
            ),
            timeout=timeout,
        )

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
        _check_routing_key(routing_key)
        return await self.rpc(
            spec.Exchange.Bind(
                destination=destination,
                source=source,
                routing_key=routing_key,
                nowait=nowait,
                arguments=arguments,
            ),
            timeout=timeout,
        )

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
        _check_routing_key(routing_key)
        return await self.rpc(
            spec.Exchange.Unbind(
                destination=destination,
                source=source,
                routing_key=routing_key,
                nowait=nowait,
                arguments=arguments,
            ),
            timeout=timeout,
        )

    async def flow(
        self, active: bool,
        timeout: TimeoutType = None,
    ) -> spec.Channel.FlowOk:
        return await self.rpc(
            spec.Channel.Flow(active=active),
            timeout=timeout,
        )

    async def queue_bind(
        self,
        queue: str,
        exchange: str,
        routing_key: str = "",
        nowait: bool = False,
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Queue.BindOk:
        _check_routing_key(routing_key)
        return await self.rpc(
            spec.Queue.Bind(
                queue=queue,
                exchange=exchange,
                routing_key=routing_key,
                nowait=nowait,
                arguments=arguments,
            ),
            timeout=timeout,
        )

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
        return await self.rpc(
            spec.Queue.Declare(
                queue=queue,
                passive=bool(passive),
                durable=bool(durable),
                exclusive=bool(exclusive),
                auto_delete=bool(auto_delete),
                nowait=bool(nowait),
                arguments=arguments,
            ),
            timeout=timeout,
        )

    async def queue_delete(
        self,
        queue: str = "",
        if_unused: bool = False,
        if_empty: bool = False,
        nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Queue.DeleteOk:
        return await self.rpc(
            spec.Queue.Delete(
                queue=queue,
                if_unused=if_unused,
                if_empty=if_empty,
                nowait=nowait,
            ),
            timeout=timeout,
        )

    async def queue_purge(
        self, queue: str = "", nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Queue.PurgeOk:
        return await self.rpc(
            spec.Queue.Purge(queue=queue, nowait=nowait),
            timeout=timeout,
        )

    async def queue_unbind(
        self,
        queue: str = "",
        exchange: str = "",
        routing_key: str = "",
        arguments: Optional[ArgumentsType] = None,
        timeout: TimeoutType = None,
    ) -> spec.Queue.UnbindOk:
        _check_routing_key(routing_key)
        return await self.rpc(
            spec.Queue.Unbind(
                routing_key=routing_key,
                arguments=arguments,
                queue=queue,
                exchange=exchange,
            ),
            timeout=timeout,
        )

    async def tx_commit(
        self, timeout: TimeoutType = None,
    ) -> spec.Tx.CommitOk:
        return await self.rpc(spec.Tx.Commit(), timeout=timeout)

    async def tx_rollback(
        self, timeout: TimeoutType = None,
    ) -> spec.Tx.RollbackOk:
        return await self.rpc(spec.Tx.Rollback(), timeout=timeout)

    async def tx_select(self, timeout: TimeoutType = None) -> spec.Tx.SelectOk:
        return await self.rpc(spec.Tx.Select(), timeout=timeout)

    async def confirm_delivery(
        self, nowait: bool = False,
        timeout: TimeoutType = None,
    ) -> spec.Confirm.SelectOk:
        return await self.rpc(
            spec.Confirm.Select(nowait=nowait),
            timeout=timeout,
        )
