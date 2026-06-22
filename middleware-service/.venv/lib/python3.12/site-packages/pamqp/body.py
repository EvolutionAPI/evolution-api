# -*- encoding: utf-8 -*-
"""
The :py:mod:`pamqp.body` module contains the :py:class:`Body` class which is
used when unmarshalling body frames. When dealing with content frames, the
message body will be returned from the library as an instance of the body
class.

"""


class ContentBody:
    """ContentBody carries the value for an AMQP message body frame

    :param value: The value for the ContentBody frame

    """
    name = 'ContentBody'

    def __init__(self, value: bytes):
        """Create a new instance of a ContentBody object"""
        self.value = value

    def __len__(self) -> int:
        """Return the length of the content body value"""
        return len(self.value) if self.value else 0

    def marshal(self) -> bytes:
        """Return the marshaled content body. This method is here for API
        compatibility, there is no special marshaling for the payload in a
        content frame.

        """
        return self.value

    def unmarshal(self, data: bytes) -> None:
        """Apply the data to the object. This method is here for API
        compatibility, there is no special unmarshalling for the payload in a
        content frame.

        :param data: The content body data from the frame

        """
        self.value = data
