import asyncio
import logging
import platform
import ssl
import sys
from base64 import b64decode
from collections.abc import AsyncIterable
from contextlib import suppress
from io import BytesIO
from types import MappingProxyType, TracebackType
from typing import (
    Any, Awaitable, Callable, Dict, Mapping, Optional, Tuple, Type, Union,
)

import pamqp.frame
from pamqp import commands as spec
from pamqp.base import Frame
from pamqp.common import FieldTable
from pamqp.constants import REPLY_SUCCESS
from pamqp.exceptions import AMQPFrameError, AMQPInternalError, AMQPSyntaxError
from pamqp.frame import FrameTypes
from pamqp.header import ProtocolHeader
from pamqp.heartbeat import Heartbeat
from yarl import URL

from .abc import (
    AbstractChannel, AbstractConnection, ArgumentsType, ChannelFrame,
    ExceptionType, SSLCerts, TaskType, URLorStr,
)
from .auth import AuthMechanism
from .base import Base, task
from .channel import Channel
from .exceptions import (
    AMQPConnectionError, AMQPError, AuthenticationError, ConnectionChannelError,
    ConnectionClosed, ConnectionCommandInvalid, ConnectionFrameError,
    ConnectionInternalError, ConnectionNotAllowed, ConnectionNotImplemented,
    ConnectionResourceError, ConnectionSyntaxError, ConnectionUnexpectedFrame,
    IncompatibleProtocolError, ProbableAuthenticationError,
)
from .tools import Countdown, censor_url


# noinspection PyUnresolvedReferences
try:
    from importlib.metadata import Distribution
    __version__ = Distribution.from_name("aiormq").version
except ImportError:
    import pkg_resources
    __version__ = pkg_resources.get_distribution("aiormq").version


log = logging.getLogger(__name__)

CHANNEL_CLOSE_RESPONSES = (spec.Channel.Close, spec.Channel.CloseOk)

DEFAULT_PORTS = {
    "amqp": 5672,
    "amqps": 5671,
}


PRODUCT = "aiormq"
PLATFORM = "{} {} ({} build {})".format(
    platform.python_implementation(),
    platform.python_version(),
    *platform.python_build(),
)


TimeType = Union[float, int]
TimeoutType = Optional[TimeType]
ReceivedFrame = Tuple[int, int, FrameTypes]


EXCEPTION_MAPPING = MappingProxyType({
    501: ConnectionFrameError,
    502: ConnectionSyntaxError,
    503: ConnectionCommandInvalid,
    504: ConnectionChannelError,
    505: ConnectionUnexpectedFrame,
    506: ConnectionResourceError,
    530: ConnectionNotAllowed,
    540: ConnectionNotImplemented,
    541: ConnectionInternalError,
})


def exception_by_code(frame: spec.Connection.Close) -> AMQPError:
    if frame.reply_code is None:
        return ConnectionClosed(frame.reply_code, frame.reply_text)

    exc_class = EXCEPTION_MAPPING.get(frame.reply_code)

    if exc_class is None:
        return ConnectionClosed(frame.reply_code, frame.reply_text)

    return exc_class(frame.reply_text)


def parse_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v

    v = str(v)
    return v.lower() in (
        "true", "yes", "y", "enable", "on", "enabled", "1"
    )


def parse_int(v: Any) -> int:
    if isinstance(v, int):
        return v

    v = str(v)
    try:
        return int(v)
    except ValueError:
        return 0


def parse_timeout(v: Any) -> TimeoutType:
    if isinstance(v, float):
        if v.is_integer():
            return int(v)
        return v

    if isinstance(v, int):
        return v

    v = str(v)
    try:
        if "." in v:
            result = float(v)
            if result.is_integer():
                return int(result)
            return result
        return int(v)
    except ValueError:
        return 0


def parse_heartbeat(v: str) -> int:
    result = parse_int(v)
    return result if 0 <= result < 65535 else 0


