"""
Base classes for the representation of frames and data structures.

"""
import logging
import struct
import typing

from pamqp import common, decode, encode

LOGGER = logging.getLogger(__name__)


class _AMQData:
    """Base class for AMQ methods and properties for encoding and decoding"""
    __annotations__: typing.Dict = {}
    __slots__: typing.List = []
    name = '_AMQData'

    def __contains__(self, item: str) -> bool:
        """Return if the item is in the attribute list"""
        return item in self.__slots__

    def __getitem__(self, item: str) -> common.FieldValue:
        """Return an attribute as if it were a dict

        :param item: The key to use to retrieve the value
        :rtype: :const:`pamqp.common.FieldValue`
        :raises: KeyError

        """
        return getattr(self, item)

    def __iter__(self) \
            -> typing.Generator[typing.Tuple[str, common.FieldValue],
                                None, None]:
        """Iterate the attributes and values as key, value pairs

        :rtype: (:class:`str`, :const:`pamqp.common.FieldValue`)

        """
        for attribute in self.__slots__:
            yield attribute, getattr(self, attribute)

    def __len__(self) -> int:
        """Return the length of the attribute list"""
        return len(self.__slots__)

    def __repr__(self) -> str:
        """Return the representation of the frame object"""
        return '<{} object at {}>'.format(self.name, hex(id(self)))

    @classmethod
    def amqp_type(cls, attr: str) -> str:
        """Return the AMQP data type for an attribute

        :param attr: The attribute name

        """
        return getattr(cls, '_' + attr)

    @classmethod
    def attributes(cls) -> list:
        """Return the list of attributes"""
        return cls.__slots__


class Frame(_AMQData):
    """Base Class for AMQ Methods for encoding and decoding"""
    frame_id = 0
    index = 0
    synchronous = False
    valid_responses: typing.List = []

    def marshal(self) -> bytes:
        """Dynamically encode the frame by taking the list of attributes and
        encode them item by item getting the value form the object attribute
        and the data type from the class attribute.

        """
        self.validate()
        byte, offset, output, processing_bitset = -1, 0, [], False
        for argument in self.__slots__:
            data_type = self.amqp_type(argument)
            if not processing_bitset and data_type == 'bit':
                byte, offset, processing_bitset = 0, 0, True
            data_value = getattr(self, argument, 0)
            if processing_bitset:
                if data_type != 'bit':
                    processing_bitset = False
                    output.append(encode.octet(byte))
                else:
                    byte = encode.bit(data_value, byte, offset)
                    offset += 1
                    if offset == 8:  # pragma: nocover
                        output.append(encode.octet(byte))
                        processing_bitset = False
                    continue  # pragma: nocover
            output.append(encode.by_type(data_value, data_type))
        if processing_bitset:
            output.append(encode.octet(byte))
        return b''.join(output)

    def unmarshal(self, data: bytes) -> None:
        """Dynamically decode the frame data applying the values to the method
        object by iterating through the attributes in order and decoding them.

        :param data: The raw AMQP frame data

        """
        offset, processing_bitset = 0, False
        for argument in self.__slots__:
            data_type = self.amqp_type(argument)
            if offset == 7 and processing_bitset:  # pragma: nocover
                data = data[1:]
                offset = 0
            if processing_bitset and data_type != 'bit':
                offset = 0
                processing_bitset = False
                data = data[1:]
            consumed, value = decode.by_type(data, data_type, offset)
            if data_type == 'bit':
                offset += 1
                processing_bitset = True
                consumed = 0
            setattr(self, argument, value)
            if consumed:
                data = data[consumed:]

    def validate(self) -> None:
        """Validate the frame data ensuring all domains or attributes adhere
        to the protocol specification.

        :raises: ValueError

        """


class BasicProperties(_AMQData):
    """Provide a base object that marshals and unmarshals the Basic.Properties
    object values.

    """
    flags: typing.Dict[str, int] = {}
    name = 'BasicProperties'

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, BasicProperties):
            raise NotImplementedError
        return all(
            getattr(self, k, None) == getattr(other, k, None)
            for k in self.__slots__)

    def encode_property(self, name: str, value: common.FieldValue) -> bytes:
        """Encode a single property value

        :param name: The name of the property to encode
        :param value: The property to encode
        :type value: :const:`pamqp.common.FieldValue`
        :raises: TypeError

        """
        return encode.by_type(value, self.amqp_type(name))

    def marshal(self) -> bytes:
        """Take the Basic.Properties data structure and marshal it into the
        data structure needed for the ContentHeader.

        """
        flags = 0
        parts = []
        for property_name in self.__slots__:
            property_value = getattr(self, property_name)
            if property_value is not None and property_value != '':
                flags = flags | self.flags[property_name]
                parts.append(
                    self.encode_property(property_name, property_value))
        flag_pieces = []
        while True:
            remainder = flags >> 16
            partial_flags = flags & 0xFFFE
            if remainder != 0:  # pragma: nocover
                partial_flags |= 1
            flag_pieces.append(struct.pack('>H', partial_flags))
            flags = remainder
            if not flags:  # pragma: nocover
                break
        return b''.join(flag_pieces + parts)

    def unmarshal(self, flags: int, data: bytes) -> None:
        """Dynamically decode the frame data applying the values to the method
        object by iterating through the attributes in order and decoding them.

        """
        for property_name in self.__slots__:
            if flags & self.flags[property_name]:
                data_type = getattr(self.__class__, '_' + property_name)
                consumed, value = decode.by_type(data, data_type)
                setattr(self, property_name, value)
                data = data[consumed:]

    def validate(self) -> None:
        """Validate the frame data ensuring all domains or attributes adhere
        to the protocol specification.

        :raises: ValueError

        """
        if self.cluster_id != '':
            raise ValueError('cluster_id must be empty')
        if self.delivery_mode is not None and self.delivery_mode not in [1, 2]:
            raise ValueError('Invalid delivery_mode value: {}'.format(
                self.delivery_mode))
