import asyncio

import pamqp.exceptions
from aiormq.exceptions import (
    AMQPChannelError, AMQPConnectionError, AMQPError, AMQPException,
    AuthenticationError, ChannelClosed, ChannelInvalidStateError,
    ChannelNotFoundEntity, ChannelPreconditionFailed, ConnectionClosed,
    DeliveryError, DuplicateConsumerTag, IncompatibleProtocolError,
    InvalidFrameError, MethodNotImplemented, ProbableAuthenticationError,
    ProtocolSyntaxError, PublishError,
)


CONNECTION_EXCEPTIONS = (
    AMQPError,
    ConnectionError,
    OSError,
    RuntimeError,
    StopAsyncIteration,
    pamqp.exceptions.PAMQPException,
)


class MessageProcessError(AMQPError):
    reason = "%s: %r"


class QueueEmpty(AMQPError, asyncio.QueueEmpty):
    pass


__all__ = (
    "AMQPChannelError",
    "AMQPConnectionError",
    "AMQPError",
    "AMQPException",
    "AuthenticationError",
    "CONNECTION_EXCEPTIONS",
    "ChannelClosed",
    "ChannelInvalidStateError",
    "ChannelNotFoundEntity",
    "ChannelPreconditionFailed",
    "ConnectionClosed",
    "DeliveryError",
    "DuplicateConsumerTag",
    "IncompatibleProtocolError",
    "InvalidFrameError",
    "MessageProcessError",
    "MethodNotImplemented",
    "ProbableAuthenticationError",
    "ProtocolSyntaxError",
    "PublishError",
    "QueueEmpty",
)