def parse_connection_name(connection_name: Optional[str]) -> Dict[str, str]:
    if not connection_name or not isinstance(connection_name, str):
        return {}
    return dict(connection_name=connection_name)


class FrameReceiver(AsyncIterable):
    _loop: asyncio.AbstractEventLoop

    def __init__(
        self, reader: asyncio.StreamReader,
    ):
        self.reader: asyncio.StreamReader = reader
        self.started: bool = False
        self.lock = asyncio.Lock()

    @property
    def loop(self) -> asyncio.AbstractEventLoop:
        if not hasattr(self, "_loop"):
            self._loop = asyncio.get_event_loop()
        return self._loop

    def __aiter__(self) -> "FrameReceiver":
        return self

    async def get_frame(self) -> ReceivedFrame:
        if self.reader.at_eof():
            del self.reader
            raise StopAsyncIteration

        with BytesIO() as fp:
            async with self.lock:
                try:
                    fp.write(await self.reader.readexactly(1))

                    if fp.getvalue() == b"\0x00":
                        fp.write(await self.reader.read())
                        raise AMQPFrameError(fp.getvalue())

                    if self.reader is None:
                        raise AMQPConnectionError()

                    fp.write(await self.reader.readexactly(6))

                    if not self.started and fp.getvalue().startswith(b"AMQP"):
                        raise AMQPSyntaxError
                    else:
                        self.started = True

                    frame_type, _, frame_length = pamqp.frame.frame_parts(
                        fp.getvalue(),
                    )
                    if frame_length is None:
                        raise AMQPInternalError("No frame length", None)

                    fp.write(await self.reader.readexactly(frame_length + 1))
                except asyncio.IncompleteReadError as e:
                    raise AMQPConnectionError(
                        "Server connection unexpectedly closed. "
                        f"Read {len(e.partial)} bytes but {e.expected} "
                        "bytes expected",
                    ) from e
                except ConnectionRefusedError as e:
                    raise AMQPConnectionError(
                        f"Server connection refused: {e!r}",
                    ) from e
                except ConnectionResetError as e:
                    raise AMQPConnectionError(
                        f"Server connection reset: {e!r}",
                    ) from e
                except ConnectionError as e:
                    raise AMQPConnectionError(
                        f"Server connection error: {e!r}",
                    ) from e
                except OSError as e:
                    raise AMQPConnectionError(
                        f"Server communication error: {e!r}",
                    ) from e

            return pamqp.frame.unmarshal(fp.getvalue())

    async def __anext__(self) -> ReceivedFrame:
        return await self.get_frame()


class FrameGenerator(AsyncIterable):
    def __init__(self, queue: asyncio.Queue):
        self.queue: asyncio.Queue = queue
        self.close_event: asyncio.Event = asyncio.Event()

    def __aiter__(self) -> "FrameGenerator":
        return self

    async def __anext__(self) -> ChannelFrame:
        if self.close_event.is_set():
            raise StopAsyncIteration

        frame: ChannelFrame = await self.queue.get()
        self.queue.task_done()
        return frame


