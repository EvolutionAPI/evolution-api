import asyncio
from ssl import SSLContext
from typing import Any, Optional, Tuple, Type, Union
from weakref import WeakSet

import aiormq.abc
from aiormq.connection import parse_bool, parse_timeout
from pamqp.common import FieldTable
from yarl import URL

from .abc import (
    AbstractRobustChannel, AbstractRobustConnection, ConnectionParameter,
    SSLOptions, TimeoutType,
)
from .connection import Connection, make_url
from .exceptions import CONNECTION_EXCEPTIONS
from .log import get_logger
from .robust_channel import RobustChannel
from .tools import CallbackCollection


log = get_logger(__name__)


class RobustConnection(Connection, AbstractRobustConnection):
    """Robust connection"""

    CHANNEL_REOPEN_PAUSE = 1
    CHANNEL_CLASS: Type[RobustChannel] = RobustChannel
    PARAMETERS: Tuple[ConnectionParameter, ...] = Connection.PARAMETERS + (
        ConnectionParameter(
            name="reconnect_interval",
            parser=parse_timeout, default="5",
        ),
        ConnectionParameter(
            name="fail_fast",
            parser=parse_bool, default="1",
        ),
    )

    def __init__(
        self,
        url: URL,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        **kwargs: Any,
    ):
        super().__init__(url=url, loop=loop, **kwargs)

        self.reconnect_interval = self.kwargs.pop("reconnect_interval")
        self.connection_attempt: int = 0

        self.__fail_fast_future = self.loop.create_future()
        self.fail_fast = self.kwargs.pop("fail_fast", True)
        if not self.fail_fast:
            self.__fail_fast_future.set_result(None)

        self.__channels: WeakSet[AbstractRobustChannel] = WeakSet()
        self.__connection_close_event = asyncio.Event()
        self.__connect_timeout: Optional[TimeoutType] = None
        self.__reconnection_task: Optional[asyncio.Task] = None

        self._reconnect_lock = asyncio.Lock()
        self.reconnect_callbacks = CallbackCollection(self)

        self.__connection_close_event.set()

    @property
    def reconnecting(self) -> bool:
        return self._reconnect_lock.locked()

    def __repr__(self) -> str:
        return (
            f'<{self.__class__.__name__}: "{self}" '
            f"{len(self.__channels)} channels>"
        )

    async def _on_connection_close(self, closing: asyncio.Future) -> None:
        await super()._on_connection_close(closing)

        if self._close_called or self.is_closed:
            return

        log.info(
            "Connection to %s closed. Reconnecting after %r seconds.",
            self, self.reconnect_interval,
        )

        self.__connection_close_event.set()

    async def _on_connected(self) -> None:
        await super()._on_connected()

        transport = self.transport
        if transport is None:
            raise RuntimeError("No active transport for connection %r", self)

        try:
            # Make a copy of the channels to iterate on, to guard from
            # concurrent updates to the set.
            for channel in tuple(self.__channels):
                try:
                    await channel.restore()
                except Exception:
                    log.exception("Failed to reopen channel")
                    raise
        except Exception as e:
            await self.close_callbacks(e)
            await asyncio.gather(
                transport.connection.close(e),
                return_exceptions=True,
            )
            raise

        if self.connection_attempt:
            await self.reconnect_callbacks()

        self.connection_attempt += 1
        self.__connection_close_event.clear()

    async def __connection_factory(self) -> None:
        log.debug("Starting connection factory for %r", self)
        while not self.is_closed and not self._close_called:
            log.debug("Waiting for connection close event for %r", self)
            await self.__connection_close_event.wait()

            if self.is_closed or self._close_called:
                return

            # noinspection PyBroadException
            try:
                self.transport = None
                self.connected.clear()

                log.debug("Connection attempt for %r", self)
                await Connection.connect(self, self.__connect_timeout)

                if not self.__fail_fast_future.done():
                    self.__fail_fast_future.set_result(None)

                log.debug("Connection made on %r", self)
            except CONNECTION_EXCEPTIONS as e:
                if not self.__fail_fast_future.done():
                    self.__fail_fast_future.set_exception(e)
                    return

                log.warning(
                    'Connection attempt to "%s" failed: %s. '
                    "Reconnecting after %r seconds.",
                    self, e, self.reconnect_interval,
                )
            except Exception:
                log.exception(
                    "Reconnect attempt failed %s. "
                    "Retrying after %r seconds.",
                    self, self.reconnect_interval,
                )

            await asyncio.sleep(self.reconnect_interval)

    async def connect(self, timeout: TimeoutType = None) -> None:
        self.__connect_timeout = timeout

        if self.is_closed:
            raise RuntimeError(f"{self!r} connection closed")

        if self.reconnecting:
            raise RuntimeError(
                (
                    "Connect method called but connection "
                    f"{self!r} is reconnecting right now."
                ),
                self,
            )

        if not self.__reconnection_task:
            self.__reconnection_task = self.loop.create_task(
                self.__connection_factory(),
            )

        await self.__fail_fast_future
        await self.connected.wait()

    async def reconnect(self) -> None:
        if self.transport:
            await self.transport.connection.close()

        await self.connect()
        await self.reconnect_callbacks()

    def channel(
        self,
        channel_number: Optional[int] = None,
        publisher_confirms: bool = True,
        on_return_raises: bool = False,
    ) -> AbstractRobustChannel:

        channel: AbstractRobustChannel = super().channel(
            channel_number=channel_number,
            publisher_confirms=publisher_confirms,
            on_return_raises=on_return_raises,
        )  # type: ignore

        self.__channels.add(channel)
        return channel

    async def close(
        self, exc: Optional[aiormq.abc.ExceptionType] = asyncio.CancelledError,
    ) -> None:
        if self.__reconnection_task is not None:
            self.__reconnection_task.cancel()
            await asyncio.gather(
                self.__reconnection_task, return_exceptions=True,
            )
            self.__reconnection_task = None

        return await super().close(exc)


