from . import abc, patterns, pool
from .abc import DeliveryMode
from .channel import Channel
from .connection import Connection, connect
from .exceptions import AMQPException, MessageProcessError
from .exchange import Exchange, ExchangeType
from .log import logger
from .message import IncomingMessage, Message
from .queue import Queue
from .robust_channel import RobustChannel
from .robust_connection import RobustConnection, connect_robust
from .robust_exchange import RobustExchange
from .robust_queue import RobustQueue


from importlib.metadata import Distribution
__version__ = Distribution.from_name("aio-pika").version


__all__ = (
    "AMQPException",
    "Channel",
    "Connection",
    "DeliveryMode",
    "Exchange",
    "ExchangeType",
    "IncomingMessage",
    "Message",
    "MessageProcessError",
    "Queue",
    "RobustChannel",
    "RobustConnection",
    "RobustExchange",
    "RobustQueue",
    "__version__",
    "abc",
    "connect",
    "connect_robust",
    "logger",
    "patterns",
    "pool",
)
