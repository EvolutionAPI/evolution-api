import asyncio
from ssl import SSLContext
from types import TracebackType
from typing import (
    Any, Awaitable, Dict, Literal, Optional, Tuple, Type, TypeVar, Union
)


import aiormq.abc
from aiormq.connection import parse_int
from pamqp.common import FieldTable
from yarl import URL

from .abc import (
    AbstractChannel, AbstractConnection, ConnectionParameter, SSLOptions,
    TimeoutType, UnderlayConnection,
)
from .channel import Channel
from .exceptions import ConnectionClosed
from .log import get_logger
from .tools import CallbackCollection


log = get_logger(__name__)
T = TypeVar("T")


class Connection(AbstractConnection):
    """ Connection abstraction """

    CHANNEL_CLASS: Type[Channel] = Channel
    PARAMETERS: Tuple[ConnectionParameter, ...] = (
        ConnectionParameter(
            name="interleave",
            parser=parse_int,
            is_kwarg=True,
        ),
        ConnectionParameter(
            name="happy_eyeballs_delay",
            parser=float,
            is_kwarg=True,
        ),
    )

    _closed: asyncio.Future

    @property
    def is_closed(self) -> bool:
        return self._closed.done()

    async def close(
        self, exc: Optional[aiormq.abc.ExceptionType] = ConnectionClosed,
    ) -> None:
        transport, self.transport = self.transport, None
        self._close_called = True
        if not transport:
            return
        await transport.close(exc)
        if not self._closed.done():
            self._closed.set_result(True)

    def closed(self) -> Awaitable[Literal[True]]:
        return self._closed

    @classmethod
    def _parse_parameters(cls, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        result = {}
        for parameter in cls.PARAMETERS:
            value = kwargs.get(parameter.name, parameter.default)

            if parameter.is_kwarg and value is None:
                # skip optional value
                continue

            result[parameter.name] = parameter.parse(value)
        return result

    def __init__(
        self, url: URL, loop: Optional[asyncio.AbstractEventLoop] = None,
        ssl_context: Optional[SSLContext] = None, **kwargs: Any,
    ):
        self.loop = loop or asyncio.get_event_loop()
        self.transport = None
        self._closed = self.loop.create_future()
        self._close_called = False

        self.url = URL(url)

        self.kwargs: Dict[str, Any] = self._parse_parameters(
            kwargs or dict(self.url.query),
        )
        self.kwargs["context"] = ssl_context
        self.close_callbacks = CallbackCollection(self)
        self.connected: asyncio.Event = asyncio.Event()

    def __str__(self) -> str:
        url = self.url
        if url.password:
            url = url.with_password("******")
        return str(url)

    def __repr__(self) -> str:
        return f'<{self.__class__.__name__}: "{self}">'

    async def _on_connection_close(self, closing: asyncio.Future) -> None:
        try:
            exc = closing.exception()
        except asyncio.CancelledError as e:
            exc = e
        self.connected.clear()
        await self.close_callbacks(exc)

    async def _on_connected(self) -> None:
        self.connected.set()

    async def connect(self, timeout: TimeoutType = None) -> None:
        """ Connect to AMQP server. This method should be called after
        :func:`aio_pika.connection.Connection.__init__`

        .. note::
            This method is called by :func:`connect`.
            You shouldn't call it explicitly.

        """
        self.transport = await UnderlayConnection.connect(
            self.url, self._on_connection_close,
            timeout=timeout, **self.kwargs,
        )
        await self._on_connected()

    def channel(
        self,
        channel_number: Optional[int] = None,
        publisher_confirms: bool = True,
        on_return_raises: bool = False,
    ) -> AbstractChannel:
        """ Coroutine which returns new instance of :class:`Channel`.

        Example:

        .. code-block:: python

            import aio_pika

            async def main(loop):
                connection = await aio_pika.connect(
                    "amqp://guest:guest@127.0.0.1/"
                )

                channel1 = connection.channel()
                await channel1.close()

                # Creates channel with specific channel number
                channel42 = connection.channel(42)
                await channel42.close()

                # For working with transactions
                channel_no_confirms = await connection.channel(
                    publisher_confirms=False
                )
                await channel_no_confirms.close()

        Also available as an asynchronous context manager:

        .. code-block:: python

            import aio_pika

            async def main(loop):
                connection = await aio_pika.connect(
                    "amqp://guest:guest@127.0.0.1/"
                )

                async with connection.channel() as channel:
                    # channel is open and available

                # channel is now closed

        :param channel_number: specify the channel number explicit
        :param publisher_confirms:
            if `True` the :func:`aio_pika.Exchange.publish` method will be
            return :class:`bool` after publish is complete. Otherwise the
            :func:`aio_pika.Exchange.publish` method will be return
            :class:`None`
        :param on_return_raises:
            raise an :class:`aio_pika.exceptions.DeliveryError`
            when mandatory message will be returned
        """

        if not self.transport:
            raise RuntimeError("Connection was not opened")

        log.debug("Creating AMQP channel for connection: %r", self)

        channel = self.CHANNEL_CLASS(
            connection=self,
            channel_number=channel_number,
            publisher_confirms=publisher_confirms,
            on_return_raises=on_return_raises,
        )

        log.debug("Channel created: %r", channel)
        return channel

    async def ready(self) -> None:
        await self.connected.wait()

    def __del__(self) -> None:
        if (
            self.is_closed or
            self.loop.is_closed()
        ):
            return

        asyncio.ensure_future(self.close())

    async def __aenter__(self) -> "Connection":
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self.close()

    async def update_secret(
        self, new_secret: str, *,
        reason: str = "", timeout: TimeoutType = None,
    ) -> aiormq.spec.Connection.UpdateSecretOk:
        if self.transport is None:
            raise RuntimeError("Connection is not ready")

        result = await self.transport.connection.update_secret(
            new_secret=new_secret, reason=reason, timeout=timeout,
        )
        self.url = self.url.with_password(new_secret)
        return result


def make_url(
    url: Union[str, URL, None] = None,
    *,
    host: str = "localhost",
    port: int = 5672,
    login: str = "guest",
    password: str = "guest",
    virtualhost: str = "/",
    ssl: bool = False,
    ssl_options: Optional[SSLOptions] = None,
    client_properties: Optional[FieldTable] = None,
    **kwargs: Any,
) -> URL:
    if url is not None:
        if not isinstance(url, URL):
            return URL(url)
        return url

    kw = kwargs
    kw.update(ssl_options or {})
    kw.update(client_properties or {})

    # sanitize keywords
    kw = {k: v for k, v in kw.items() if v is not None}

    return URL.build(
        scheme="amqps" if ssl else "amqp",
        host=host,
        port=port,
        user=login,
        password=password,
        # yarl >= 1.3.0 requires path beginning with slash
        path="/" + virtualhost,
        query=kw,
    )


async def connect(
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
    connection_class: Type[AbstractConnection] = Connection,
    **kwargs: Any,
) -> AbstractConnection:
    """ Make connection to the broker.

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

        write_connection = await connect(
            client_properties={
                'connection_name': 'Write connection'
            }
        )

    .. note:

        ``client_properties`` argument requires ``aiormq>=2.9``

    URL string might be containing ssl parameters e.g.
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

    connection: AbstractConnection = connection_class(
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
        loop=loop,
        ssl_context=ssl_context,
        **kwargs,
    )

    await connection.connect(timeout=timeout)
    return connection


__all__ = ("Connection", "connect", "make_url")
