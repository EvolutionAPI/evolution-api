from array import array
from .protocol import HTTPProtocol

class HttpParser:
    def __init__(self, protocol: HTTPProtocol | object) -> None:
        """The HTTP parser.

        Args:
            protocol (HTTPProtocol): Callback interface for the parser.
        """

    def set_dangerous_leniencies(
        self,
        lenient_headers: bool | None = None,
        lenient_chunked_length: bool | None = None,
        lenient_keep_alive: bool | None = None,
        lenient_transfer_encoding: bool | None = None,
        lenient_version: bool | None = None,
        lenient_data_after_close: bool | None = None,
        lenient_optional_lf_after_cr: bool | None = None,
        lenient_optional_cr_before_lf: bool | None = None,
        lenient_optional_crlf_after_chunk: bool | None = None,
        lenient_spaces_after_chunk_size: bool | None = None,
    ) -> None:
        """Set dangerous leniencies for the parser."""

    def get_http_version(self) -> str:
        """Retrieve the HTTP protocol version e.g. "1.1"."""

    def should_keep_alive(self) -> bool:
        """Return `True` if keep-alive mode is preferred."""

    def should_upgrade(self) -> bool:
        """Return `True` if the parsed request is a valid Upgrade request.
        The method exposes a flag set just before on_headers_complete.
        Calling this method earlier will only yield `False`."""

    def feed_data(self, data: bytes | bytearray | memoryview | array[int]) -> None:
        """Feed data to the parser.

        Will eventually trigger callbacks on the ``protocol`` object.

        On HTTP upgrade, this method will raise an
        ``HttpParserUpgrade`` exception, with its sole argument
        set to the offset of the non-HTTP data in ``data``.
        """

class HttpRequestParser(HttpParser):
    """Used for parsing http requests from the server side."""

    def get_method(self) -> bytes:
        """Retrieve the HTTP method of the request."""

class HttpResponseParser(HttpParser):
    """Used for parsing http responses from the client side."""

    def get_status_code(self) -> int:
        """Retrieve the status code of the HTTP response."""
