# -*- encoding: utf-8 -*-
"""
Functions for decoding data of various types including field tables and arrays

"""
import datetime
import decimal as _decimal
import typing

from pamqp import common


def by_type(value: bytes,
            data_type: str,
            offset: int = 0) -> typing.Tuple[int, common.FieldValue]:
    """Decodes values using the specified type

    :param value: The binary value to decode
    :param data_type: The data type name of the value
    :param offset: The starting position of the data in the byte stream
    :rtype: :class:`tuple` (:class:`int`, :const:`pamqp.common.FieldValue`)
    :raises ValueError: when the data type is unknown

    """
    if data_type == 'bit':
        return bit(value, offset)
    decoder = METHODS.get(data_type)
    if decoder is None:
        raise ValueError('Unknown type: {}'.format(data_type))
    return decoder(value)


def bit(value: bytes, position: int) -> typing.Tuple[int, bool]:
    """Decode a bit value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :param position: The position in the byte of the bit value
    :rtype: :class:`tuple` (:class:`int`, :class:`bool`)
    :raises ValueError: when the binary data can not be unpacked

    """
    bit_buffer = common.Struct.byte.unpack_from(value)[0]
    try:
        return 0, (bit_buffer & (1 << position)) != 0
    except TypeError:
        raise ValueError('Could not unpack bit value')


def boolean(value: bytes) -> typing.Tuple[int, bool]:
    """Decode a boolean value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`bool`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 1, bool(common.Struct.byte.unpack_from(value[0:1])[0])
    except TypeError:
        raise ValueError('Could not unpack boolean value')


def byte_array(value: bytes) -> typing.Tuple[int, bytearray]:
    """Decode a byte_array value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`bytearray`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        length = common.Struct.integer.unpack(value[0:4])[0]
        return length + 4, bytearray(value[4:length + 4])
    except TypeError:
        raise ValueError('Could not unpack byte array value')


def decimal(value: bytes) -> typing.Tuple[int, _decimal.Decimal]:
    """Decode a decimal value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`decimal.Decimal`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        decimals = common.Struct.byte.unpack(value[0:1])[0]
        raw = common.Struct.integer.unpack(value[1:5])[0]
        return 5, _decimal.Decimal(raw) * (_decimal.Decimal(10)**-decimals)
    except TypeError:
        raise ValueError('Could not unpack decimal value')


def double(value: bytes) -> typing.Tuple[int, float]:
    """Decode a double value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`float`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 8, common.Struct.double.unpack_from(value)[0]
    except TypeError:
        raise ValueError('Could not unpack double value')


def floating_point(value: bytes) -> typing.Tuple[int, float]:
    """Decode a floating point value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`float`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 4, common.Struct.float.unpack_from(value)[0]
    except TypeError:
        raise ValueError('Could not unpack floating point value')


def long_int(value: bytes) -> typing.Tuple[int, int]:
    """Decode a long integer value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 4, common.Struct.long.unpack(value[0:4])[0]
    except TypeError:
        raise ValueError('Could not unpack long integer value')


def long_uint(value: bytes) -> typing.Tuple[int, int]:
    """Decode an unsigned long integer value, returning bytes consumed and
    the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 4, common.Struct.ulong.unpack(value[0:4])[0]
    except TypeError:
        raise ValueError('Could not unpack unsigned long integer value')


def long_long_int(value: bytes) -> typing.Tuple[int, int]:
    """Decode a long-long integer value, returning bytes consumed and the
    value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 8, common.Struct.long_long_int.unpack(value[0:8])[0]
    except TypeError:
        raise ValueError('Could not unpack long-long integer value')


def long_str(value: bytes) -> typing.Tuple[int, typing.Union[str, bytes]]:
    """Decode a string value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`str`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        length = common.Struct.integer.unpack(value[0:4])[0]
        return length + 4, value[4:length + 4].decode('utf-8')
    except TypeError:
        raise ValueError('Could not unpack long string value')
    except UnicodeDecodeError:
        return length + 4, value[4:length + 4]


def octet(value: bytes) -> typing.Tuple[int, int]:
    """Decode an octet value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 1, common.Struct.byte.unpack(value[0:1])[0]
    except TypeError:
        raise ValueError('Could not unpack octet value')


def short_int(value: bytes) -> typing.Tuple[int, int]:
    """Decode a short integer value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 2, common.Struct.short.unpack_from(value[0:2])[0]
    except TypeError:
        raise ValueError('Could not unpack short integer value')


def short_uint(value: bytes) -> typing.Tuple[int, int]:
    """Decode an unsigned short integer value, returning bytes consumed and
    the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 2, common.Struct.ushort.unpack_from(value[0:2])[0]
    except TypeError:
        raise ValueError('Could not unpack unsigned short integer value')


