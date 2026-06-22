from typing import Any, Optional

from pamqp.base import Frame
from pamqp.commands import Basic

from .abc import DeliveredMessage


class AMQPError(Exception):
    reason = "An unspecified AMQP error has occurred: %s"

    def __repr__(self) -> str:
        try:
            return "<%s: %s>" % (
                self.__class__.__name__, self.reason % self.args,
            )
        except TypeError:
            # FIXME: if you are here file an issue
            return f"<{self.__class__.__name__}: {self.args!r}>"


# Backward compatibility
AMQPException = AMQPError


class AMQPConnectionError(AMQPError, ConnectionError):
    reason = "Unexpected connection problem"

    def __repr__(self) -> str:
        if self.args:
            return f"<{self.__class__.__name__}: {self.args!r}>"
        return AMQPError.__repr__(self)


class IncompatibleProtocolError(AMQPConnectionError):
    reason = "The protocol returned by the server is not supported"


class AuthenticationError(AMQPConnectionError):
    reason = (
        "Server and client could not negotiate use of the "
        "authentication mechanisms. Server supports only %r, "
        "but client supports only %r."
    )


class ProbableAuthenticationError(AMQPConnectionError):
    reason = (
        "Client was disconnected at a connection stage indicating a "
        "probable authentication error: %s"
    )


class ConnectionClosed(AMQPConnectionError):
    reason = "The AMQP connection was closed (%s) %s"


class ConnectionSyntaxError(ConnectionClosed):
    reason = (
        "The sender sent a frame that contained illegal values for "
        "one or more fields. This strongly implies a programming error "
        "in the sending peer: %r"
    )


class ConnectionFrameError(ConnectionClosed):
    reason = (
        "The sender sent a malformed frame that the recipient could "
        "not decode. This strongly implies a programming error "
        "in the sending peer: %r"
    )


class ConnectionCommandInvalid(ConnectionClosed):
    reason = (
        "The client sent an invalid sequence of frames, attempting to "
        "perform an operation that was considered invalid by the server."
        " This usually implies a programming error in the client: %r"
    )


class ConnectionChannelError(ConnectionClosed):
    reason = (
        "The client attempted to work with a channel that had not been "
        "correctly opened. This most likely indicates a fault in the "
        "client layer: %r"
    )


class ConnectionUnexpectedFrame(ConnectionClosed):
    reason = (
        "The peer sent a frame that was not expected, usually in the "
        "context of a content header and body. This strongly indicates "
        "a fault in the peer's content processing: %r"
    )


class ConnectionResourceError(ConnectionClosed):
    reason = (
        "The server could not complete the method because it lacked "
        "sufficient resources. This may be due to the client creating "
        "too many of some type of entity: %r"
    )


class ConnectionNotAllowed(ConnectionClosed):
    reason = (
        "The client tried to work with some entity in a manner that is "
        "prohibited by the server, due to security settings or by "
        "some other criteria: %r"
    )


class ConnectionNotImplemented(ConnectionClosed):
    reason = (
        "The client tried to use functionality that is "
        "not implemented in the server: %r"
    )


class ConnectionInternalError(ConnectionClosed):
    reason = (
        " The server could not complete the method because of an "
        "internal error. The server may require intervention by an "
        "operator in order to resume normal operations: %r"
    )


class AMQPChannelError(AMQPError):
    reason = "An unspecified AMQP channel error has occurred"


class ChannelClosed(AMQPChannelError):
    reason = "The channel was closed (%s) %s"


class ChannelAccessRefused(ChannelClosed):
    reason = (
        "The client attempted to work with a server entity to "
        "which it has no access due to security settings: %r"
    )


class ChannelNotFoundEntity(ChannelClosed):
    reason = (
        "The client attempted to work with a server "
        "entity that does not exist: %r"
    )


class ChannelLockedResource(ChannelClosed):
    reason = (
        "The client attempted to work with a server entity to "
        "which it has no access because another client is working "
        "with it: %r"
    )


class ChannelPreconditionFailed(ChannelClosed):
    reason = (
        "The client requested a method that was not allowed because "
        "some precondition failed: %r"
    )


class DuplicateConsumerTag(ChannelClosed):
    reason = "The consumer tag specified already exists for this channel: %s"


class ProtocolSyntaxError(AMQPError):
    reason = "An unspecified protocol syntax error occurred"


class InvalidFrameError(ProtocolSyntaxError):
    reason = "Invalid frame received: %r"


class MethodNotImplemented(AMQPError):
    pass


class DeliveryError(AMQPError):
    __slots__ = "message", "frame"

    reason = "Error when delivery message %r, frame %r"

    def __init__(
        self, message: Optional[DeliveredMessage],
        frame: Frame, *args: Any,
    ):
        self.message = message
        self.frame = frame

        super().__init__(self.message, self.frame)


class PublishError(DeliveryError):
    reason = "%r for routing key %r"

    def __init__(self, message: DeliveredMessage, frame: Frame, *args: Any):
        assert isinstance(message.delivery, Basic.Return)

        self.message = message
        self.frame = frame

        super(DeliveryError, self).__init__(
            message.delivery.reply_text, message.delivery.routing_key, *args,
        )


class ChannelInvalidStateError(RuntimeError):
    pass
