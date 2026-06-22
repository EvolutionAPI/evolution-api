# -*- encoding: utf-8 -*-
"""
AMQP Header Class Definitions

For encoding AMQP Header frames into binary AMQP stream data and decoding AMQP
binary data into AMQP Header frames.

"""
import struct
import typing

from pamqp import commands, constants, decode

BasicProperties = typing.Optional[commands.Basic.Properties]


class ProtocolHeader:
    """Class that represents the AMQP Protocol Header"""
    name = 'ProtocolHeader'

    def __init__(self,
                 major_version: int = constants.VERSION[0],
                 minor_version: int = constants.VERSION[1],
                 revision: int = constants.VERSION[2]):
        """Construct a Protocol Header frame object for the specified AMQP
        version.

        :param major_version: The AMQP major version (``0``)
        :param minor_version: The AMQP major version (``9``)
        :param revision: The AMQP major version (``1``)

        """
        self.major_version = major_version
        self.minor_version = minor_version
        self.revision = revision

    def marshal(self) -> bytes:
        """Return the full AMQP wire protocol frame data representation of the
        ProtocolHeader frame.

        """
        return constants.AMQP + struct.pack('BBBB', 0, self.major_version,
                                            self.minor_version, self.revision)

    def unmarshal(self, data: bytes) -> int:
        """Dynamically decode the frame data applying the values to the method
        object by iterating through the attributes in order and decoding them.

        :param data: The frame value to unpack
        :raises: ValueError

        """
        try:
            (self.major_version, self.minor_version,
             self.revision) = struct.unpack('BBB', data[5:8])
        except struct.error:
            raise ValueError(
                'Could not unpack protocol header from {!r}'.format(data))
        return 8


class ContentHeader:
    """Represent a content header frame

    A Content Header frame is received after a Basic.Deliver or Basic.GetOk
    frame and has the data and properties for the Content Body frames that
    follow.

    """
    name = 'ContentHeader'

    def __init__(self,
                 weight: int = 0,
                 body_size: int = 0,
                 properties: typing.Optional[BasicProperties] = None):
        """Initialize the Exchange.DeleteOk class

        Weight is unused and must be `0`

        :param weight: The unused content weight field
        :param body_size: The size in bytes of the message body
        :param properties: The message properties

        """
        self.class_id = None
        self.weight = weight
        self.body_size = body_size
        self.properties = properties or commands.Basic.Properties()

    def marshal(self) -> bytes:
        """Return the AMQP binary encoded value of the frame"""
        return struct.pack('>HxxQ', commands.Basic.frame_id,
                           self.body_size) + self.properties.marshal()

    def unmarshal(self, data: bytes) -> None:
        """Dynamically decode the frame data applying the values to the method
        object by iterating through the attributes in order and decoding them.

        :param data: The raw frame data to unmarshal

        """
        self.class_id, self.weight, self.body_size = struct.unpack(
            '>HHQ', data[0:12])
        offset, flags = self._get_flags(data[12:])
        self.properties.unmarshal(flags, data[12 + offset:])

    @staticmethod
    def _get_flags(data: bytes) -> typing.Tuple[int, int]:
        """Decode the flags from the data returning the bytes consumed and
        flags.

        """
        bytes_consumed, flags, flagword_index = 0, 0, 0
        while True:
            consumed, partial_flags = decode.short_int(data)
            bytes_consumed += consumed
            flags |= (partial_flags << (flagword_index * 16))
            if not partial_flags & 1:  # pragma: nocover
                break
            flagword_index += 1  # pragma: nocover
        return bytes_consumed, flags