class Connection(Base, AbstractConnection):
    FRAME_BUFFER_SIZE = 10
    # Interval between sending heartbeats based on the heartbeat(timeout)
    HEARTBEAT_INTERVAL_MULTIPLIER = 0.5
    # Allow three missed heartbeats (based on heartbeat(timeout)
    HEARTBEAT_GRACE_MULTIPLIER = 3

    READER_CLOSE_TIMEOUT = 2

    _reader_task: TaskType
    _writer_task: TaskType
    __create_connection_kwargs: Mapping[str, Any]

    write_queue: asyncio.Queue
    server_properties: ArgumentsType
    connection_tune: spec.Connection.Tune
    channels: Dict[int, Optional[AbstractChannel]]

    @staticmethod
    def _parse_ca_data(data: Optional[str]) -> Optional[bytes]:
        return b64decode(data) if data else None

    def __init__(
        self,
        url: URLorStr,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        context: Optional[ssl.SSLContext] = None,
        **create_connection_kwargs: Any,
    ):

        super().__init__(loop=loop or asyncio.get_event_loop(), parent=None)

        self.url = URL(url)
        if self.url.is_absolute() and not self.url.port:
            self.url = self.url.with_port(DEFAULT_PORTS[self.url.scheme])

        if self.url.path == "/" or not self.url.path:
            self.vhost = "/"
        else:
            quoted_vhost = self.url.path[1:]
            # yarl>=1.9.5 skips unquoting backslashes in path
            self.vhost = quoted_vhost.replace("%2F", "/")

        self.ssl_context = context
        self.ssl_certs = SSLCerts(
            cafile=self.url.query.get("cafile"),
            capath=self.url.query.get("capath"),
            cadata=self._parse_ca_data(self.url.query.get("cadata")),
            key=self.url.query.get("keyfile"),
            cert=self.url.query.get("certfile"),
            verify=self.url.query.get("no_verify_ssl", "0") == "0",
        )

        self.started = False
        self.channels = {}
        self.write_queue = asyncio.Queue(
            maxsize=self.FRAME_BUFFER_SIZE,
        )

        self.last_channel = 1

        self.timeout = parse_int(self.url.query.get("timeout", "60"))
        self.heartbeat_timeout = parse_heartbeat(
            self.url.query.get("heartbeat", "60"),
        )
        self.last_channel_lock = asyncio.Lock()
        self.connected = asyncio.Event()
        self.connection_name = self.url.query.get("name")

        self.__close_reply_code: int = REPLY_SUCCESS
        self.__close_reply_text: str = "normally closed"
        self.__close_class_id: int = 0
        self.__close_method_id: int = 0
        self.__update_secret_lock: asyncio.Lock = asyncio.Lock()
        self.__update_secret_future: Optional[asyncio.Future] = None
        self.__connection_unblocked: asyncio.Event = asyncio.Event()
        self.__heartbeat_grace_timeout = (
            (self.heartbeat_timeout + 1) * self.HEARTBEAT_GRACE_MULTIPLIER
        )
        self.__last_frame_time: float = self.loop.time()
        self.__create_connection_kwargs = create_connection_kwargs

    async def ready(self) -> None:
        await self.connected.wait()
        await self.__connection_unblocked.wait()

    def set_close_reason(
        self, reply_code: int = REPLY_SUCCESS,
        reply_text: str = "normally closed",
        class_id: int = 0, method_id: int = 0,
    ) -> None:
        self.__close_reply_code = reply_code
        self.__close_reply_text = reply_text
        self.__close_class_id = class_id
        self.__close_method_id = method_id

    @property
    def is_opened(self) -> bool:
        is_reader_running = (
            hasattr(self, "_reader_task") and not self._reader_task.done()
        )
        is_writer_running = (
            hasattr(self, "_writer_task") and not self._writer_task.done()
        )

        return (
            is_reader_running and
            is_writer_running and
            not self.is_closed
        )

    def __str__(self) -> str:
        return str(censor_url(self.url))

    def _get_ssl_context(self) -> ssl.SSLContext:
        context = ssl.create_default_context(
            ssl.Purpose.SERVER_AUTH,
            capath=self.ssl_certs.capath,
            cafile=self.ssl_certs.cafile,
            cadata=self.ssl_certs.cadata,
        )

        if self.ssl_certs.cert:
            context.load_cert_chain(self.ssl_certs.cert, self.ssl_certs.key)

        if not self.ssl_certs.verify:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

        return context

    def _client_properties(self, **kwargs: Any) -> Dict[str, Any]:
        properties = {
            "platform": PLATFORM,
            "version": __version__,
            "product": PRODUCT,
            "capabilities": {
                "authentication_failure_close": True,
                "basic.nack": True,
                "connection.blocked": True,
                "consumer_cancel_notify": True,
                "publisher_confirms": True,
            },
            "information": "See https://github.com/mosquito/aiormq/",
        }

        properties.update(
            parse_connection_name(self.connection_name),
        )
        properties.update(kwargs)
        return properties

    def _credentials_class(
        self,
        start_frame: spec.Connection.Start,
    ) -> AuthMechanism:
        auth_requested = self.url.query.get("auth", "plain").upper()
        auth_available = start_frame.mechanisms.split()
        if auth_requested in auth_available:
            with suppress(KeyError):
                return AuthMechanism[auth_requested]
        raise AuthenticationError(
            start_frame.mechanisms, [m.name for m in AuthMechanism],
        )

    @staticmethod
    async def _rpc(
        request: Frame, writer: asyncio.StreamWriter,
        frame_receiver: FrameReceiver,
        wait_response: bool = True,
    ) -> Optional[FrameTypes]:

        writer.write(pamqp.frame.marshal(request, 0))
        await writer.drain()

        if not wait_response:
            return None

        _, _, frame = await frame_receiver.get_frame()

        if request.synchronous and frame.name not in request.valid_responses:
            raise AMQPInternalError(
                "one of {!r}".format(request.valid_responses), frame,
            )
        elif isinstance(frame, spec.Connection.Close):
            if frame.reply_code == 403:
                raise ProbableAuthenticationError(frame.reply_text)
            raise ConnectionClosed(frame.reply_code, frame.reply_text)
        return frame

    @task
    async def connect(
        self, client_properties: Optional[FieldTable] = None,
    ) -> bool:
        if self.is_opened:
            raise RuntimeError("Connection already opened")

        ssl_context = self.ssl_context

        if ssl_context is None and self.url.scheme == "amqps":
            ssl_context = await self.loop.run_in_executor(
                None, self._get_ssl_context,
            )
            self.ssl_context = ssl_context

        log.debug("Connecting to: %s", self)
        try:
            reader, writer = await asyncio.open_connection(
                self.url.host, self.url.port, ssl=ssl_context,
                **self.__create_connection_kwargs,
            )

            frame_receiver = FrameReceiver(reader)
        except OSError as e:
            raise AMQPConnectionError(*e.args) from e

        frame: Optional[FrameTypes]

        try:
            protocol_header = ProtocolHeader()
            writer.write(protocol_header.marshal())

            _, _, frame = await frame_receiver.get_frame()
        except EOFError as e:
            raise IncompatibleProtocolError(*e.args) from e

        if not isinstance(frame, spec.Connection.Start):
            raise AMQPInternalError("Connection.StartOk", frame)

        credentials = self._credentials_class(frame)

        server_properties: ArgumentsType = frame.server_properties

        try:
            frame = await self._rpc(
                spec.Connection.StartOk(
                    client_properties=self._client_properties(
                        **(client_properties or {}),
                    ),
                    mechanism=credentials.name,
                    response=credentials.value(self).marshal(),
                ),
                writer=writer,
                frame_receiver=frame_receiver,
            )

            if not isinstance(frame, spec.Connection.Tune):
                raise AMQPInternalError("Connection.Tune", frame)

            connection_tune: spec.Connection.Tune = frame
            connection_tune.heartbeat = self.heartbeat_timeout

            await self._rpc(
                spec.Connection.TuneOk(
                    channel_max=connection_tune.channel_max,
                    frame_max=connection_tune.frame_max,
                    heartbeat=connection_tune.heartbeat,
                ),
                writer=writer,
                frame_receiver=frame_receiver,
                wait_response=False,
            )

            frame = await self._rpc(
                spec.Connection.Open(virtual_host=self.vhost),
                writer=writer,
                frame_receiver=frame_receiver,
            )

            if not isinstance(frame, spec.Connection.OpenOk):
                raise AMQPInternalError("Connection.OpenOk", frame)
        except BaseException as e:
            await self.__close_writer(writer)
            await self.close(e)
            raise

        # noinspection PyAsyncCall
        self._reader_task = self.create_task(self.__reader(frame_receiver))
        self._reader_task.add_done_callback(self._on_reader_done)

        # noinspection PyAsyncCall
        self._writer_task = self.create_task(self.__writer(writer))

        self.connection_tune = connection_tune
        self.server_properties = server_properties
        return True

    def _on_reader_done(self, task: asyncio.Task) -> None:
        log.debug("Reader exited for %r", self)

        if not task.cancelled() and task.exception() is not None:
            log.debug("Cancelling cause reader exited abnormally")
            self.set_close_reason(
                reply_code=500, reply_text="reader unexpected closed",
            )

        async def close_writer_task() -> None:
            if not self._writer_task.done():
                self._writer_task.cancel()
                await asyncio.gather(self._writer_task, return_exceptions=True)
            try:
                exc = task.exception()
            except asyncio.CancelledError as e:
                exc = e
            await self.close(exc)

        self.loop.create_task(close_writer_task())

    async def __handle_close_ok(self, _: spec.Connection.CloseOk) -> None:
        return

    async def __handle_heartbeat(self, _: Heartbeat) -> None:
        return

    async def __handle_close(self, frame: spec.Connection.Close) -> None:
        log.exception(
            "Unexpected connection close from remote \"%s\", "
            "Connection.Close(reply_code=%r, reply_text=%r)",
            self, frame.reply_code, frame.reply_text,
        )

        with suppress(asyncio.QueueFull):
            self.write_queue.put_nowait(
                ChannelFrame.marshall(
                    channel_number=0,
                    frames=[spec.Connection.CloseOk()],
                ),
            )

        exception = exception_by_code(frame)

        if (
            self.__update_secret_future is not None and
            not self.__update_secret_future.done()
        ):
            self.__update_secret_future.set_exception(exception)
        raise exception

    async def __handle_channel_close_ok(
        self, _: spec.Channel.CloseOk,
    ) -> None:
        self.channels.pop(0, None)

    async def __handle_channel_update_secret_ok(
        self, frame: spec.Connection.UpdateSecretOk,
    ) -> None:
        if (
            self.__update_secret_future is not None and
            not self.__update_secret_future.done()
        ):
            self.__update_secret_future.set_result(frame)
            return
        log.warning("Got unexpected UpdateSecretOk frame")

    async def __handle_connection_blocked(
        self, frame: spec.Connection.Blocked,
    ) -> None:
        log.warning("Connection %r was blocked by: %r", self, frame.reason)
        self.__connection_unblocked.clear()

    async def __handle_connection_unblocked(
        self, _: spec.Connection.Unblocked,
    ) -> None:
        log.warning("Connection %r was unblocked", self)
        self.__connection_unblocked.set()

    async def __reader(self, frame_receiver: FrameReceiver) -> None:
        self.__connection_unblocked.set()
        self.connected.set()

        # Not very optimal, but avoid creating a task for each frame sending
        # noinspection PyAsyncCall
        if self.heartbeat_timeout > 0:
            self.create_task(self.__heartbeat())

        channel_frame_handlers: Mapping[Any, Callable[[Any], Awaitable[None]]]
        channel_frame_handlers = {
            spec.Connection.CloseOk: self.__handle_close_ok,
            spec.Connection.Close: self.__handle_close,
            Heartbeat: self.__handle_heartbeat,
            spec.Channel.CloseOk: self.__handle_channel_close_ok,
            spec.Connection.UpdateSecretOk: (
                self.__handle_channel_update_secret_ok
            ),
            spec.Connection.Blocked: self.__handle_connection_blocked,
            spec.Connection.Unblocked: self.__handle_connection_unblocked,
        }

        try:
            async for weight, channel, frame in frame_receiver:
                self.__last_frame_time = self.loop.time()

                log.debug(
                    "Received frame %r in channel #%d weight=%s on %r",
                    frame, channel, weight, self,
                )

                if channel == 0:
                    handler = channel_frame_handlers.get(type(frame))

                    if handler is None:
                        log.error("Unexpected frame %r", frame)
                        continue

                    await handler(frame)
                    continue

                ch: Optional[AbstractChannel] = self.channels.get(channel)
                if ch is None:
                    log.error(
                        "Got frame for closed channel %d: %r", channel, frame,
                    )
                    continue

                if isinstance(frame, CHANNEL_CLOSE_RESPONSES):
                    self.channels[channel] = None

                await ch.frames.put((weight, frame))
        except asyncio.CancelledError:
            if self.is_connection_was_stuck:
                log.warning(
                    "Server connection %r was stuck. No frames were received "
                    "in %d seconds.", self, self.__heartbeat_grace_timeout,
                )
                self._writer_task.cancel()
            raise

    @property
    def is_connection_was_stuck(self) -> bool:
        delay = self.loop.time() - self.__last_frame_time
        return delay > self.__heartbeat_grace_timeout

    async def __heartbeat(self) -> None:
        heartbeat_timeout = max(1, self.heartbeat_timeout // 2)
        heartbeat = ChannelFrame.marshall(
            frames=[Heartbeat()], channel_number=0,
        )

        while not self.closing.done():
            if self.is_connection_was_stuck:
                self._reader_task.cancel()
                return

            await asyncio.sleep(heartbeat_timeout)

            try:
                await asyncio.wait_for(
                    self.write_queue.put(heartbeat),
                    timeout=self.__heartbeat_grace_timeout,
                )
            except asyncio.TimeoutError:
                self._reader_task.cancel()
                return

    async def __writer(self, writer: asyncio.StreamWriter) -> None:
        channel_frame: ChannelFrame

        try:
            frame_iterator = FrameGenerator(self.write_queue)
            self.closing.add_done_callback(
                lambda _: frame_iterator.close_event.set(),
            )

            if not self.__connection_unblocked.is_set():
                await self.__connection_unblocked.wait()

            async for channel_frame in frame_iterator:
                log.debug("Prepare to send %r", channel_frame)

                writer.write(channel_frame.payload)
                if channel_frame.should_close:
                    await writer.drain()
                    channel_frame.drain()
                    return

                if channel_frame.should_drain:
                    await writer.drain()
                    channel_frame.drain()

        except asyncio.CancelledError:
            if not self.__check_writer(writer) or self.is_connection_was_stuck:
                raise

            frame = spec.Connection.Close(
                reply_code=self.__close_reply_code,
                reply_text=self.__close_reply_text,
                class_id=self.__close_class_id,
                method_id=self.__close_method_id,
            )

            writer.write(ChannelFrame.marshall(0, [frame]).payload)

            log.debug("Sending %r to %r", frame, self)

            try:
                await asyncio.wait_for(
                    writer.drain(), timeout=self.__heartbeat_grace_timeout,
                )
            finally:
                await self.__close_writer(writer)

            raise
        finally:
            log.debug("Writer exited for %r", self)

    if sys.version_info < (3, 7):
        async def __close_writer(self, writer: asyncio.StreamWriter) -> None:
            log.debug("Writer on connection %s closed", self)
            writer.close()
    else:
        async def __close_writer(self, writer: asyncio.StreamWriter) -> None:
            log.debug("Writer on connection %s closed", self)
            with suppress(OSError, RuntimeError):
                if writer.can_write_eof():
                    writer.write_eof()
                writer.close()
                await writer.wait_closed()

    @staticmethod
    def __check_writer(writer: asyncio.StreamWriter) -> bool:
        if writer is None:
            return False

        if hasattr(writer, "is_closing"):
            return not writer.is_closing()

        if writer.transport:
            return not writer.transport.is_closing()

        return writer.can_write_eof()

    async def _on_close(
        self,
        ex: Optional[ExceptionType] = ConnectionClosed(0, "normal closed"),
    ) -> None:
        log.debug("Closing connection %r cause: %r", self, ex)
        if not self._reader_task.done():
            self._reader_task.cancel()
        if not self._writer_task.done():
            self._writer_task.cancel()

        await asyncio.gather(
            self._reader_task, self._writer_task, return_exceptions=True,
        )

    @property
    def server_capabilities(self) -> ArgumentsType:
        return self.server_properties["capabilities"]   # type: ignore

    @property
    def basic_nack(self) -> bool:
        return bool(self.server_capabilities.get("basic.nack"))

    @property
    def consumer_cancel_notify(self) -> bool:
        return bool(self.server_capabilities.get("consumer_cancel_notify"))

    @property
    def exchange_exchange_bindings(self) -> bool:
        return bool(self.server_capabilities.get("exchange_exchange_bindings"))

    @property
    def publisher_confirms(self) -> Optional[bool]:
        publisher_confirms = self.server_capabilities.get("publisher_confirms")
        if publisher_confirms is None:
            return None
        return bool(publisher_confirms)

    async def channel(
        self,
        channel_number: Optional[int] = None,
        publisher_confirms: bool = True,
        frame_buffer_size: int = FRAME_BUFFER_SIZE,
        timeout: TimeoutType = None,
        **kwargs: Any,
    ) -> AbstractChannel:

        await self.connected.wait()

        if self.is_closed:
            raise RuntimeError("%r closed" % self)

        if not self.publisher_confirms and publisher_confirms:
            raise ValueError("Server doesn't support publisher_confirms")

        if channel_number is None:
            async with self.last_channel_lock:
                if self.channels:
                    self.last_channel = max(self.channels.keys())

                while self.last_channel in self.channels.keys():
                    self.last_channel += 1

                    if self.last_channel > 65535:
                        log.warning("Resetting channel number for %r", self)
                        self.last_channel = 1
                        # switching context for prevent blocking event-loop
                        await asyncio.sleep(0)

                channel_number = self.last_channel
        elif channel_number in self.channels:
            raise ValueError("Channel %d already used" % channel_number)

        if channel_number < 0 or channel_number > 65535:
            raise ValueError("Channel number too large")

        channel = Channel(
            self,
            channel_number,
            frame_buffer=frame_buffer_size,
            publisher_confirms=publisher_confirms,
            **kwargs,
        )

        self.channels[channel_number] = channel

        try:
            await channel.open(timeout=timeout)
        except Exception:
            self.channels[channel_number] = None
            raise

        return channel

    async def update_secret(
        self, new_secret: str, *,
        reason: str = "", timeout: TimeoutType = None,
    ) -> spec.Connection.UpdateSecretOk:
        channel_frame = ChannelFrame.marshall(
            channel_number=0,
            frames=[
                spec.Connection.UpdateSecret(
                    new_secret=new_secret, reason=reason,
                ),
            ],
        )

        countdown = Countdown(timeout)

        async with countdown.enter_context(self.__update_secret_lock):
            self.__update_secret_future = self.loop.create_future()
            await self.write_queue.put(channel_frame)
            try:
                response: spec.Connection.UpdateSecretOk = (
                    await countdown(self.__update_secret_future)
                )
            finally:
                self.__update_secret_future = None
        return response

    async def __aenter__(self) -> AbstractConnection:
        if not self.is_opened:
            await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self.close(exc_val)


async def connect(
    url: URLorStr, *args: Any, client_properties: Optional[FieldTable] = None,
    **kwargs: Any,
) -> AbstractConnection:
    connection = Connection(url, *args, **kwargs)

    await connection.connect(client_properties or {})
    return connection
