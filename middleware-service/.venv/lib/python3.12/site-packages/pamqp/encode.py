# -*- encoding: utf-8 -*-
"""
Functions for encoding data of various types including field tables and arrays

"""
import calendar
import datetime
import decimal as _decimal
import logging
import struct
import time
import typing

from pamqp import common

LOGGER = logging.getLogger(__name__)

DEPRECATED_RABBITMQ_SUPPORT = False
"""Toggle to support older versions of RabbitMQ."""


def support_deprecated_rabbitmq(enabled: bool = True) -> None:
    """Toggle the data types available in field-tables

    If called with `True`, than RabbitMQ versions, the field-table integer
    types will not support the full AMQP spec.

    :param enabled: Specify if deprecated RabbitMQ versions are supported

    """
    global DEPRECATED_RABBITMQ_SUPPORT

    DEPRECATED_RABBITMQ_SUPPORT = enabled


def by_type(value: common.FieldValue, data_type: str) -> bytes:
    """Takes a value of any type and tries to encode it with the specified
    encoder.

    :param value: The value to encode
    :type value: :const:`pamqp.common.FieldValue`
    :param data_type: The data type name to use for encoding
    :raises TypeError: when the :data:`data_type` is unknown

    """
    try:
        return METHODS[str(data_type)](value)
    except KeyError:
        raise TypeError('Unknown type: {}'.format(value))


def bit(value: int, byte: int, position: int) -> int:
    """Encode a bit value

    :param value: Value to encode
    :param byte: The byte to apply the value to
    :param position: The position in the byte to set the bit on

    """
    return byte | (value << position)


def boolean(value: bool) -> bytes:
    """Encode a boolean value

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, bool):
        raise TypeError('bool required, received {}'.format(type(value)))
    return common.Struct.short_short_uint.pack(int(value))


def byte_array(value: bytearray) -> bytes:
    """Encode a byte array value

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, bytearray):
        raise TypeError('bytearray required, received {}'.format(type(value)))
    return common.Struct.integer.pack(len(value)) + value


def decimal(value: _decimal.Decimal) -> bytes:
    """Encode a decimal.Decimal value

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, _decimal.Decimal):
        raise TypeError('decimal.Decimal required, received {}'.format(
            type(value)))
    tmp = str(value)
    if '.' in tmp:
        decimals = len(tmp.split('.')[-1])
        value = value.normalize()
        raw = int(value * (_decimal.Decimal(10)**decimals))
        return struct.pack('>Bi', decimals, raw)
    return struct.pack('>Bi', 0, int(value))


def double(value: float) -> bytes:
    """Encode a floating point value as a double

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, float):
        raise TypeError('float required, received {}'.format(type(value)))
    return common.Struct.double.pack(value)


def floating_point(value: float) -> bytes:
    """Encode a floating point value

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, float):
        raise TypeError('float required, received {}'.format(type(value)))
    return common.Struct.float.pack(value)


def long_int(value: int) -> bytes:
    """Encode a long integer

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    elif not (-2147483648 <= value <= 2147483647):
        raise TypeError('Long integer range: -2147483648 to 2147483647')
    return common.Struct.long.pack(value)


def long_uint(value: int) -> bytes:
    """Encode a long unsigned integer

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    elif not (0 <= value <= 4294967295):
        raise TypeError('Long unsigned-integer range: 0 to 4294967295')
    return common.Struct.ulong.pack(value)


def long_long_int(value: int) -> bytes:
    """Encode a long-long int

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    elif not (-9223372036854775808 <= value <= 9223372036854775807):
        raise TypeError('long-long integer range: '
                        '-9223372036854775808 to 9223372036854775807')
    return common.Struct.long_long_int.pack(value)


def long_string(value: str) -> bytes:
    """Encode a "long string"

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    return _string(common.Struct.integer, value)


def octet(value: int) -> bytes:
    """Encode an octet value

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    return common.Struct.byte.pack(value)


def short_int(value: int) -> bytes:
    """Encode a short integer

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    elif not (-32768 <= value <= 32767):
        raise TypeError('Short integer range: -32678 to 32767')
    return common.Struct.short.pack(value)


def short_uint(value: int) -> bytes:
    """Encode an unsigned short integer

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if not isinstance(value, int):
        raise TypeError('int required, received {}'.format(type(value)))
    elif not (0 <= value <= 65535):
        raise TypeError('Short unsigned integer range: 0 to 65535')
    return common.Struct.ushort.pack(value)


