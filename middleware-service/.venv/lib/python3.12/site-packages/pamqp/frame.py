# -*- encoding: utf-8 -*-
"""Manage the marshaling and unmarshaling of AMQP frames

unmarshal will turn a raw AMQP byte stream into the appropriate AMQP objects
from the specification file.

marshal will take an object created from the specification file and turn it
into a raw byte stream.

"""
import logging
import struct
import typing

from pamqp import (base, body, commands, common, constants, decode, exceptions,
                   header, heartbeat)

LOGGER = logging.getLogger(__name__)
UNMARSHAL_FAILURE = 0, 0, None

FrameTypes = typing.Union[base.Frame, body.ContentBody, header.ContentHeader,
                          header.ProtocolHeader, heartbeat.Heartbeat]


def marshal(frame_value: FrameTypes, channel_id: int) -> bytes:
    """Marshal a frame to be sent over the wire.

    :raises: ValueError

    """
    if isinstance(frame_value, header.ProtocolHeader):
        return frame_value.marshal()
    elif isinstance(frame_value, base.Frame):
        return _marshal_method_frame(frame_value, channel_id)
    elif isinstance(frame_value, header.ContentHeader):
        return _marshal_content_header_frame(frame_value, channel_id)
    elif isinstance(frame_value, body.ContentBody):
        return _marshal_content_body_frame(frame_value, channel_id)
    elif isinstance(frame_value, heartbeat.Heartbeat):
        return frame_value.marshal()
    raise ValueError('Could not determine frame type: {}'.format(frame_value))


def unmarshal(data_in: bytes) -> typing.Tuple[int, int, FrameTypes]:
    """Takes in binary data and maps builds the appropriate frame type,
    returning a frame object.

    :returns: tuple of  bytes consumed, channel, and a frame object
    :raises: exceptions.UnmarshalingException

    """
    try:  # Look to see if it's a protocol header frame
        value = _unmarshal_protocol_header_frame(data_in)
    except ValueError as error:
        raise exceptions.UnmarshalingException(header.ProtocolHeader, error)
    else:
        if value:
            return 8, 0, value

    frame_type, channel_id, frame_size = frame_parts(data_in)

    # Heartbeats do not have frame length indicators
    if frame_type == constants.FRAME_HEARTBEAT and frame_size == 0:
        return 8, channel_id, heartbeat.Heartbeat()

    if not frame_size:
        raise exceptions.UnmarshalingException('Unknown', 'No frame size')

    byte_count = constants.FRAME_HEADER_SIZE + frame_size + 1
    if byte_count > len(data_in):
        raise exceptions.UnmarshalingException('Unknown',
                                               'Not all data received')

    if data_in[byte_count - 1] != constants.FRAME_END:
        raise exceptions.UnmarshalingException('Unknown', 'Last byte error')
    frame_data = data_in[constants.FRAME_HEADER_SIZE:byte_count - 1]
    if frame_type == constants.FRAME_METHOD:
        return byte_count, channel_id, _unmarshal_method_frame(frame_data)
    elif frame_type == constants.FRAME_HEADER:
        return byte_count, channel_id, _unmarshal_header_frame(frame_data)
    elif frame_type == constants.FRAME_BODY:
        return byte_count, channel_id, _unmarshal_body_frame(frame_data)
    raise exceptions.UnmarshalingException(
        'Unknown', 'Unknown frame type: {}'.format(frame_type))


def frame_parts(data: bytes) -> typing.Tuple[int, int, typing.Optional[int]]:
    """Attempt to decode a low-level frame, returning frame parts"""
    try:  # Get the Frame Type, Channel Number and Frame Size
        return struct.unpack('>BHI', data[0:constants.FRAME_HEADER_SIZE])
    except struct.error:  # Did not receive a full frame
        return UNMARSHAL_FAILURE


def _marshal(frame_type: int, channel_id: int, payload: bytes) -> bytes:
    """Marshal the low-level AMQ frame"""
    return b''.join([
        struct.pack('>BHI', frame_type, channel_id, len(payload)), payload,
        constants.FRAME_END_CHAR
    ])


def _marshal_content_body_frame(value: body.ContentBody,
                                channel_id: int) -> bytes:
    """Marshal as many content body frames as needed to transmit the content"""
    return _marshal(constants.FRAME_BODY, channel_id, value.marshal())


def _marshal_content_header_frame(value: header.ContentHeader,
                                  channel_id: int) -> bytes:
    """Marshal a content header frame"""
    return _marshal(constants.FRAME_HEADER, channel_id, value.marshal())


def _marshal_method_frame(value: base.Frame, channel_id: int) -> bytes:
    """Marshal a method frame"""
    return _marshal(constants.FRAME_METHOD, channel_id,
                    common.Struct.integer.pack(value.index) + value.marshal())


def _unmarshal_protocol_header_frame(data_in: bytes) \
        -> typing.Optional[header.ProtocolHeader]:
    """Attempt to unmarshal a protocol header frame

    The ProtocolHeader is abbreviated in size and functionality compared to
    the rest of the frame types, so return UNMARSHAL_ERROR doesn't apply
    as cleanly since we don't have all of the attributes to return even
    regardless of success or failure.

    :raises: ValueError

    """
    if data_in[0:4] == constants.AMQP:  # Do the first four bytes match?
        frame = header.ProtocolHeader()
        frame.unmarshal(data_in)
        return frame
    return None


def _unmarshal_method_frame(frame_data: bytes) -> base.Frame:
    """Attempt to unmarshal a method frame

    :raises: pamqp.exceptions.UnmarshalingException

    """
    bytes_used, method_index = decode.long_int(frame_data[0:4])
    try:
        method = commands.INDEX_MAPPING[method_index]()
    except KeyError:
        raise exceptions.UnmarshalingException(
            'Unknown', 'Unknown method index: {}'.format(str(method_index)))
    try:
        method.unmarshal(frame_data[bytes_used:])
    except struct.error as error:
        raise exceptions.UnmarshalingException(method, error)
    return method


def _unmarshal_header_frame(frame_data: bytes) -> header.ContentHeader:
    """Attempt to unmarshal a header frame

    :raises: pamqp.exceptions.UnmarshalingException

    """
    content_header = header.ContentHeader()
    try:
        content_header.unmarshal(frame_data)
    except struct.error as error:
        raise exceptions.UnmarshalingException('ContentHeader', error)
    return content_header


def _unmarshal_body_frame(frame_data: bytes) -> body.ContentBody:
    """Attempt to unmarshal a body frame"""
    content_body = body.ContentBody(b'')
    content_body.unmarshal(frame_data)
    return content_body