async def connect_robust(
    url: Union[str, URL, None] = None,
    *,
    host: str = "localhost",
    port: int = 5672,
    login: str = "guest",
    password: str = "guest",
    virtualhost: str = "/",
    ssl: bool = False,
    loop: Optional[asyncio.AbstractEventLoop] = None,
    ssl_options: Optional[SSLOptions] = None,
    ssl_context: Optional[SSLContext] = None,
    timeout: TimeoutType = None,
    client_properties: Optional[FieldTable] = None,
    connection_class: Type[AbstractRobustConnection] = RobustConnection,
    **kwargs: Any,
) -> AbstractRobustConnection:

    """Make connection to the broker.

    Example:

    .. code-block:: python

        import aio_pika

        async def main():
            connection = await aio_pika.connect(
                "amqp://guest:guest@127.0.0.1/"
            )

    Connect to localhost with default credentials:

    .. code-block:: python

        import aio_pika

        async def main():
            connection = await aio_pika.connect()

    .. note::

        The available keys for ssl_options parameter are:
            * cert_reqs
            * certfile
            * keyfile
            * ssl_version

        For an information on what the ssl_options can be set to reference the
        `official Python documentation`_ .

    Set connection name for RabbitMQ admin panel:

    .. code-block:: python

        # As URL parameter method
        read_connection = await connect(
            "amqp://guest:guest@localhost/?name=Read%20connection"
        )

        # keyword method
        write_connection = await connect(
            client_properties={
                'connection_name': 'Write connection'
            }
        )

    .. note:

        ``client_properties`` argument requires ``aiormq>=2.9``

    URL string might contain ssl parameters e.g.
    `amqps://user:pass@host//?ca_certs=ca.pem&certfile=crt.pem&keyfile=key.pem`

    :param client_properties: add custom client capability.
    :param url:
        RFC3986_ formatted broker address. When :class:`None`
        will be used keyword arguments.
    :param host: hostname of the broker
    :param port: broker port 5672 by default
    :param login: username string. `'guest'` by default.
    :param password: password string. `'guest'` by default.
    :param virtualhost: virtualhost parameter. `'/'` by default
    :param ssl: use SSL for connection. Should be used with addition kwargs.
    :param ssl_options: A dict of values for the SSL connection.
    :param timeout: connection timeout in seconds
    :param loop:
        Event loop (:func:`asyncio.get_event_loop()` when :class:`None`)
    :param ssl_context: ssl.SSLContext instance
    :param connection_class: Factory of a new connection
    :param kwargs: addition parameters which will be passed to the connection.
    :return: :class:`aio_pika.connection.Connection`

    .. _RFC3986: https://goo.gl/MzgYAs
    .. _official Python documentation: https://goo.gl/pty9xA


    """

    connection: AbstractRobustConnection = connection_class(
        make_url(
            url,
            host=host,
            port=port,
            login=login,
            password=password,
            virtualhost=virtualhost,
            ssl=ssl,
            ssl_options=ssl_options,
            client_properties=client_properties,
            **kwargs,
        ),
        loop=loop, ssl_context=ssl_context, **kwargs,
    )

    await connection.connect(timeout=timeout)
    return connection


__all__ = (
    "RobustConnection",
    "connect_robust",
)