def short_string(value: str) -> bytes:
    """ Encode a string

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    return _string(common.Struct.byte, value)


def timestamp(value: typing.Union[datetime.datetime, time.struct_time]) \
        -> bytes:
    """Encode a datetime.datetime object or time.struct_time

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type

    """
    if isinstance(value, datetime.datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            # assume datetime object is UTC
            value = value.replace(tzinfo=datetime.timezone.utc)
        return common.Struct.timestamp.pack(int(value.timestamp()))
    if isinstance(value, time.struct_time):
        return common.Struct.timestamp.pack(calendar.timegm(value))
    raise TypeError(
        'datetime.datetime or time.struct_time required, received {}'.format(
            type(value)))


def field_array(value: common.FieldArray) -> bytes:
    """Encode a field array from a list of values

    :param value: Value to encode
    :type value: :const:`pamqp.common.FieldArray`
    :raises TypeError: when the value is not the correct type

    """
    if not isinstance(value, list):
        raise TypeError('list of values required, received {}'.format(
            type(value)))
    data = []
    for item in value:
        data.append(encode_table_value(item))
    output = b''.join(data)
    return common.Struct.integer.pack(len(output)) + output


def field_table(value: common.FieldTable) -> bytes:
    """Encode a field table from a dict

    :param value: Value to encode
    :type value: :const:`pamqp.common.FieldTable`
    :raises TypeError: when the value is not the correct type

    """
    if not value:  # If there is no value, return a standard 4 null bytes
        return common.Struct.integer.pack(0)
    elif not isinstance(value, dict):
        raise TypeError('dict required, received {}'.format(type(value)))
    data = []
    for key, value in sorted(value.items()):
        if len(key) > 128:  # field names have 128 char max
            LOGGER.warning('Truncating key %s to 128 bytes', key)
            key = key[0:128]
        data.append(short_string(key))
        try:
            data.append(encode_table_value(value))
        except TypeError as err:
            raise TypeError('{} error: {}/'.format(key, err))
    output = b''.join(data)
    return common.Struct.integer.pack(len(output)) + output


def table_integer(value: int) -> bytes:
    """Determines the best type of numeric type to encode value as, preferring
    the smallest data size first.

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if DEPRECATED_RABBITMQ_SUPPORT:
        return _deprecated_table_integer(value)
    if -128 <= value <= 127:
        return b'b' + octet(value)
    elif -32768 <= value <= 32767:
        return b's' + short_int(value)
    elif 0 <= value <= 65535:
        return b'u' + short_uint(value)
    elif -2147483648 <= value <= 2147483647:
        return b'I' + long_int(value)
    elif 0 <= value <= 4294967295:
        return b'i' + long_uint(value)
    elif -9223372036854775808 <= value <= 9223372036854775807:
        return b'l' + long_long_int(value)
    raise TypeError('Unsupported numeric value: {}'.format(value))


def _deprecated_table_integer(value: int) -> bytes:
    """Determines the best type of numeric type to encode value as, preferring
    the smallest data size first, supporting versions of RabbitMQ < 3.6

    :param value: Value to encode
    :raises TypeError: when the value is not the correct type or outside the
        acceptable range for the data type

    """
    if -128 <= value <= 127:
        return b'b' + octet(value)
    elif -32768 <= value <= 32767:
        return b's' + short_int(value)
    elif -2147483648 <= value <= 2147483647:
        return b'I' + long_int(value)
    elif -9223372036854775808 <= value <= 9223372036854775807:
        return b'l' + long_long_int(value)
    raise TypeError('Unsupported numeric value: {}'.format(value))


def _string(encoder: struct.Struct, value: str) -> bytes:
    """Reduce a small amount of duplication in string handling

    :raises: TypeError

    """
    if not isinstance(value, str):
        raise TypeError('str required, received {}'.format(type(value)))
    temp = value.encode('utf-8')
    return encoder.pack(len(temp)) + temp


def encode_table_value(
    value: typing.Union[common.FieldArray, common.FieldTable,
                        common.FieldValue]
) -> bytes:
    """Takes a value of any type and tries to encode it with the proper encoder

    :param value: Value to encode
    :type value: :const:`pamqp.common.FieldArray` or
                 :const:`pamqp.common.FieldTable` or
                 :const:`pamqp.common.FieldValue`
    :raises TypeError: when the type of the value is not supported

    """
    if isinstance(value, bool):
        return b't' + boolean(value)
    elif isinstance(value, int):
        return table_integer(value)
    elif isinstance(value, _decimal.Decimal):
        return b'D' + decimal(value)
    elif isinstance(value, float):
        return b'f' + floating_point(value)
    elif isinstance(value, str):
        return b'S' + long_string(value)
    elif isinstance(value, (datetime.datetime, time.struct_time)):
        return b'T' + timestamp(value)
    elif isinstance(value, dict):
        return b'F' + field_table(value)
    elif isinstance(value, list):
        return b'A' + field_array(value)
    elif isinstance(value, bytearray):
        return b'x' + byte_array(value)
    elif value is None:
        return b'V'
    raise TypeError('Unknown type: {} ({!r})'.format(type(value), value))


METHODS = {
    'bytearray': byte_array,
    'double': double,
    'field_array': field_array,
    'long': long_uint,
    'longlong': long_long_int,
    'longstr': long_string,
    'octet': octet,
    'short': short_uint,
    'shortstr': short_string,
    'table': field_table,
    'timestamp': timestamp,
    'void': lambda _: None,
}
