# -*- encoding: utf-8 -*-
"""
AMQP Heartbeat Frame, used to create new Heartbeat frames for sending to a peer

"""
import struct

from pamqp import constants


class Heartbeat(object):
    """Heartbeat frame object mapping class. AMQP Heartbeat frames are mapped
    on to this class for a common access structure to the attributes/data
    values.

    """
    name: str = 'Heartbeat'
    value = struct.pack('>BHI', constants.FRAME_HEARTBEAT, 0, 0) + \
        constants.FRAME_END_CHAR

    @classmethod
    def marshal(cls) -> bytes:
        """Return the binary frame content"""
        return cls.value
