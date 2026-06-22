from types import TracebackType
from typing import Optional, Type

import aiormq
from pamqp import commands

from .abc import (
    AbstractChannel, AbstractTransaction, TimeoutType, TransactionState,
)


class Transaction(AbstractTransaction):
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} {self.state.value}>"

    def __str__(self) -> str:
        return self.state.value

    def __init__(self, channel: AbstractChannel):
        self.__channel = channel
        self.state: TransactionState = TransactionState.CREATED

    @property
    def channel(self) -> AbstractChannel:
        if self.__channel is None:
            raise RuntimeError("Channel not opened")

        if self.__channel.is_closed:
            raise RuntimeError("Closed channel")

        return self.__channel

    async def select(
        self, timeout: TimeoutType = None,
    ) -> aiormq.spec.Tx.SelectOk:
        channel = await self.channel.get_underlay_channel()
        result = await channel.tx_select(timeout=timeout)

        self.state = TransactionState.STARTED
        return result

    async def rollback(
        self, timeout: TimeoutType = None,
    ) -> commands.Tx.RollbackOk:
        channel = await self.channel.get_underlay_channel()
        result = await channel.tx_rollback(timeout=timeout)
        self.state = TransactionState.ROLLED_BACK
        return result

    async def commit(
        self, timeout: TimeoutType = None,
    ) -> commands.Tx.CommitOk:
        channel = await self.channel.get_underlay_channel()
        result = await channel.tx_commit(timeout=timeout)
        self.state = TransactionState.COMMITED
        return result

    async def __aenter__(self) -> "Transaction":
        await self.select()
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        if exc_type:
            await self.rollback()
        else:
            await self.commit()