def short_short_int(value: bytes) -> typing.Tuple[int, int]:
    """Decode a short-short integer value, returning bytes consumed and the
    value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 1, common.Struct.short_short_int.unpack_from(value[0:1])[0]
    except TypeError:
        raise ValueError('Could not unpack short-short integer value')


def short_short_uint(value: bytes) -> typing.Tuple[int, int]:
    """Decode a unsigned short-short integer value, returning bytes consumed
    and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`int`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        return 1, common.Struct.short_short_uint.unpack_from(value[0:1])[0]
    except TypeError:
        raise ValueError('Could not unpack unsigned short-short integer value')


def short_str(value: bytes) -> typing.Tuple[int, str]:
    """Decode a string value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`str`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        length = common.Struct.byte.unpack(value[0:1])[0]
        return length + 1, value[1:length + 1].decode('utf-8')
    except TypeError:
        raise ValueError('Could not unpack short string value')


def timestamp(value: bytes) -> typing.Tuple[int, datetime.datetime]:
    """Decode a timestamp value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :class:`datetime.datetime`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        temp = common.Struct.timestamp.unpack(value[0:8])
        ts_value = temp[0]

        # Anything above the year 2106 is likely milliseconds
        if ts_value > 0xFFFFFFFF:
            ts_value /= 1000.0

        return 8, datetime.datetime.fromtimestamp(ts_value,
                                                  tz=datetime.timezone.utc)
    except TypeError:
        raise ValueError('Could not unpack timestamp value')


def embedded_value(value: bytes) -> typing.Tuple[int, common.FieldValue]:
    """Dynamically decode a value based upon the starting byte

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :const:`pamqp.common.FieldValue`)
    :raises ValueError: when the binary data can not be unpacked

    """
    if not value:
        return 0, None
    try:
        bytes_consumed, temp = TABLE_MAPPING[value[0:1]](value[1:])
    except KeyError:
        raise ValueError('Unknown type: {!r}'.format(value[:1]))
    return bytes_consumed + 1, temp


def field_array(value: bytes) -> typing.Tuple[int, common.FieldArray]:
    """Decode a field array value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :const:`pamqp.common.FieldArray`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        length = common.Struct.integer.unpack(value[0:4])[0]
        offset = 4
        data = []
        field_array_end = offset + length
        while offset < field_array_end:
            consumed, result = embedded_value(value[offset:])
            offset += consumed
            data.append(result)
        return offset, data
    except TypeError:
        raise ValueError('Could not unpack data')


def field_table(value: bytes) -> typing.Tuple[int, common.FieldTable]:
    """Decode a field array value, returning bytes consumed and the value.

    :param value: The binary value to decode
    :rtype: :class:`tuple` (:class:`int`, :const:`pamqp.common.FieldTable`)
    :raises ValueError: when the binary data can not be unpacked

    """
    try:
        length = common.Struct.integer.unpack(value[0:4])[0]
        offset = 4
        data = {}
        field_table_end = offset + length
        while offset < field_table_end:
            key_length = common.Struct.byte.unpack_from(value, offset)[0]
            offset += 1
            key = value[offset:offset + key_length].decode('utf-8')
            offset += key_length
            consumed, result = embedded_value(value[offset:])
            offset += consumed
            data[key] = result
        return field_table_end, data
    except TypeError:
        raise ValueError('Could not unpack data')


def void(_: bytes) -> typing.Tuple[int, None]:
    """Return a void, no data to decode

    :param _: The empty bytes object to ignore
    :rtype: :class:`tuple` (:class:`int`, :const:`None`)

    """
    return 0, None


METHODS = {
    'array': field_array,
    'bit': bit,
    'boolean': boolean,
    'byte_array': byte_array,
    'decimal': decimal,
    'double': double,
    'float': floating_point,
    'long': long_uint,
    'longlong': long_long_int,
    'longstr': long_str,
    'octet': octet,
    'short': short_uint,
    'shortstr': short_str,
    'table': field_table,
    'timestamp': timestamp,
    'void': void,
}  # Define a data type mapping to methods for by_type()

# See https://www.rabbitmq.com/amqp-0-9-1-errata.html
TABLE_MAPPING = {
    b't': boolean,
    b'b': short_short_int,
    b'B': short_short_uint,
    b's': short_int,
    b'u': short_uint,
    b'I': long_int,
    b'i': long_uint,
    b'l': long_long_int,
    b'L': long_long_int,
    b'f': floating_point,
    b'd': double,
    b'D': decimal,
    b'S': long_str,
    b'A': field_array,
    b'T': timestamp,
    b'F': field_table,
    b'V': void,
    b'\x00': void,  # While not documented, have seen this in the wild
    b'x': byte_array,
}  # Define a mapping for use in `field_array()` and `field_table()`
