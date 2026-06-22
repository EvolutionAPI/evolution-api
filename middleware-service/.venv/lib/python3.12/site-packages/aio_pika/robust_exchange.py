import asyncio
import warnings
from typing import Any, Dict, Union

import aiormq
from pamqp.common import Arguments

from .abc import (
    AbstractChannel, AbstractExchange, AbstractRobustExchange,
    ExchangeParamType, TimeoutType,
)
from .exchange import Exchange, ExchangeType
from .log import get_logger


log = get_logger(__name__)


class RobustExchange(Exchange, AbstractRobustExchange):
    """ Exchange abstraction """

    _bindings: Dict[Union[AbstractExchange, str], Dict[str, Any]]

    def __init__(
        self,
        channel: AbstractChannel,
        name: str,
        type: Union[ExchangeType, str] = ExchangeType.DIRECT,
        *,
        auto_delete: bool = False,
        durable: bool = False,
        internal: bool = False,
        passive: bool = False,
        arguments: Arguments = None,
    ):
        super().__init__(
            channel=channel,
            name=name,
            type=type,
            auto_delete=auto_delete,
            durable=durable,
            internal=internal,
            passive=passive,
            arguments=arguments,
        )

        self._bindings = {}
        self.__restore_lock = asyncio.Lock()

    async def restore(self, channel: Any = None) -> None:
        if channel is not None:
            warnings.warn(
                "Channel argument will be ignored because you "
                "don't need to pass this anymore.",
                DeprecationWarning,
            )
        async with self.__restore_lock:
            try:
                # special case for default exchange
                if self.name == "":
                    return

                await self.declare()

                for exchange, kwargs in tuple(self._bindings.items()):
                    await self.bind(exchange, **kwargs)
            except Exception:
                raise

    async def bind(
        self,
        exchange: ExchangeParamType,
        routing_key: str = "",
        *,
        arguments: Arguments = None,
        timeout: TimeoutType = None,
        robust: bool = True,
    ) -> aiormq.spec.Exchange.BindOk:
        result = await super().bind(
            exchange,
            routing_key=routing_key,
            arguments=arguments,
            timeout=timeout,
        )

        if robust:
            self._bindings[exchange] = dict(
                routing_key=routing_key,
                arguments=arguments,
            )

        return result

    async def unbind(
        self,
        exchange: ExchangeParamType,
        routing_key: str = "",
        arguments: Arguments = None,
        timeout: TimeoutType = None,
    ) -> aiormq.spec.Exchange.UnbindOk:
        result = await super().unbind(
            exchange, routing_key, arguments=arguments, timeout=timeout,
        )
        self._bindings.pop(exchange, None)
        return result


__all__ = ("RobustExchange",)
