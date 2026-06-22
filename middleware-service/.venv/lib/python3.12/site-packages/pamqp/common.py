"""
Common type aliases and classes.

"""
import datetime
import decimal
import struct
import typing

FieldArray = typing.List['FieldValue']
"""A data structure for holding an array of field values."""

FieldTable = typing.Dict[str, 'FieldValue']
"""Field tables are data structures that contain packed name-value pairs.

The name-value pairs are encoded as short string defining the name, and octet
defining the values type and then the value itself. The valid field types for
tables are an extension of the native integer, bit, string, and timestamp
types, and are shown in the grammar. Multi-octet integer fields are always
held in network byte order.

Guidelines for implementers:

- Field names MUST start with a letter, '$' or '#' and may continue with
  letters, `$` or `#`, digits, or underlines, to a maximum length of 128
  characters.
- The server SHOULD validate field names and upon receiving an invalid field
  name, it SHOULD signal a connection exception with reply code 503
  (syntax error).
- Decimal values are not intended to support floating point values, but rather
  fixed-point business values such as currency rates and amounts. They are
  encoded as an octet representing the number of places followed by a long
  signed integer. The 'decimals' octet is not signed.
- Duplicate fields are illegal. The behaviour of a peer with respect to a
  table containing duplicate fields is undefined.

"""

FieldValue = typing.Union[bool, bytes, bytearray, decimal.Decimal, FieldArray,
                          FieldTable, float, int, None, str, datetime.datetime]
"""Defines valid field values for a :const:`FieldTable` and a
:const:`FieldValue`

"""

Arguments = typing.Optional[FieldTable]
"""Defines an AMQP method arguments argument data type"""


class Struct:
    """Simple object for getting to the struct objects for
    :mod:`pamqp.decode` / :mod:`pamqp.encode`.

    """
    byte = struct.Struct('B')
    double = struct.Struct('>d')
    float = struct.Struct('>f')
    integer = struct.Struct('>I')
    uint = struct.Struct('>i')
    long_long_int = struct.Struct('>q')
    short_short_int = struct.Struct('>b')
    short_short_uint = struct.Struct('>B')
    timestamp = struct.Struct('>Q')
    long = struct.Struct('>l')
    ulong = struct.Struct('>L')
    short = struct.Struct('>h')
    ushort = struct.Struct('>H')
