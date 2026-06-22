import asyncio
import json
import logging
import time
import uuid
from enum import Enum
from functools import partial
from typing import Any, Callable, Dict, Optional, Tuple

from aiormq.abc import ExceptionType

from aio_pika.abc import (
    AbstractChannel, AbstractExchange, AbstractIncomingMessage, AbstractQueue,
    ConsumerTag, DeliveryMode,
)
from aio_pika.exceptions import MessageProcessError
from aio_pika.exchange import ExchangeType
from aio_pika.message import IncomingMessage, Message

from ..tools import ensure_awaitable
from .base import Base, CallbackType, Proxy, T


log = logging.getLogger(__name__)


class RPCException(RuntimeError):
    pass


class RPCMessageType(str, Enum):
    ERROR = "error"
    RESULT = "result"
    CALL = "call"


# This needed only for migration from 6.x to 7.x
# TODO: Remove this in 8.x release
RPCMessageTypes = RPCMessageType    # noqa


class RPC(Base):
    __slots__ = (
        "channel",
        "loop",
        "proxy",
        "futures",
        "result_queue",
        "result_consumer_tag",
        "routes",
        "queues",
        "consumer_tags",
        "dlx_exchange",
        "rpc_exchange",
        "host_exceptions",
    )

    DLX_NAME = "rpc.dlx"
    DELIVERY_MODE = DeliveryMode.NOT_PERSISTENT

    __doc__ = """
    Remote Procedure Call helper.

    Create an instance ::

        rpc = await RPC.create(channel, host_exceptions=False)

    Registering python function ::

        # RPC instance passes only keyword arguments
        def multiply(*, x, y):
            return x * y

        await rpc.register("multiply", multiply)

    Call function through proxy ::

        assert await rpc.proxy.multiply(x=2, y=3) == 6

    Call function explicit ::

        assert await rpc.call('multiply', dict(x=2, y=3)) == 6

    Show exceptions on remote side ::

        rpc = await RPC.create(channel, host_exceptions=True)
    """

    result_queue: AbstractQueue
    result_consumer_tag: ConsumerTag
    dlx_exchange: AbstractExchange
    rpc_exchange: Optional[AbstractExchange]

    def __init__(
        self, channel: AbstractChannel,
        host_exceptions: bool = False,
    ) -> None:
        self.channel = channel
        self.loop = asyncio.get_event_loop()
        self.proxy = Proxy(self.call)
        self.futures: Dict[str, asyncio.Future] = {}
        self.routes: Dict[str, Callable[..., Any]] = {}
        self.queues: Dict[Callable[..., Any], AbstractQueue] = {}
        self.consumer_tags: Dict[Callable[..., Any], ConsumerTag] = {}
        self.host_exceptions = host_exceptions

    def __remove_future(
        self, correlation_id: str,
    ) -> Callable[[asyncio.Future], None]:
        def do_remove(future: asyncio.Future) -> None:
            log.debug("Remove done future %r", future)
            self.futures.pop(correlation_id, None)
        return do_remove

    def create_future(self) -> Tuple[asyncio.Future, str]:
        future = self.loop.create_future()
        log.debug("Create future for RPC call")
        correlation_id = str(uuid.uuid4())
        self.futures[correlation_id] = future
        future.add_done_callback(self.__remove_future(correlation_id))
        return future, correlation_id

    def _format_routing_key(self, method_name: str) -> str:
        return (
            f"{self.rpc_exchange.name}::{method_name}"
            if self.rpc_exchange
            else method_name
        )

    async def close(self) -> None:
        if not hasattr(self, "result_queue"):
            log.warning("RPC already closed")
            return

        log.debug("Cancelling listening %r", self.result_queue)
        await self.result_queue.cancel(self.result_consumer_tag)
        del self.result_consumer_tag

        log.debug("Unbinding %r", self.result_queue)
        await self.result_queue.unbind(
            self.dlx_exchange, "",
            arguments={"From": self.result_queue.name, "x-match": "any"},
        )

        log.debug("Cancelling undone futures %r", self.futures)
        for future in self.futures.values():
            if future.done():
                continue

            future.set_exception(asyncio.CancelledError)

        log.debug("Deleting %r", self.result_queue)
        await self.result_queue.delete()
        del self.result_queue
        del self.dlx_exchange

        if self.rpc_exchange:
            del self.rpc_exchange

    async def initialize(
        self, auto_delete: bool = True,
        durable: bool = False, exchange: str = "", **kwargs: Any,
    ) -> None:
        if hasattr(self, "result_queue"):
            return

        self.rpc_exchange = await self.channel.declare_exchange(
            exchange,
            type=ExchangeType.DIRECT,
            auto_delete=True,
            durable=durable,
        ) if exchange else None

        self.result_queue = await self.channel.declare_queue(
            None, auto_delete=auto_delete, durable=durable, **kwargs,
        )

        self.dlx_exchange = await self.channel.declare_exchange(
            self.DLX_NAME, type=ExchangeType.HEADERS, auto_delete=True,
        )

        await self.result_queue.bind(
            self.dlx_exchange,
            "",
            arguments={"From": self.result_queue.name, "x-match": "any"},
        )

        self.result_consumer_tag = await self.result_queue.consume(
            self.on_result_message, exclusive=True, no_ack=True,
        )

        self.channel.close_callbacks.add(self.on_close)
        self.channel.return_callbacks.add(self.on_message_returned)

    def on_close(
        self,
        channel: Optional[AbstractChannel],
        exc: Optional[ExceptionType] = None,
    ) -> None:
        log.debug("Closing RPC futures because %r", exc)
        for future in self.futures.values():
            if future.done():
                continue

            future.set_exception(exc or Exception)

    @classmethod
    async def create(cls, channel: AbstractChannel, **kwargs: Any) -> "RPC":
        """ Creates a new instance of :class:`aio_pika.patterns.RPC`.
        You should use this method instead of :func:`__init__`,
        because :func:`create` returns coroutine and makes async initialize

        :param channel: initialized instance of :class:`aio_pika.Channel`
        :returns: :class:`RPC`

        """
        rpc = cls(channel)
        await rpc.initialize(**kwargs)
        return rpc

    def on_message_returned(
        self,
        channel: Optional[AbstractChannel],
        message: AbstractIncomingMessage,
    ) -> None:
        if message.correlation_id is None:
            log.warning(
                "Message without correlation_id was returned: %r", message,
            )
            return

        future = self.futures.pop(message.correlation_id, None)

        if not future or future.done():
            log.warning("Unknown message was returned: %r", message)
            return

        future.set_exception(
            MessageProcessError("Message has been returned", message),
        )

    async def on_result_message(self, message: AbstractIncomingMessage) -> None:
        if message.correlation_id is None:
            log.warning(
                "Message without correlation_id was received: %r", message,
            )
            return

        future = self.futures.pop(message.correlation_id, None)

        if future is None:
            log.warning("Unknown message: %r", message)
            return

        try:
            payload = await self.deserialize_message(message)
        except Exception as e:
            log.error("Failed to deserialize response on message: %r", message)
            future.set_exception(e)
            return

        if message.type == RPCMessageType.RESULT.value:
            future.set_result(payload)
        elif message.type == RPCMessageType.ERROR.value:
            if not isinstance(payload, Exception):
                payload = RPCException("Wrapped non-exception object", payload)
            future.set_exception(payload)
        elif message.type == RPCMessageType.CALL.value:
            future.set_exception(
                asyncio.TimeoutError("Message timed-out", message),
            )
        else:
            future.set_exception(
                RuntimeError("Unknown message type %r" % message.type),
            )

    async def on_call_message(
        self, method_name: str, message: IncomingMessage,
    ) -> None:

        routing_key = self._format_routing_key(method_name)

        if routing_key not in self.routes:
            log.warning("Method %r not registered in %r", method_name, self)
            return

        try:
            payload = await self.deserialize_message(message)
            func = self.routes[routing_key]
            result: Any = await self.execute(func, payload)
            message_type = RPCMessageType.RESULT
        except Exception as e:
            result = self.serialize_exception(e)
            message_type = RPCMessageType.ERROR

            if self.host_exceptions is True:
                log.exception(e)

        if not message.reply_to:
            log.info(
                'RPC message without "reply_to" header %r call result '
                "will be lost",
                message,
            )
            await message.ack()
            return

        try:
            result_message = await self.serialize_message(
                payload=result,
                message_type=message_type,
                correlation_id=message.correlation_id,
                delivery_mode=message.delivery_mode,
            )
        except asyncio.CancelledError:
            raise
        except Exception as e:
            result_message = await self.serialize_message(
                payload=e,
                message_type=RPCMessageType.ERROR,
                correlation_id=message.correlation_id,
                delivery_mode=message.delivery_mode,
            )

        try:
            await self.channel.default_exchange.publish(
                result_message, message.reply_to, mandatory=False,
            )
        except Exception:
            log.exception("Failed to send reply %r", result_message)
            await message.reject(requeue=False)
            return

        if message_type == RPCMessageType.ERROR.value:
            await message.ack()
            return

        await message.ack()

    def serialize_exception(self, exception: Exception) -> Any:
        """ Make python exception serializable """
        return exception

    async def execute(self, func: CallbackType, payload: Dict[str, Any]) -> T:
        """ Executes rpc call. Might be overlapped. """
        return await func(**payload)

    async def deserialize_message(
        self, message: AbstractIncomingMessage,
    ) -> Any:
        return self.deserialize(message.body)

    async def serialize_message(
        self, payload: Any, message_type: RPCMessageType,
        correlation_id: Optional[str], delivery_mode: DeliveryMode,
        **kwargs: Any,
    ) -> Message:
        return Message(
            self.serialize(payload),
            content_type=self.CONTENT_TYPE,
            correlation_id=correlation_id,
            delivery_mode=delivery_mode,
            timestamp=time.time(),
            type=message_type.value,
            **kwargs,
        )

    async def call(
        self,
        method_name: str,
        kwargs: Optional[Dict[str, Any]] = None,
        *,
        expiration: Optional[int] = None,
        priority: int = 5,
        delivery_mode: DeliveryMode = DELIVERY_MODE,
    ) -> Any:
        """ Call remote method and awaiting result.

        :param method_name: Name of method
        :param kwargs: Methos kwargs
        :param expiration:
            If not `None` messages which staying in queue longer
            will be returned and :class:`asyncio.TimeoutError` will be raised.
        :param priority: Message priority
        :param delivery_mode: Call message delivery mode
        :raises asyncio.TimeoutError: when message expired
        :raises CancelledError: when called :func:`RPC.cancel`
        :raises RuntimeError: internal error
        """

        future, correlation_id = self.create_future()

        message = await self.serialize_message(
            payload=kwargs or {},
            message_type=RPCMessageType.CALL,
            correlation_id=correlation_id,
            delivery_mode=delivery_mode,
            reply_to=self.result_queue.name,
            headers={"From": self.result_queue.name},
            priority=priority,
        )

        if expiration is not None:
            message.expiration = expiration

        routing_key = self._format_routing_key(method_name)

        log.debug("Publishing calls for %s(%r)", routing_key, kwargs)
        exchange = self.rpc_exchange or self.channel.default_exchange
        await exchange.publish(
            message, routing_key=routing_key,
            mandatory=True,
        )

        log.debug("Waiting RPC result for %s(%r)", routing_key, kwargs)
        return await future

    async def register(
        self, method_name: str, func: CallbackType, **kwargs: Any,
    ) -> Any:
        """ Method creates a queue with name which equal of
        `method_name` argument. Then subscribes this queue.

        :param method_name: Method name
        :param func:
            target function. Function **MUST** accept only keyword arguments.
        :param kwargs: arguments which will be passed to `queue_declare`
        :raises RuntimeError:
            Function already registered in this :class:`RPC` instance
            or method_name already used.
        """
        arguments = kwargs.pop("arguments", {})
        arguments.update({"x-dead-letter-exchange": self.DLX_NAME})

        func = ensure_awaitable(func)

        kwargs["arguments"] = arguments

        routing_key = self._format_routing_key(method_name)

        queue = await self.channel.declare_queue(routing_key, **kwargs)

        if self.rpc_exchange:
            await queue.bind(
                self.rpc_exchange,
                routing_key,
            )

        if func in self.consumer_tags:
            raise RuntimeError("Function already registered")

        if routing_key in self.routes:
            raise RuntimeError(
                "Method name already used for %r" % self.routes[routing_key],
            )

        self.consumer_tags[func] = await queue.consume(
            partial(self.on_call_message, method_name),
        )

        self.routes[routing_key] = func
        self.queues[func] = queue

    async def unregister(self, func: CallbackType) -> None:
        """ Cancels subscription to the method-queue.

        :param func: Function
        """
        if func not in self.consumer_tags:
            return

        consumer_tag = self.consumer_tags.pop(func)
        queue = self.queues.pop(func)

        await queue.cancel(consumer_tag)

        self.routes.pop(queue.name)


class JsonRPCError(RuntimeError):
    pass


class JsonRPC(RPC):
    SERIALIZER = json
    CONTENT_TYPE = "application/json"

    def serialize(self, data: Any) -> bytes:
        return self.SERIALIZER.dumps(
            data, ensure_ascii=False, default=repr,
        ).encode()

    def serialize_exception(self, exception: Exception) -> Any:
        return {
            "error": {
                "type": exception.__class__.__name__,
                "message": repr(exception),
                "args": exception.args,
            },
        }

    async def deserialize_message(
        self, message: AbstractIncomingMessage,
    ) -> Any:
        payload = await super().deserialize_message(message)
        if message.type == RPCMessageType.ERROR:
            payload = JsonRPCError("RPC exception", payload)
        return payload


__all__ = (
    "JsonRPC",
    "RPC",
    "RPCException",
    "RPCMessageType",
)
